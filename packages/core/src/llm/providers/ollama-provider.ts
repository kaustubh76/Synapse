// ============================================================
// SYNAPSE LLM - Ollama Provider Adapter (Local/Self-hosted)
// ============================================================

import {
  BaseLLMProvider,
  LLMRequestOptions,
  LLMResponse,
  StreamingLLMResponse,
} from './base-provider.js';
import { LLMProviderId, StreamChunk, ChatMessage } from '../types.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseLLMProvider {
  readonly providerId: LLMProviderId = 'ollama';
  readonly name = 'Ollama (Local)';

  protected getDefaultBaseUrl(): string {
    return 'http://localhost:11434';
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages = this.buildMessages(options);

    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {},
    };

    if (options.maxTokens) (body.options as any).num_predict = options.maxTokens;
    if (options.temperature !== undefined) (body.options as any).temperature = options.temperature;
    if (options.topP !== undefined) (body.options as any).top_p = options.topP;
    if (options.stopSequences) body.stop = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data: OllamaResponse = await response.json();
    const latencyMs = Date.now() - startTime;

    const inputTokens = data.prompt_eval_count || this.estimateTokens(options.prompt || '');
    const outputTokens = data.eval_count || this.estimateTokens(data.message.content);

    return {
      content: data.message.content,
      finishReason: data.done_reason === 'length' ? 'length' : 'stop',
      tokenUsage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
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
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {},
    };

    if (options.maxTokens) (body.options as any).num_predict = options.maxTokens;
    if (options.temperature !== undefined) (body.options as any).temperature = options.temperature;
    if (options.topP !== undefined) (body.options as any).top_p = options.topP;
    if (options.stopSequences) body.stop = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    let tokenCount = 0;
    let inputTokens = 0;
    let finishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';

    const self = this;

    async function* streamGenerator(): AsyncGenerator<StreamChunk> {
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);
            const content = chunk.message?.content || '';

            if (content) {
              fullContent += content;
              tokenCount++;

              yield {
                modelId: options.model,
                content,
                isComplete: false,
                tokenCount,
                currentCost: 0, // Ollama is free (self-hosted)
              };
            }

            if (chunk.done) {
              if (chunk.done_reason === 'length') finishReason = 'length';
              if (chunk.prompt_eval_count) inputTokens = chunk.prompt_eval_count;
              if (chunk.eval_count) tokenCount = chunk.eval_count;
            }
          } catch {
            // Skip invalid JSON
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
        const gen = streamGenerator();
        for await (const _ of gen) {
          // Just consume
        }

        return {
          content: fullContent,
          finishReason,
          tokenUsage: {
            inputTokens: inputTokens || self.estimateTokens(options.prompt || ''),
            outputTokens: tokenCount,
            totalTokens: (inputTokens || self.estimateTokens(options.prompt || '')) + tokenCount,
          },
          modelId: options.model,
          latencyMs: Date.now() - startTime,
        };
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) return [];

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }

  // Pull a model (download it)
  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
