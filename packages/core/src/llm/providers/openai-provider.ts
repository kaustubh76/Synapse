// ============================================================
// SYNAPSE LLM - OpenAI Provider Adapter
// ============================================================

import {
  BaseLLMProvider,
  LLMRequestOptions,
  LLMResponse,
  StreamingLLMResponse,
} from './base-provider.js';
import { LLMProviderId, StreamChunk, TokenUsage } from '../types.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}

export class OpenAIProvider extends BaseLLMProvider {
  readonly providerId: LLMProviderId = 'openai';
  readonly name = 'OpenAI';

  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages = this.buildMessages(options);

    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    };

    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty;
    if (options.stopSequences) body.stop = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data: OpenAIResponse = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      content: data.choices[0]?.message?.content || '',
      finishReason: data.choices[0]?.finish_reason || 'stop',
      tokenUsage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      modelId: data.model,
      latencyMs,
    };
  }

  async stream(options: LLMRequestOptions): Promise<StreamingLLMResponse> {
    const startTime = Date.now();
    const messages = this.buildMessages(options);

    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences) body.stop = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    let tokenCount = 0;
    let finalUsage: TokenUsage | null = null;
    let finishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';

    const self = this;
    const streamReader = reader; // Capture for closure

    async function* streamGenerator(): AsyncGenerator<StreamChunk> {
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              const content = chunk.choices[0]?.delta?.content || '';

              if (content) {
                fullContent += content;
                tokenCount++;

                yield {
                  modelId: options.model,
                  content,
                  isComplete: false,
                  tokenCount,
                  currentCost: 0, // Calculated later
                };
              }

              if (chunk.choices[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
              }

              // Check for usage in the last chunk
              if ((chunk as any).usage) {
                finalUsage = {
                  inputTokens: (chunk as any).usage.prompt_tokens,
                  outputTokens: (chunk as any).usage.completion_tokens,
                  totalTokens: (chunk as any).usage.total_tokens,
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Final chunk
      yield {
        modelId: options.model,
        content: '',
        isComplete: true,
        tokenCount,
        currentCost: 0,
      };
    }

    return {
      stream: streamGenerator(),
      getFullResponse: async () => {
        // Consume stream if not already done
        for await (const _ of streamGenerator()) {
          // Just consume
        }

        return {
          content: fullContent,
          finishReason,
          tokenUsage: finalUsage || {
            inputTokens: self.estimateTokens(options.prompt || ''),
            outputTokens: tokenCount,
            totalTokens: self.estimateTokens(options.prompt || '') + tokenCount,
          },
          modelId: options.model,
          latencyMs: Date.now() - startTime,
        };
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.data
        .filter((m: any) => m.id.includes('gpt'))
        .map((m: any) => m.id);
    } catch {
      return [];
    }
  }
}

// OpenAI-compatible provider (Together AI, Groq, etc.)
export class OpenAICompatibleProvider extends OpenAIProvider {
  constructor(
    providerId: LLMProviderId,
    name: string,
    config: { apiKey?: string; baseUrl: string; timeout?: number }
  ) {
    super(config);
    (this as any).providerId = providerId;
    (this as any).name = name;
    this.baseUrl = config.baseUrl;
  }

  protected getDefaultBaseUrl(): string {
    return this.baseUrl;
  }
}
