// ============================================================
// SYNAPSE LLM - Google AI (Gemini) Provider Adapter
// ============================================================

import {
  BaseLLMProvider,
  LLMRequestOptions,
  LLMResponse,
  StreamingLLMResponse,
} from './base-provider.js';
import { LLMProviderId, StreamChunk, ChatMessage } from '../types.js';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleProvider extends BaseLLMProvider {
  readonly providerId: LLMProviderId = 'google';
  readonly name = 'Google AI';

  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  private convertMessages(messages: ChatMessage[]): {
    systemInstruction?: { parts: Array<{ text: string }> };
    contents: GeminiContent[];
  } {
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const allMessages = this.buildMessages(options);
    const { systemInstruction, contents } = this.convertMessages(allMessages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (options.topP !== undefined) {
      (body.generationConfig as any).topP = options.topP;
    }
    if (options.stopSequences) {
      (body.generationConfig as any).stopSequences = options.stopSequences;
    }

    const url = `${this.baseUrl}/models/${options.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google AI API error: ${response.status} - ${error}`);
    }

    const data: GeminiResponse = await response.json();
    const latencyMs = Date.now() - startTime;

    const content = data.candidates[0]?.content?.parts
      ?.map(p => p.text)
      .join('') || '';

    let finishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';
    const geminiFinish = data.candidates[0]?.finishReason;
    if (geminiFinish === 'MAX_TOKENS') finishReason = 'length';
    if (geminiFinish === 'SAFETY') finishReason = 'content_filter';

    return {
      content,
      finishReason,
      tokenUsage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      modelId: options.model,
      latencyMs,
    };
  }

  async stream(options: LLMRequestOptions): Promise<StreamingLLMResponse> {
    const startTime = Date.now();
    const allMessages = this.buildMessages(options);
    const { systemInstruction, contents } = this.convertMessages(allMessages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (options.topP !== undefined) {
      (body.generationConfig as any).topP = options.topP;
    }

    const url = `${this.baseUrl}/models/${options.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeout || this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google AI API error: ${response.status} - ${error}`);
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

            try {
              const chunk: GeminiResponse = JSON.parse(data);

              const content = chunk.candidates?.[0]?.content?.parts
                ?.map(p => p.text)
                .join('') || '';

              if (content) {
                fullContent += content;
                tokenCount += self.estimateTokens(content);

                yield {
                  modelId: options.model,
                  content,
                  isComplete: false,
                  tokenCount,
                  currentCost: 0,
                };
              }

              if (chunk.candidates?.[0]?.finishReason) {
                const geminiFinish = chunk.candidates[0].finishReason;
                if (geminiFinish === 'MAX_TOKENS') finishReason = 'length';
                if (geminiFinish === 'SAFETY') finishReason = 'content_filter';
              }

              if (chunk.usageMetadata) {
                inputTokens = chunk.usageMetadata.promptTokenCount;
                tokenCount = chunk.usageMetadata.candidatesTokenCount;
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
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.apiKey) return [];

    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`
      );

      if (!response.ok) return [];

      const data = await response.json();
      return data.models
        ?.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', '')) || [];
    } catch {
      return [];
    }
  }
}
