// ============================================================
// SYNAPSE MCP GATEWAY - Server
// Express server with SSE and WebSocket MCP transports
// ============================================================

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { MCPHandler } from './mcp-handler.js';
import { getSessionManager } from './session-manager.js';
import { getToolGenerator } from './tool-generator.js';
import type { MCPRequest, MCPResponse, MCPNotification } from './types.js';

const PORT = process.env.MCP_GATEWAY_PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Track SSE connections
const sseConnections = new Map<string, Response>();

// Track WebSocket handlers
const wsHandlers = new Map<string, MCPHandler>();

async function main(): Promise<void> {
  const app = express();
  const server = createServer(app);

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
    res.header('Access-Control-Expose-Headers', 'X-Payment-Response');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  // Socket.IO setup for WebSocket transport
  const io = new SocketIOServer(server, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    path: '/mcp/ws',
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'synapse-mcp-gateway',
      version: '1.0.0',
      timestamp: Date.now(),
    });
  });

  // MCP info endpoint
  app.get('/mcp', (req, res) => {
    const toolGenerator = getToolGenerator();
    res.json({
      name: 'synapse-mcp-gateway',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      transports: {
        sse: '/mcp/sse',
        websocket: '/mcp/ws',
        http: '/mcp/http',
      },
      capabilities: {
        tools: toolGenerator.getAllTools().length,
        resources: true,
        prompts: true,
      },
    });
  });

  // ============================================================
  // SSE TRANSPORT
  // ============================================================

  // SSE endpoint - bidirectional via separate message endpoint
  app.get('/mcp/sse', (req, res) => {
    const sessionId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Store connection
    sseConnections.set(sessionId, res);

    // Create handler for this connection
    const handler = new MCPHandler();

    // Forward progress notifications to SSE
    handler.on('progress', (data) => {
      sendSSE(res, 'progress', data);
    });

    // Send session ID
    sendSSE(res, 'session', { sessionId });

    // Handle disconnect
    req.on('close', () => {
      sseConnections.delete(sessionId);
      console.log(`[MCP SSE] Connection closed: ${sessionId}`);
    });

    console.log(`[MCP SSE] New connection: ${sessionId}`);
  });

  // SSE message endpoint - receive MCP requests
  app.post('/mcp/sse/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const sseRes = sseConnections.get(sessionId);

    if (!sseRes) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const request = req.body as MCPRequest;
    const handler = new MCPHandler();

    // Extract x402 payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    handler.setPaymentHeader(paymentHeader);

    try {
      const response = await handler.processRequest(request);

      // If 402 response, add payment header to SSE
      if (response.error?.code === 402 && response.error.data) {
        const data = response.error.data as { header?: string };
        if (data.header) {
          sendSSE(sseRes, 'payment_required', {
            ...response,
            paymentHeader: data.header,
          });
        }
      }

      // Send response via SSE
      sendSSE(sseRes, 'message', response);

      // Also return via HTTP for confirmation
      res.json({ received: true, id: request.id });
    } catch (error) {
      console.error('[MCP SSE] Error:', error);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ============================================================
  // HTTP STREAMABLE TRANSPORT
  // ============================================================

  // Track HTTP session handlers by session ID header
  const httpHandlers = new Map<string, MCPHandler>();

  app.post('/mcp/http', async (req, res) => {
    const request = req.body as MCPRequest;

    // Support session persistence via header
    const sessionHeader = req.headers['x-mcp-session'] as string | undefined;
    let handler: MCPHandler;

    if (sessionHeader && httpHandlers.has(sessionHeader)) {
      handler = httpHandlers.get(sessionHeader)!;
    } else {
      handler = new MCPHandler();
      // Auto-initialize for stateless HTTP requests
      if (request.method !== 'initialize') {
        await handler.processRequest({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'http-client', version: '1.0.0' }
          }
        });
      }
    }

    // Extract x402 payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    handler.setPaymentHeader(paymentHeader);

    // Set up streaming response
    res.setHeader('Content-Type', 'application/json');

    // Forward progress as newline-delimited JSON
    handler.on('progress', (data) => {
      res.write(JSON.stringify({ type: 'progress', data }) + '\n');
    });

    // Forward x402 events
    handler.on('x402:payment_required', (data) => {
      res.write(JSON.stringify({ type: 'x402:payment_required', data }) + '\n');
    });
    handler.on('x402:payment_verified', (data) => {
      res.write(JSON.stringify({ type: 'x402:payment_verified', data }) + '\n');
    });

    try {
      const response = await handler.processRequest(request);

      // Store handler if session was created
      const result = response.result as Record<string, unknown> | undefined;
      if (request.method === 'initialize' && result?._synapse) {
        const synapseData = result._synapse as { sessionId?: string };
        if (synapseData.sessionId) {
          const sid = synapseData.sessionId;
          httpHandlers.set(sid, handler);
          res.setHeader('X-MCP-Session', sid);
        }
      }

      // If 402 response, add X-Payment-Response header
      if (response.error?.code === 402 && response.error.data) {
        const data = response.error.data as { header?: string };
        if (data.header) {
          res.setHeader('X-Payment-Response', data.header);
        }
      }

      res.write(JSON.stringify({ type: 'result', data: response }) + '\n');
      res.end();
    } catch (error) {
      console.error('[MCP HTTP] Error:', error);
      res.write(
        JSON.stringify({
          type: 'error',
          data: {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32603, message: 'Internal error' },
          },
        }) + '\n'
      );
      res.end();
    }
  });

  // Simple HTTP endpoint (non-streaming) - auto-initializes session
  app.post('/mcp/message', async (req, res) => {
    const request = req.body as MCPRequest;
    const handler = new MCPHandler();

    // Extract x402 payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;
    handler.setPaymentHeader(paymentHeader);

    // Auto-initialize for stateless requests
    if (request.method !== 'initialize') {
      await handler.processRequest({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'http-client', version: '1.0.0' }
        }
      });
    }

    try {
      const response = await handler.processRequest(request);

      // If 402 response, add X-Payment-Response header
      if (response.error?.code === 402 && response.error.data) {
        const data = response.error.data as { header?: string };
        if (data.header) {
          res.setHeader('X-Payment-Response', data.header);
        }
      }

      res.json(response);
    } catch (error) {
      console.error('[MCP Message] Error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32603, message: 'Internal error' },
      });
    }
  });

  // ============================================================
  // WEBSOCKET TRANSPORT
  // ============================================================

  io.on('connection', (socket) => {
    console.log(`[MCP WS] New connection: ${socket.id}`);

    const handler = new MCPHandler();
    wsHandlers.set(socket.id, handler);

    // Forward progress notifications
    handler.on('progress', (data) => {
      socket.emit('notification', {
        jsonrpc: '2.0',
        method: 'synapse/progress',
        params: data,
      });
    });

    // Forward x402 payment events
    handler.on('x402:payment_required', (data) => {
      socket.emit('notification', {
        jsonrpc: '2.0',
        method: 'x402/paymentRequired',
        params: data,
      });
    });
    handler.on('x402:payment_received', (data) => {
      socket.emit('notification', {
        jsonrpc: '2.0',
        method: 'x402/paymentReceived',
        params: data,
      });
    });
    handler.on('x402:payment_verified', (data) => {
      socket.emit('notification', {
        jsonrpc: '2.0',
        method: 'x402/paymentVerified',
        params: data,
      });
    });

    // Handle MCP messages with x402 payment support
    socket.on('message', async (request: MCPRequest & { _x402?: { payment?: string } }) => {
      try {
        // Extract x402 payment from message payload
        if (request._x402?.payment) {
          handler.setPaymentHeader(request._x402.payment);
        }

        const response = await handler.processRequest(request);
        socket.emit('message', response);
      } catch (error) {
        console.error('[MCP WS] Error:', error);
        socket.emit('message', {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: 'Internal error' },
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      wsHandlers.delete(socket.id);
      console.log(`[MCP WS] Disconnected: ${socket.id}`);
    });
  });

  // ============================================================
  // START SERVER
  // ============================================================

  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║   🧠 SYNAPSE MCP GATEWAY                                           ║
║                                                                    ║
║   Server running on port ${PORT}                                      ║
║                                                                    ║
║   Transports:                                                      ║
║   • SSE:       http://localhost:${PORT}/mcp/sse                       ║
║   • WebSocket: ws://localhost:${PORT}/mcp/ws                          ║
║   • HTTP:      http://localhost:${PORT}/mcp/http                      ║
║                                                                    ║
║   Info:        http://localhost:${PORT}/mcp                           ║
║   Health:      http://localhost:${PORT}/health                        ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
    `);
  });
}

/**
 * Send SSE event
 */
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Run server
main().catch(console.error);
