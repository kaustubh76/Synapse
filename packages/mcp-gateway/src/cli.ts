#!/usr/bin/env node
// ============================================================
// SYNAPSE MCP CLIENT - CLI for stdio transport
// Use this with Claude Desktop or other MCP clients
// ============================================================

import { MCPHandler } from './mcp-handler.js';
import type { MCPRequest } from './types.js';
import * as readline from 'readline';

const handler = new MCPHandler();

// Parse command line arguments
const args = process.argv.slice(2);
let gatewayUrl = 'http://localhost:3001';
let budget = 10.0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--gateway' && args[i + 1]) {
    gatewayUrl = args[i + 1];
    i++;
  } else if (args[i] === '--budget' && args[i + 1]) {
    budget = parseFloat(args[i + 1]);
    i++;
  }
}

// Set API URL environment variable
process.env.SYNAPSE_API_URL = gatewayUrl;

// Read from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let buffer = '';

rl.on('line', async (line) => {
  buffer += line;

  try {
    const request = JSON.parse(buffer) as MCPRequest;
    buffer = '';

    // Process the request
    const response = await handler.processRequest(request);

    // Write response to stdout
    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (error) {
    // Not a complete JSON yet, continue buffering
    if (!(error instanceof SyntaxError)) {
      console.error('[MCP CLI] Error:', error);
      buffer = '';
    }
  }
});

rl.on('close', () => {
  process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('[MCP CLI] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[MCP CLI] Unhandled rejection:', reason);
});

// Log startup
console.error(`[Synapse MCP Client] Connected to ${gatewayUrl} with $${budget} budget`);
