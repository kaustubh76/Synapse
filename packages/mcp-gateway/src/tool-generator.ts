// ============================================================
// SYNAPSE MCP GATEWAY - Dynamic Tool Generator
// Generates MCP tools from Synapse provider capabilities
// ============================================================

import type { SynapseMCPTool, ProviderCapability, ToolIntentMapping } from './types.js';

// Map domain names to valid API categories
const DOMAIN_TO_CATEGORY: Record<string, string> = {
  weather: 'data',
  crypto: 'data',
  news: 'data',
  search: 'search',
  compute: 'compute',
  ai: 'ai',
  transaction: 'transaction',
};

function domainToCategory(domain: string): string {
  return DOMAIN_TO_CATEGORY[domain] || 'data';
}

// Synapse core tools (always available)
const SYNAPSE_CORE_TOOLS: SynapseMCPTool[] = [
  {
    name: 'synapse_execute_intent',
    description:
      'Execute any intent on the Synapse network with competitive bidding. Use this for custom intent types not covered by specific tools.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Intent type (e.g., "weather.current", "crypto.price")',
        },
        params: {
          type: 'object',
          description: 'Parameters for the intent',
        },
        maxBudget: {
          type: 'number',
          description: 'Maximum budget in USD for this intent',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
        },
      },
      required: ['type', 'params'],
    },
    _synapse: {
      capability: 'synapse.execute',
      estimatedPrice: 'varies',
      providers: 0,
      avgLatency: 5000,
      category: 'core',
    },
  },
  {
    name: 'synapse_get_quote',
    description:
      'Get price quotes for an intent without executing it. Useful for cost estimation.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Intent type to get quotes for',
        },
        params: {
          type: 'object',
          description: 'Parameters for the intent',
        },
      },
      required: ['type'],
    },
    _synapse: {
      capability: 'synapse.quote',
      estimatedPrice: 'free',
      providers: 0,
      avgLatency: 1000,
      category: 'core',
    },
  },
  {
    name: 'synapse_list_capabilities',
    description:
      'List all available provider capabilities on the Synapse network.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g., "data", "compute")',
        },
      },
    },
    _synapse: {
      capability: 'synapse.list',
      estimatedPrice: 'free',
      providers: 0,
      avgLatency: 100,
      category: 'core',
    },
  },
  {
    name: 'synapse_check_balance',
    description: 'Check your current x402 payment balance and transaction history.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    _synapse: {
      capability: 'synapse.balance',
      estimatedPrice: 'free',
      providers: 0,
      avgLatency: 50,
      category: 'core',
    },
  },
  {
    name: 'synapse_get_providers',
    description: 'Get information about available providers for a capability.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description: 'Capability name (e.g., "weather.current")',
        },
      },
      required: ['capability'],
    },
    _synapse: {
      capability: 'synapse.providers',
      estimatedPrice: 'free',
      providers: 0,
      avgLatency: 100,
      category: 'core',
    },
  },
];

/**
 * Convert capability name to MCP tool name
 * e.g., "crypto.price" -> "crypto_get_price"
 */
function capabilityToToolName(capability: string): string {
  const parts = capability.split('.');
  if (parts.length < 2) return capability.replace(/[^a-z0-9]/gi, '_');

  const domain = parts[0];
  const action = parts.slice(1).join('_');

  // Determine if we need "get_" prefix
  const verbPrefixes = ['get', 'list', 'search', 'create', 'update', 'delete'];
  const needsPrefix = !verbPrefixes.some((v) => action.startsWith(v));

  return needsPrefix ? `${domain}_get_${action}` : `${domain}_${action}`;
}

/**
 * Convert MCP tool name back to intent type
 * e.g., "crypto_get_price" -> "crypto.price"
 */
export function toolNameToIntentType(toolName: string): string {
  // Handle Synapse core tools
  if (toolName.startsWith('synapse_')) {
    return toolName;
  }

  const parts = toolName.split('_');
  if (parts.length < 2) return toolName;

  const domain = parts[0];
  // Remove "get_" prefix if present
  let actionParts = parts.slice(1);
  if (actionParts[0] === 'get') {
    actionParts = actionParts.slice(1);
  }

  return `${domain}.${actionParts.join('_')}`;
}

/**
 * Generate MCP tool definition from a provider capability
 */
function generateToolFromCapability(capability: ProviderCapability): SynapseMCPTool {
  const toolName = capabilityToToolName(capability.name);

  return {
    name: toolName,
    description: capability.description,
    inputSchema: {
      type: 'object',
      properties: capability.inputSchema as Record<string, unknown>,
      required: (capability.inputSchema as any)?.required || [],
    },
    _synapse: {
      capability: capability.name,
      estimatedPrice: `$${capability.pricing.basePrice.toFixed(4)}${
        capability.pricing.maxPrice
          ? ` - $${capability.pricing.maxPrice.toFixed(4)}`
          : ''
      }`,
      providers: capability.providers.length,
      avgLatency: capability.sla?.avgResponseTime || 1000,
      category: domainToCategory(capability.name.split('.')[0]),
    },
  };
}

/**
 * Tool Generator class
 */
export class ToolGenerator {
  private capabilities: Map<string, ProviderCapability> = new Map();
  private tools: Map<string, SynapseMCPTool> = new Map();
  private mappings: Map<string, ToolIntentMapping> = new Map();

  constructor() {
    // Initialize with core tools
    for (const tool of SYNAPSE_CORE_TOOLS) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Register a provider capability
   */
  registerCapability(capability: ProviderCapability): void {
    this.capabilities.set(capability.name, capability);

    // Generate MCP tool
    const tool = generateToolFromCapability(capability);
    this.tools.set(tool.name, tool);

    // Create mapping
    const mapping: ToolIntentMapping = {
      toolName: tool.name,
      intentType: capability.name,
      category: domainToCategory(capability.name.split('.')[0]),
      defaultBudget: capability.pricing.maxPrice || capability.pricing.basePrice * 2,
      defaultTimeout: (capability.sla?.maxResponseTime || 10000) + 2000,
    };
    this.mappings.set(tool.name, mapping);
  }

  /**
   * Update capabilities from provider registry
   */
  updateFromProviderRegistry(providers: Array<{
    id: string;
    name: string;
    capabilities: string[];
    reputationScore: number;
    endpoint?: string;
  }>): void {
    // Group providers by capability
    const capabilityProviders = new Map<string, Array<{ id: string; name: string; reputation: number }>>();

    for (const provider of providers) {
      for (const cap of provider.capabilities) {
        if (!capabilityProviders.has(cap)) {
          capabilityProviders.set(cap, []);
        }
        capabilityProviders.get(cap)!.push({
          id: provider.id,
          name: provider.name,
          reputation: provider.reputationScore,
        });
      }
    }

    // Update or create capabilities
    for (const [capName, providerList] of capabilityProviders) {
      const existing = this.capabilities.get(capName);

      const capability: ProviderCapability = existing || {
        name: capName,
        description: this.generateDescription(capName),
        inputSchema: this.generateInputSchema(capName),
        pricing: {
          basePrice: 0.005,
          maxPrice: 0.02,
          dynamicPricing: true,
        },
        sla: {
          avgResponseTime: 500,
          maxResponseTime: 5000,
        },
        providers: [],
      };

      capability.providers = providerList;
      this.registerCapability(capability);
    }
  }

  /**
   * Generate a description for a capability
   */
  private generateDescription(capability: string): string {
    const descriptions: Record<string, string> = {
      'weather.current': 'Get current weather conditions for a location',
      'weather.forecast': 'Get weather forecast for a location',
      'crypto.price': 'Get current cryptocurrency price',
      'crypto.history': 'Get historical cryptocurrency price data',
      'news.latest': 'Get latest news articles on a topic',
      'news.search': 'Search for news articles',
    };

    if (descriptions[capability]) {
      return descriptions[capability];
    }

    const [domain, action] = capability.split('.');
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${domain} data from the Synapse network`;
  }

  /**
   * Generate input schema for a capability
   */
  private generateInputSchema(capability: string): Record<string, unknown> {
    const schemas: Record<string, Record<string, unknown>> = {
      'weather.current': {
        city: { type: 'string', description: 'City name' },
      },
      'weather.forecast': {
        city: { type: 'string', description: 'City name' },
        days: { type: 'number', description: 'Number of forecast days', default: 5 },
      },
      'crypto.price': {
        symbol: { type: 'string', description: 'Cryptocurrency symbol (e.g., BTC, ETH)' },
      },
      'crypto.history': {
        symbol: { type: 'string', description: 'Cryptocurrency symbol' },
        days: { type: 'number', description: 'Number of days of history', default: 7 },
      },
      'news.latest': {
        topic: { type: 'string', description: 'Topic to get news about' },
        count: { type: 'number', description: 'Number of articles', default: 5 },
      },
      'news.search': {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
      },
    };

    return schemas[capability] || { input: { type: 'string', description: 'Input data' } };
  }

  /**
   * Get all tools
   */
  getAllTools(): SynapseMCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool by name
   */
  getTool(name: string): SynapseMCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get mapping for a tool
   */
  getMapping(toolName: string): ToolIntentMapping | undefined {
    return this.mappings.get(toolName);
  }

  /**
   * Check if tool is a Synapse core tool
   */
  isCoreTools(toolName: string): boolean {
    return toolName.startsWith('synapse_');
  }

  /**
   * Get tools filtered by category
   */
  getToolsByCategory(category: string): SynapseMCPTool[] {
    return this.getAllTools().filter(
      (tool) => tool._synapse?.category === category
    );
  }

  /**
   * Get capability from tool name
   */
  getCapabilityFromTool(toolName: string): string {
    const mapping = this.mappings.get(toolName);
    if (mapping) {
      return mapping.intentType;
    }
    return toolNameToIntentType(toolName);
  }
}

// Singleton instance
let toolGenerator: ToolGenerator | null = null;

export function getToolGenerator(): ToolGenerator {
  if (!toolGenerator) {
    toolGenerator = new ToolGenerator();
  }
  return toolGenerator;
}
