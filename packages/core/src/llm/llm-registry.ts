// ============================================================
// SYNAPSE LLM REGISTRY - Model Discovery & Management
// ============================================================

import { EventEmitter } from 'events';
import {
  LLMProvider,
  LLMModel,
  LLMProviderId,
} from './types.js';

// -------------------- DEFAULT MODELS --------------------

const DEFAULT_MODELS: LLMModel[] = [
  // OpenAI Models
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00,
    avgLatencyMs: 2000,
    avgQualityScore: 92,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'premium',
    specialties: ['coding', 'analysis', 'reasoning'],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 5.00,
    outputPricePerMillion: 15.00,
    avgLatencyMs: 1500,
    avgQualityScore: 90,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'premium',
    specialties: ['general', 'creative', 'multimodal'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    avgLatencyMs: 800,
    avgQualityScore: 82,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'budget',
    specialties: ['general', 'fast'],
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 1.50,
    avgLatencyMs: 600,
    avgQualityScore: 75,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'budget',
    specialties: ['general', 'fast'],
  },

  // Anthropic Models
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    avgLatencyMs: 1800,
    avgQualityScore: 94,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'premium',
    specialties: ['coding', 'analysis', 'creative'],
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    avgLatencyMs: 800,
    avgQualityScore: 85,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['fast', 'efficient'],
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    avgLatencyMs: 3000,
    avgQualityScore: 95,
    successRate: 0.98,
    totalRequests: 0,
    tier: 'premium',
    specialties: ['complex-reasoning', 'analysis'],
  },

  // Google Models (Gemini 2.x - Latest)
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    avgLatencyMs: 350,
    avgQualityScore: 88,
    successRate: 0.99,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['fast', 'reasoning', 'multimodal'],
  },

  // Ollama / Local Models (Self-hosted)
  {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    provider: 'ollama',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.00,  // Self-hosted
    outputPricePerMillion: 0.00,
    avgLatencyMs: 3000,
    avgQualityScore: 85,
    successRate: 0.95,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['open-source', 'self-hosted'],
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    provider: 'ollama',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.00,
    outputPricePerMillion: 0.00,
    avgLatencyMs: 500,
    avgQualityScore: 72,
    successRate: 0.95,
    totalRequests: 0,
    tier: 'budget',
    specialties: ['open-source', 'fast', 'self-hosted'],
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B',
    provider: 'ollama',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.00,
    outputPricePerMillion: 0.00,
    avgLatencyMs: 400,
    avgQualityScore: 70,
    successRate: 0.95,
    totalRequests: 0,
    tier: 'budget',
    specialties: ['open-source', 'fast', 'self-hosted'],
  },
  {
    id: 'qwen2.5:72b',
    name: 'Qwen 2.5 72B',
    provider: 'ollama',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.00,
    outputPricePerMillion: 0.00,
    avgLatencyMs: 2500,
    avgQualityScore: 88,
    successRate: 0.94,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['open-source', 'multilingual', 'self-hosted'],
  },

  // Together AI (OpenAI-compatible, fast inference)
  {
    id: 'meta-llama/Llama-3.1-405B-Instruct-Turbo',
    name: 'Llama 3.1 405B Turbo',
    provider: 'together',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 3.50,
    outputPricePerMillion: 3.50,
    avgLatencyMs: 2000,
    avgQualityScore: 90,
    successRate: 0.97,
    totalRequests: 0,
    tier: 'premium',
    specialties: ['open-source', 'powerful'],
  },
  {
    id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
    name: 'Mixtral 8x22B',
    provider: 'together',
    contextWindow: 65536,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.90,
    outputPricePerMillion: 0.90,
    avgLatencyMs: 1500,
    avgQualityScore: 82,
    successRate: 0.97,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['open-source', 'efficient'],
  },

  // Groq (Ultra-fast inference)
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    contextWindow: 128000,
    maxOutputTokens: 8000,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.59,
    outputPricePerMillion: 0.79,
    avgLatencyMs: 300,
    avgQualityScore: 85,
    successRate: 0.98,
    totalRequests: 0,
    tier: 'standard',
    specialties: ['ultra-fast', 'open-source'],
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant (Groq)',
    provider: 'groq',
    contextWindow: 128000,
    maxOutputTokens: 8000,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    supportsJson: true,
    inputPricePerMillion: 0.05,
    outputPricePerMillion: 0.08,
    avgLatencyMs: 150,
    avgQualityScore: 75,
    successRate: 0.98,
    totalRequests: 0,
    tier: 'budget',
    specialties: ['ultra-fast', 'efficient'],
  },
];

const DEFAULT_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4 and GPT-3.5 models',
    models: [],
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'api_key',
    status: 'online',
    lastHealthCheck: Date.now(),
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 3 family of models',
    models: [],
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    authType: 'api_key',
    status: 'online',
    lastHealthCheck: Date.now(),
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models',
    models: [],
    apiType: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authType: 'api_key',
    status: 'online',
    lastHealthCheck: Date.now(),
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Self-hosted open source models',
    models: [],
    apiType: 'ollama',
    baseUrl: 'http://localhost:11434',
    authType: 'none',
    status: 'offline',
    lastHealthCheck: Date.now(),
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Fast inference for open source models',
    models: [],
    apiType: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    authType: 'api_key',
    status: 'online',
    lastHealthCheck: Date.now(),
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast LPU inference',
    models: [],
    apiType: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    authType: 'api_key',
    status: 'online',
    lastHealthCheck: Date.now(),
  },
];

// -------------------- LLM REGISTRY CLASS --------------------

export class LLMRegistry extends EventEmitter {
  private providers: Map<LLMProviderId, LLMProvider> = new Map();
  private models: Map<string, LLMModel> = new Map();
  private apiKeys: Map<LLMProviderId, string> = new Map();

  constructor() {
    super();
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    // Initialize providers
    for (const provider of DEFAULT_PROVIDERS) {
      this.providers.set(provider.id, { ...provider, models: [] });
    }

    // Initialize models and link to providers
    for (const model of DEFAULT_MODELS) {
      this.models.set(model.id, model);
      const provider = this.providers.get(model.provider);
      if (provider) {
        provider.models.push(model);
      }
    }
  }

  // -------------------- API Key Management --------------------

  setApiKey(providerId: LLMProviderId, apiKey: string): void {
    this.apiKeys.set(providerId, apiKey);
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.status = 'online';
      this.emit('provider_configured', { providerId, status: 'online' });
    }
  }

  getApiKey(providerId: LLMProviderId): string | undefined {
    return this.apiKeys.get(providerId);
  }

  hasApiKey(providerId: LLMProviderId): boolean {
    return this.apiKeys.has(providerId);
  }

  // -------------------- Provider Management --------------------

  getProvider(providerId: LLMProviderId): LLMProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(p => {
      // Provider is available if it's online and has an API key (or doesn't need one)
      if (p.authType === 'none') return p.status === 'online';
      return p.status === 'online' && this.hasApiKey(p.id);
    });
  }

  async checkProviderHealth(providerId: LLMProviderId): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    try {
      // Simple health check based on provider type
      if (provider.id === 'ollama') {
        const response = await fetch(`${provider.baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        const isHealthy = response.ok;
        provider.status = isHealthy ? 'online' : 'offline';
        provider.lastHealthCheck = Date.now();
        return isHealthy;
      }

      // For API-based providers, just check if we have an API key
      const hasKey = this.hasApiKey(providerId);
      provider.status = hasKey ? 'online' : 'offline';
      provider.lastHealthCheck = Date.now();
      return hasKey;

    } catch {
      provider.status = 'offline';
      provider.lastHealthCheck = Date.now();
      return false;
    }
  }

  // -------------------- Model Management --------------------

  getModel(modelId: string): LLMModel | undefined {
    return this.models.get(modelId);
  }

  getAllModels(): LLMModel[] {
    return Array.from(this.models.values());
  }

  getAvailableModels(): LLMModel[] {
    const availableProviders = new Set(
      this.getAvailableProviders().map(p => p.id)
    );
    return Array.from(this.models.values()).filter(
      m => availableProviders.has(m.provider)
    );
  }

  getModelsByProvider(providerId: LLMProviderId): LLMModel[] {
    return Array.from(this.models.values()).filter(
      m => m.provider === providerId
    );
  }

  getModelsByTier(tier: 'premium' | 'standard' | 'budget'): LLMModel[] {
    return this.getAvailableModels().filter(m => m.tier === tier);
  }

  getModelsBySpecialty(specialty: string): LLMModel[] {
    return this.getAvailableModels().filter(
      m => m.specialties.includes(specialty)
    );
  }

  // -------------------- Model Selection --------------------

  selectModelsForComparison(options: {
    models?: string[];
    tier?: 'premium' | 'balanced' | 'budget' | 'all';
    minModels?: number;
    maxModels?: number;
    excludeModels?: string[];
    specialties?: string[];
  }): LLMModel[] {
    const {
      models: specificModels,
      tier = 'balanced',
      minModels = 3,
      maxModels = 5,
      excludeModels = [],
      specialties,
    } = options;

    let candidates: LLMModel[];

    // If specific models requested, use those
    if (specificModels && specificModels.length > 0) {
      candidates = specificModels
        .map(id => this.getModel(id))
        .filter((m): m is LLMModel => m !== undefined)
        .filter(m => !excludeModels.includes(m.id));
    } else {
      // Get available models
      candidates = this.getAvailableModels().filter(
        m => !excludeModels.includes(m.id)
      );

      // Filter by tier
      if (tier !== 'all') {
        if (tier === 'balanced') {
          // Mix of tiers
          candidates = candidates;
        } else {
          candidates = candidates.filter(m => m.tier === tier);
        }
      }

      // Filter by specialties if specified
      if (specialties && specialties.length > 0) {
        candidates = candidates.filter(
          m => specialties.some(s => m.specialties.includes(s))
        );
      }
    }

    // Sort by quality score (descending)
    candidates.sort((a, b) => b.avgQualityScore - a.avgQualityScore);

    // Ensure we have enough models
    if (candidates.length < minModels) {
      console.warn(
        `Only ${candidates.length} models available, requested minimum ${minModels}`
      );
    }

    // Limit to maxModels
    return candidates.slice(0, maxModels);
  }

  // -------------------- Model Stats Update --------------------

  updateModelStats(
    modelId: string,
    stats: {
      latencyMs?: number;
      qualityScore?: number;
      success?: boolean;
    }
  ): void {
    const model = this.models.get(modelId);
    if (!model) return;

    model.totalRequests++;

    // Update rolling averages
    if (stats.latencyMs !== undefined) {
      model.avgLatencyMs =
        (model.avgLatencyMs * (model.totalRequests - 1) + stats.latencyMs) /
        model.totalRequests;
    }

    if (stats.qualityScore !== undefined) {
      model.avgQualityScore =
        (model.avgQualityScore * (model.totalRequests - 1) + stats.qualityScore) /
        model.totalRequests;
    }

    if (stats.success !== undefined) {
      const successCount = model.successRate * (model.totalRequests - 1);
      model.successRate =
        (successCount + (stats.success ? 1 : 0)) / model.totalRequests;
    }

    this.emit('model_stats_updated', { modelId, model });
  }

  // -------------------- Cost Calculation --------------------

  calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const model = this.models.get(modelId);
    if (!model) return 0;

    const inputCost = (inputTokens / 1_000_000) * model.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * model.outputPricePerMillion;

    return inputCost + outputCost;
  }

  estimateCost(
    modelId: string,
    promptLength: number,
    expectedOutputTokens: number = 500
  ): number {
    // Rough estimate: 4 characters per token
    const estimatedInputTokens = Math.ceil(promptLength / 4);
    return this.calculateCost(modelId, estimatedInputTokens, expectedOutputTokens);
  }

  // -------------------- Registry Info --------------------

  getRegistryStats(): {
    totalProviders: number;
    availableProviders: number;
    totalModels: number;
    availableModels: number;
    modelsByTier: Record<string, number>;
    modelsByProvider: Record<string, number>;
  } {
    const availableModels = this.getAvailableModels();

    return {
      totalProviders: this.providers.size,
      availableProviders: this.getAvailableProviders().length,
      totalModels: this.models.size,
      availableModels: availableModels.length,
      modelsByTier: {
        premium: availableModels.filter(m => m.tier === 'premium').length,
        standard: availableModels.filter(m => m.tier === 'standard').length,
        budget: availableModels.filter(m => m.tier === 'budget').length,
      },
      modelsByProvider: Object.fromEntries(
        this.getAvailableProviders().map(p => [
          p.id,
          p.models.length,
        ])
      ),
    };
  }
}

// -------------------- SINGLETON --------------------

let registryInstance: LLMRegistry | null = null;

export function getLLMRegistry(): LLMRegistry {
  if (!registryInstance) {
    registryInstance = new LLMRegistry();
  }
  return registryInstance;
}

export function resetLLMRegistry(): void {
  registryInstance = null;
}
