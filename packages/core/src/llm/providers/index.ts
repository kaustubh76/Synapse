// ============================================================
// SYNAPSE LLM - Provider Exports
// ============================================================

export { BaseLLMProvider, type LLMRequestOptions, type LLMResponse, type StreamingLLMResponse } from './base-provider.js';
export { OpenAIProvider, OpenAICompatibleProvider } from './openai-provider.js';
export { AnthropicProvider } from './anthropic-provider.js';
export { GoogleProvider } from './google-provider.js';
export { OllamaProvider } from './ollama-provider.js';

import { LLMProviderId } from '../types.js';
import { BaseLLMProvider } from './base-provider.js';
import { OpenAIProvider, OpenAICompatibleProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GoogleProvider } from './google-provider.js';
import { OllamaProvider } from './ollama-provider.js';

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export function createProvider(
  providerId: LLMProviderId,
  config: ProviderConfig = {}
): BaseLLMProvider {
  switch (providerId) {
    case 'openai':
      return new OpenAIProvider(config);

    case 'anthropic':
      return new AnthropicProvider(config);

    case 'google':
      return new GoogleProvider(config);

    case 'ollama':
      return new OllamaProvider({
        ...config,
        baseUrl: config.baseUrl || 'http://localhost:11434',
      });

    case 'together':
      return new OpenAICompatibleProvider('together', 'Together AI', {
        ...config,
        baseUrl: config.baseUrl || 'https://api.together.xyz/v1',
      });

    case 'groq':
      return new OpenAICompatibleProvider('groq', 'Groq', {
        ...config,
        baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
      });

    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}
