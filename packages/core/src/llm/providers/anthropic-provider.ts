// ============================================================
// SYNAPSE LLM - Anthropic Provider Adapter
// ============================================================

import {
  BaseLLMProvider,
  LLMRequestOptions,
  LLMResponse,
  StreamingLLMResponse,
} from './base-provider.js';
import { LLMProviderId, StreamChunk, TokenUsage, ChatMessage } from '../types.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicResponse;
  index?: number;
  content_block?: { type: string; text: string };
  delta?: { type: string; text?: string; stop_reason?: string };
  usage?: { output_tokens: number };
}

export class AnthropicProvider extends BaseLLMProvider {
  readonly providerId: LLMProviderId = 'anthropic';
  readonly name = 'Anthropic';

  private readonly apiVersion = '2023-06-01';

  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com';
  }

  private convertMessages(messages: ChatMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Ensure messages alternate and start with user
    // If first message is assistant, prepend a user message
    if (anthropicMessages.length > 0 && anthropicMessages[0].role === 'assistant') {
      anthropicMessages.unshift({ role: 'user', content: 'Hello' });
    }

    return { system, messages: anthropicMessages };
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const allMessages = this.buildMessages(options);
    const { system, messages } = this.convertMessages(allMessages);

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens || 4096,
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences) body.stop_sequences = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey || '',
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data: AnthropicResponse = await response.json();
    const latencyMs = Date.now() - startTime;

    const content = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    let finishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';
    if (data.stop_reason === 'max_tokens') finishReason = 'length';

    return {
      content,
      finishReason,
      tokenUsage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      modelId: data.model,
      latencyMs,
    };
  }

  async stream(options: LLMRequestOptions): Promise<StreamingLLMResponse> {
    const startTime = Date.now();
    const allMessages = this.buildMessages(options);
    const { system, messages } = this.convertMessages(allMessages);

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens || 4096,
      stream: true,
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences) body.stop_sequences = options.stopSequences;

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey || '',
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event: AnthropicStreamEvent = JSON.parse(data);

              if (event.type === 'message_start' && event.message) {
                inputTokens = event.message.usage.input_tokens;
              }

              if (event.type === 'content_block_delta' && event.delta?.text) {
                const content = event.delta.text;
                fullContent += content;
                tokenCount++;

                yield {
                  modelId: options.model,
                  content,
                  isComplete: false,
                  tokenCount,
                  currentCost: 0,
                };
              }

              if (event.type === 'message_delta') {
                if (event.delta?.stop_reason === 'max_tokens') {
                  finishReason = 'length';
                }
                if (event.usage) {
                  tokenCount = event.usage.output_tokens;
                }
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
    if (!this.apiKey) return false;

    try {
      // Anthropic doesn't have a simple health endpoint, so we just verify the key format
      return this.apiKey.startsWith('sk-ant-');
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, return known models
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }
}
