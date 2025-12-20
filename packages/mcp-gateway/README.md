# @synapse/mcp-gateway

MCP (Model Context Protocol) Gateway for Synapse Intent Network. This package allows AI agents to access the Synapse network through the standardized MCP protocol.

## Features

- **MCP Protocol Compliance** - Full MCP 2024-11-05 protocol support
- **Multiple Transports** - SSE, WebSocket, and HTTP streaming
- **Dynamic Tool Generation** - Tools auto-generated from provider capabilities
- **Session Management** - Budget tracking and transaction history
- **x402 Payments** - Integrated micropayment support

## Installation

```bash
npm install @synapse/mcp-gateway
```

## Usage

### As a Server

Start the MCP Gateway server:

```bash
# Using npm script
npm run start

# Or directly
node dist/server.js
```

The server exposes:
- **SSE**: `http://localhost:3002/mcp/sse`
- **WebSocket**: `ws://localhost:3002/mcp/ws`
- **HTTP**: `http://localhost:3002/mcp/http`

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "synapse": {
      "command": "npx",
      "args": [
        "-y",
        "@synapse/mcp-gateway",
        "--gateway", "http://localhost:3001",
        "--budget", "10.00"
      ]
    }
  }
}
```

### Programmatic Usage

```typescript
import { MCPHandler, getSessionManager, getToolGenerator } from '@synapse/mcp-gateway';

const handler = new MCPHandler();

// Process MCP requests
const response = await handler.processRequest({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {}
});
```

## MCP Tools

### Synapse Core Tools

| Tool | Description |
|------|-------------|
| `synapse_execute_intent` | Execute any intent with competitive bidding |
| `synapse_get_quote` | Get price quotes without execution |
| `synapse_list_capabilities` | List all provider capabilities |
| `synapse_check_balance` | Check session budget and history |
| `synapse_get_providers` | Get providers for a capability |

### Dynamic Provider Tools

Tools are automatically generated from registered providers:

| Tool | Capability | Description |
|------|------------|-------------|
| `crypto_get_price` | `crypto.price` | Get cryptocurrency price |
| `crypto_get_history` | `crypto.history` | Get historical price data |
| `weather_get_current` | `weather.current` | Get current weather |
| `weather_get_forecast` | `weather.forecast` | Get weather forecast |
| `news_get_latest` | `news.latest` | Get latest news |
| `news_search` | `news.search` | Search news articles |

## MCP Resources

| URI | Description |
|-----|-------------|
| `synapse://providers` | List of available providers |
| `synapse://capabilities` | Full capability registry |
| `synapse://session` | Current session information |

## Synapse Extensions

Custom MCP methods for Synapse-specific functionality:

| Method | Description |
|--------|-------------|
| `synapse/authenticate` | Authenticate with x402 token and budget |
| `synapse/getBalance` | Get current budget balance |
| `synapse/getHistory` | Get transaction history |
| `synapse/closeSession` | Close session and settle |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_GATEWAY_PORT` | `3002` | Server port |
| `SYNAPSE_API_URL` | `http://localhost:3001` | Synapse API URL |
| `CORS_ORIGIN` | `http://localhost:3000` | CORS allowed origin |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (with hot reload)
npm run dev

# Run CLI mode
npm run cli
```

## Protocol Flow

```
AI Agent (Claude)                    Synapse MCP Gateway                    Providers
     |                                       |                                   |
     |------ initialize ------------------>  |                                   |
     |<----- session created --------------  |                                   |
     |                                       |                                   |
     |------ tools/list ------------------>  |                                   |
     |<----- available tools --------------  |                                   |
     |                                       |                                   |
     |------ tools/call ------------------>  |                                   |
     |       crypto_get_price(BTC)           |                                   |
     |                                       |---> Create Intent --------------> |
     |<----- progress: bidding ------------- |                                   |
     |                                       |<--- Bid: $0.003 ----------------- |
     |                                       |<--- Bid: $0.002 ----------------- |
     |<----- progress: executing ----------- |                                   |
     |                                       |---> Execute with winner --------> |
     |                                       |<--- Result ---------------------- |
     |<----- result: BTC $104,250 ---------- |                                   |
     |                                       |                                   |
```

## License

MIT
