// ============================================================
// SYNAPSE LLM - Base Provider Adapter
// ============================================================

import { EventEmitter } from 'events';
import {
  LLMProviderId,
  LLMExecution,
  ChatMessage,
  TokenUsage,
  StreamChunk,
} from '../types.js';

export interface LLMRequestOptions {
  model: string;
  prompt?: string;
  systemPrompt?: string;
  messages?: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  tokenUsage: TokenUsage;
  modelId: string;
  latencyMs: number;
}

export interface StreamingLLMResponse {
  stream: AsyncIterable<StreamChunk>;
  getFullResponse: () => Promise<LLMResponse>;
}

export abstract class BaseLLMProvider extends EventEmitter {
  abstract readonly providerId: LLMProviderId;
  abstract readonly name: string;

  protected apiKey?: string;
  protected baseUrl: string;
  protected timeout: number = 60000;

  constructor(config: { apiKey?: string; baseUrl?: string; timeout?: number }) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
    this.timeout = config.timeout || 60000;
  }

  protected abstract getDefaultBaseUrl(): string;

  abstract complete(options: LLMRequestOptions): Promise<LLMResponse>;

  abstract stream(options: LLMRequestOptions): Promise<StreamingLLMResponse>;

  abstract isAvailable(): Promise<boolean>;

  abstract listModels(): Promise<string[]>;

  // Helper to build messages array
  protected buildMessages(options: LLMRequestOptions): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    if (options.messages) {
      messages.push(...options.messages);
    } else if (options.prompt) {
      messages.push({ role: 'user', content: options.prompt });
    }

    return messages;
  }

  // Helper to count tokens (rough estimate)
  protected estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // Execute with execution wrapper
  async execute(
    executionId: string,
    options: LLMRequestOptions
  ): Promise<LLMExecution> {
    const startTime = Date.now();

    try {
      const response = await this.complete(options);

      return {
        executionId,
        modelId: options.model,
        modelName: options.model,
        provider: this.providerId,
        prompt: options.prompt || '',
        systemPrompt: options.systemPrompt,
        messages: options.messages,
        response: response.content,
        finishReason: response.finishReason,
        tokenUsage: response.tokenUsage,
        latencyMs: response.latencyMs,
        cost: 0, // Calculated later by engine
        startTime,
        endTime: Date.now(),
        teeVerified: false,
        status: 'completed',
      };
    } catch (error) {
      return {
        executionId,
        modelId: options.model,
        modelName: options.model,
        provider: this.providerId,
        prompt: options.prompt || '',
        systemPrompt: options.systemPrompt,
        messages: options.messages,
        response: '',
        finishReason: 'error',
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        latencyMs: Date.now() - startTime,
        cost: 0,
        startTime,
        endTime: Date.now(),
        teeVerified: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
