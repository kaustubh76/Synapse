// ============================================================
// SYNAPSE LLM EXECUTION ENGINE - Parallel Multi-Model Execution
// ============================================================

import { EventEmitter } from 'events';
import {
  LLMIntentParams,
  LLMExecution,
  LLMComparisonResult,
  RankedLLMResult,
  LLMEvent,
  SelectionMode,
  ResultBadge,
} from './types.js';
import { getLLMRegistry } from './llm-registry.js';
import { createProvider } from './providers/index.js';
import { BaseLLMProvider } from './providers/base-provider.js';
import { nanoid } from 'nanoid';

export interface LLMExecutionConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  togetherApiKey?: string;
  groqApiKey?: string;
  ollamaBaseUrl?: string;
  defaultTimeout?: number;
}

export class LLMExecutionEngine extends EventEmitter {
  private registry = getLLMRegistry();
  private providers: Map<string, BaseLLMProvider> = new Map();
  private config: LLMExecutionConfig;

  constructor(config: LLMExecutionConfig = {}) {
    super();
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Configure API keys
    if (this.config.openaiApiKey) {
      this.registry.setApiKey('openai', this.config.openaiApiKey);
      this.providers.set('openai', createProvider('openai', {
        apiKey: this.config.openaiApiKey,
        timeout: this.config.defaultTimeout,
      }));
    }

    if (this.config.anthropicApiKey) {
      this.registry.setApiKey('anthropic', this.config.anthropicApiKey);
      this.providers.set('anthropic', createProvider('anthropic', {
        apiKey: this.config.anthropicApiKey,
        timeout: this.config.defaultTimeout,
      }));
    }

    if (this.config.googleApiKey) {
      this.registry.setApiKey('google', this.config.googleApiKey);
      this.providers.set('google', createProvider('google', {
        apiKey: this.config.googleApiKey,
        timeout: this.config.defaultTimeout,
      }));
    }

    if (this.config.togetherApiKey) {
      this.registry.setApiKey('together', this.config.togetherApiKey);
      this.providers.set('together', createProvider('together', {
        apiKey: this.config.togetherApiKey,
        timeout: this.config.defaultTimeout,
      }));
    }

    if (this.config.groqApiKey) {
      this.registry.setApiKey('groq', this.config.groqApiKey);
      this.providers.set('groq', createProvider('groq', {
        apiKey: this.config.groqApiKey,
        timeout: this.config.defaultTimeout,
      }));
    }

    // Always add Ollama (local)
    this.providers.set('ollama', createProvider('ollama', {
      baseUrl: this.config.ollamaBaseUrl || 'http://localhost:11434',
      timeout: this.config.defaultTimeout,
    }));
  }

  // -------------------- MODEL SELECTION --------------------

  private selectModels(params: LLMIntentParams): string[] {
    const selectedModels = this.registry.selectModelsForComparison({
      models: params.models,
      tier: params.modelTier,
      minModels: params.minModels,
      maxModels: params.maxModels,
      excludeModels: params.excludeModels,
    });

    return selectedModels.map(m => m.id);
  }

  // -------------------- SINGLE MODEL EXECUTION --------------------

  async executeOnModel(
    modelId: string,
    params: LLMIntentParams
  ): Promise<LLMExecution> {
    const model = this.registry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const provider = this.providers.get(model.provider);
    if (!provider) {
      throw new Error(`Provider not configured: ${model.provider}`);
    }

    const executionId = `exec_${nanoid()}`;
    const startTime = Date.now();

    this.emitEvent({
      type: 'model_execution_started',
      intentId: executionId,
      timestamp: startTime,
      data: { modelId, provider: model.provider },
    });

    try {
      console.log(`[LLM Engine] Executing ${modelId} with provider ${model.provider}`);

      // Execute via provider
      const execution = await provider.execute(executionId, {
        model: modelId,
        prompt: params.prompt,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        topP: params.topP,
        frequencyPenalty: params.frequencyPenalty,
        presencePenalty: params.presencePenalty,
        stopSequences: params.stopSequences,
        stream: false,
      });

      console.log(`[LLM Engine] ${modelId} completed successfully`);

      // Calculate cost
      execution.cost = this.registry.calculateCost(
        modelId,
        execution.tokenUsage.inputTokens,
        execution.tokenUsage.outputTokens
      );

      // Update model stats
      this.registry.updateModelStats(modelId, {
        latencyMs: execution.latencyMs,
        success: execution.status === 'completed',
      });

      this.emitEvent({
        type: 'model_execution_completed',
        intentId: executionId,
        timestamp: Date.now(),
        data: { modelId, cost: execution.cost, latencyMs: execution.latencyMs },
      });

      console.log(`[LLM Engine] Returning execution for ${modelId} with status: ${execution.status}`);
      return execution;

    } catch (error) {
      console.error(`[LLM Engine] Error executing ${modelId}:`, error);
      console.error(`[LLM Engine] Error stack:`, error instanceof Error ? error.stack : 'No stack');

      this.emitEvent({
        type: 'model_execution_failed',
        intentId: executionId,
        timestamp: Date.now(),
        data: { modelId, error: error instanceof Error ? error.message : 'Unknown error' },
      });

      // Update stats for failure
      this.registry.updateModelStats(modelId, { success: false });

      throw error;
    }
  }

  // -------------------- PARALLEL EXECUTION --------------------

  async executeComparison(
    intentId: string,
    params: LLMIntentParams
  ): Promise<LLMComparisonResult> {
    const startTime = Date.now();

    this.emitEvent({
      type: 'comparison_started',
      intentId,
      timestamp: startTime,
      data: { params },
    });

    // Select models
    const modelIds = this.selectModels(params);

    if (modelIds.length === 0) {
      throw new Error('No models available for comparison');
    }

    console.log(`[LLM Engine] Executing on ${modelIds.length} models: ${modelIds.join(', ')}`);

    // Execute in parallel
    const executionPromises = modelIds.map(async (modelId) => {
      try {
        return await this.executeOnModel(modelId, params);
      } catch (error) {
        console.error(`[LLM Engine] Failed to execute on ${modelId}:`, error);
        // Return failed execution
        const model = this.registry.getModel(modelId);
        return {
          executionId: `exec_${nanoid()}`,
          modelId,
          modelName: modelId,
          provider: model?.provider || 'openai',
          prompt: params.prompt,
          response: '',
          finishReason: 'error' as const,
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 0,
          cost: 0,
          startTime: Date.now(),
          endTime: Date.now(),
          teeVerified: false,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const executions = await Promise.all(executionPromises);

    console.log(`[LLM Engine] Got ${executions.length} execution results`);
    executions.forEach(e => {
      console.log(`[LLM Engine] - ${e.modelId}: status=${e.status}, response length=${e.response?.length || 0}`);
    });

    // Filter successful executions
    const successfulExecutions = executions.filter(e => e.status === 'completed');
    const failedCount = executions.length - successfulExecutions.length;

    console.log(`[LLM Engine] Successful: ${successfulExecutions.length}, Failed: ${failedCount}`);

    if (successfulExecutions.length === 0) {
      throw new Error('All model executions failed');
    }

    console.log(`[LLM Engine] Completed ${successfulExecutions.length}/${executions.length} executions`);

    // Score and rank results
    const rankedResults = this.scoreAndRankResults(
      successfulExecutions,
      params.compareBy || ['cost', 'quality', 'latency']
    );

    // Find best in class
    const cheapest = rankedResults.reduce((min, r) => r.cost < min.cost ? r : min).modelId;
    const fastest = rankedResults.reduce((min, r) => r.latencyMs < min.latencyMs ? r : min).modelId;
    const highestQuality = rankedResults.reduce((max, r) =>
      (r.scores.quality > max.scores.quality) ? r : max
    ).modelId;
    const bestValue = rankedResults[0].modelId; // Already sorted by overall score
    const recommended = bestValue; // Use best value as recommendation

    const endTime = Date.now();

    const result: LLMComparisonResult = {
      intentId,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      results: rankedResults,
      totalModelsQueried: executions.length,
      successfulResponses: successfulExecutions.length,
      failedResponses: failedCount,
      totalCost: rankedResults.reduce((sum, r) => sum + r.cost, 0),
      avgLatency: rankedResults.reduce((sum, r) => sum + r.latencyMs, 0) / rankedResults.length,
      avgQuality: rankedResults.reduce((sum, r) => sum + r.scores.quality, 0) / rankedResults.length,
      comparison: {
        cheapest,
        fastest,
        highestQuality,
        bestValue,
        recommended,
      },
    };

    // Auto-select if requested
    if (params.selectionMode && params.selectionMode !== 'manual') {
      result.selectedModel = this.autoSelectModel(rankedResults, params.selectionMode);
      result.selectionReason = params.selectionMode;
      result.selectedAt = Date.now();
    }

    this.emitEvent({
      type: 'comparison_completed',
      intentId,
      timestamp: endTime,
      data: { result },
    });

    return result;
  }

  // -------------------- SCORING & RANKING --------------------

  private scoreAndRankResults(
    executions: LLMExecution[],
    compareBy: string[]
  ): RankedLLMResult[] {
    // Normalize metrics to 0-1 scale
    const costs = executions.map(e => e.cost);
    const latencies = executions.map(e => e.latencyMs);

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    // Default weights
    const weights = {
      cost: compareBy.includes('cost') ? 0.4 : 0,
      latency: compareBy.includes('latency') ? 0.25 : 0,
      quality: compareBy.includes('quality') ? 0.35 : 0,
    };

    // Normalize weights to sum to 1
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight > 0) {
      weights.cost /= totalWeight;
      weights.latency /= totalWeight;
      weights.quality /= totalWeight;
    }

    const rankedResults: RankedLLMResult[] = executions.map((execution) => {
      // Normalize scores (0-1, higher is better)
      const costScore = maxCost > minCost
        ? 1 - ((execution.cost - minCost) / (maxCost - minCost))
        : 1;

      const latencyScore = maxLatency > minLatency
        ? 1 - ((execution.latencyMs - minLatency) / (maxLatency - minLatency))
        : 1;

      // Quality score from registry (already 0-100, normalize to 0-1)
      const model = this.registry.getModel(execution.modelId);
      const qualityScore = model ? model.avgQualityScore / 100 : 0.7;

      // Overall score (weighted)
      const overallScore =
        weights.cost * costScore +
        weights.latency * latencyScore +
        weights.quality * qualityScore;

      return {
        ...execution,
        rank: 0, // Will be set after sorting
        scores: {
          cost: costScore,
          latency: latencyScore,
          quality: qualityScore,
          overall: overallScore,
        },
        badges: [],
      };
    });

    // Sort by overall score (descending)
    rankedResults.sort((a, b) => b.scores.overall - a.scores.overall);

    // Assign ranks and badges
    rankedResults.forEach((result, index) => {
      result.rank = index + 1;

      // Assign badges
      const badges: ResultBadge[] = [];
      if (result.cost === Math.min(...rankedResults.map(r => r.cost))) {
        badges.push('cheapest');
      }
      if (result.latencyMs === Math.min(...rankedResults.map(r => r.latencyMs))) {
        badges.push('fastest');
      }
      if (result.scores.quality === Math.max(...rankedResults.map(r => r.scores.quality))) {
        badges.push('highest_quality');
      }
      if (result.rank === 1) {
        badges.push('best_value');
        badges.push('recommended');
      }
      if (result.teeVerified) {
        badges.push('tee_verified');
      }

      result.badges = badges;
    });

    return rankedResults;
  }

  // -------------------- AUTO-SELECTION --------------------

  private autoSelectModel(
    rankedResults: RankedLLMResult[],
    mode: SelectionMode
  ): string {
    switch (mode) {
      case 'cheapest':
        return rankedResults.reduce((min, r) => r.cost < min.cost ? r : min).modelId;

      case 'fastest':
        return rankedResults.reduce((min, r) => r.latencyMs < min.latencyMs ? r : min).modelId;

      case 'highest_quality':
        return rankedResults.reduce((max, r) =>
          r.scores.quality > max.scores.quality ? r : max
        ).modelId;

      case 'best_value':
      case 'auto':
      default:
        return rankedResults[0].modelId; // Already sorted by overall score
    }
  }

  // -------------------- STREAMING EXECUTION --------------------

  /**
   * Execute streaming comparison across multiple models in parallel
   * Each model streams tokens independently, calling onToken for each
   */
  async executeStreamingComparison(
    intentId: string,
    params: LLMIntentParams,
    onToken: (modelId: string, token: string, cost: number) => void
  ): Promise<LLMComparisonResult> {
    const startTime = Date.now();

    this.emitEvent({
      type: 'comparison_started',
      intentId,
      timestamp: startTime,
      data: { params, streaming: true },
    });

    // Select models
    const modelIds = this.selectModels(params);

    if (modelIds.length === 0) {
      throw new Error('No models available for streaming comparison');
    }

    console.log(`[LLM Engine] Streaming comparison on ${modelIds.length} models: ${modelIds.join(', ')}`);

    // Track cumulative state per model
    interface ModelStreamState {
      tokens: string[];
      tokenCount: number;
      cost: number;
      startTime: number;
    }
    const modelState = new Map<string, ModelStreamState>();

    // Launch all streams in parallel using Promise.allSettled
    const streamPromises = modelIds.map(async (modelId): Promise<LLMExecution> => {
      const model = this.registry.getModel(modelId);
      if (!model) {
        return this.createFailedExecution(modelId, new Error(`Model not found: ${modelId}`), params);
      }

      const provider = this.providers.get(model.provider);
      if (!provider) {
        return this.createFailedExecution(modelId, new Error(`Provider not configured: ${model.provider}`), params);
      }

      // Initialize state for this model
      modelState.set(modelId, {
        tokens: [],
        tokenCount: 0,
        cost: 0,
        startTime: Date.now(),
      });

      const executionId = `exec_stream_${nanoid()}`;

      try {
        console.log(`[LLM Engine] Starting stream for ${modelId}`);

        // Execute with streaming enabled
        const execution = await provider.execute(executionId, {
          model: modelId,
          prompt: params.prompt,
          systemPrompt: params.systemPrompt,
          messages: params.messages,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          topP: params.topP,
          frequencyPenalty: params.frequencyPenalty,
          presencePenalty: params.presencePenalty,
          stopSequences: params.stopSequences,
          stream: true,
          onToken: (token: string) => {
            const state = modelState.get(modelId);
            if (state) {
              state.tokens.push(token);
              state.tokenCount++;

              // Calculate incremental cost (output token cost per million)
              const costPerToken = (model.outputPricePerMillion || 0) / 1_000_000;
              state.cost += costPerToken;

              // Call user callback
              onToken(modelId, token, state.cost);
            }
          },
        });

        // Calculate final cost
        execution.cost = this.registry.calculateCost(
          modelId,
          execution.tokenUsage.inputTokens,
          execution.tokenUsage.outputTokens
        );

        // Update model stats
        this.registry.updateModelStats(modelId, {
          latencyMs: execution.latencyMs,
          success: execution.status === 'completed',
        });

        console.log(`[LLM Engine] Stream completed for ${modelId}`);
        return execution;

      } catch (error) {
        console.error(`[LLM Engine] Stream failed for ${modelId}:`, error);

        // Update stats for failure
        this.registry.updateModelStats(modelId, { success: false });

        return this.createFailedExecution(modelId, error, params);
      }
    });

    // Wait for all streams to complete
    const results = await Promise.allSettled(streamPromises);

    // Process results
    const executions: LLMExecution[] = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return this.createFailedExecution(modelIds[i], result.reason, params);
    });

    console.log(`[LLM Engine] Streaming comparison complete: ${executions.length} results`);

    // Build comparison result using existing logic
    return this.buildComparisonResult(intentId, params, executions, startTime);
  }

  /**
   * Create a failed execution object for error handling
   */
  private createFailedExecution(
    modelId: string,
    error: unknown,
    params: LLMIntentParams
  ): LLMExecution {
    const model = this.registry.getModel(modelId);
    return {
      executionId: `exec_failed_${nanoid()}`,
      modelId,
      modelName: model?.name || modelId,
      provider: model?.provider || 'openai',
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      messages: params.messages,
      response: '',
      finishReason: 'error' as const,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      cost: 0,
      startTime: Date.now(),
      endTime: Date.now(),
      teeVerified: false,
      status: 'failed' as const,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  /**
   * Build comparison result from executions (extracted from executeComparison)
   */
  private buildComparisonResult(
    intentId: string,
    params: LLMIntentParams,
    executions: LLMExecution[],
    startTime: number
  ): LLMComparisonResult {
    // Filter successful executions
    const successfulExecutions = executions.filter(e => e.status === 'completed');
    const failedCount = executions.length - successfulExecutions.length;

    console.log(`[LLM Engine] Successful: ${successfulExecutions.length}, Failed: ${failedCount}`);

    if (successfulExecutions.length === 0) {
      throw new Error('All model executions failed');
    }

    // Score and rank results
    const rankedResults = this.scoreAndRankResults(
      successfulExecutions,
      params.compareBy || ['cost', 'quality', 'latency']
    );

    // Find best in class
    const cheapest = rankedResults.reduce((min, r) => r.cost < min.cost ? r : min).modelId;
    const fastest = rankedResults.reduce((min, r) => r.latencyMs < min.latencyMs ? r : min).modelId;
    const highestQuality = rankedResults.reduce((max, r) =>
      (r.scores.quality > max.scores.quality) ? r : max
    ).modelId;
    const bestValue = rankedResults[0].modelId;
    const recommended = bestValue;

    const endTime = Date.now();

    const result: LLMComparisonResult = {
      intentId,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      startTime,
      endTime,
      totalDuration: endTime - startTime,
      results: rankedResults,
      totalModelsQueried: executions.length,
      successfulResponses: successfulExecutions.length,
      failedResponses: failedCount,
      totalCost: rankedResults.reduce((sum, r) => sum + r.cost, 0),
      avgLatency: rankedResults.reduce((sum, r) => sum + r.latencyMs, 0) / rankedResults.length,
      avgQuality: rankedResults.reduce((sum, r) => sum + r.scores.quality, 0) / rankedResults.length,
      comparison: {
        cheapest,
        fastest,
        highestQuality,
        bestValue,
        recommended,
      },
    };

    // Auto-select if requested
    if (params.selectionMode && params.selectionMode !== 'manual') {
      result.selectedModel = this.autoSelectModel(rankedResults, params.selectionMode);
      result.selectionReason = params.selectionMode;
      result.selectedAt = Date.now();
    }

    this.emitEvent({
      type: 'comparison_completed',
      intentId,
      timestamp: endTime,
      data: { result, streaming: true },
    });

    return result;
  }

  // -------------------- EVENTS --------------------

  private emitEvent(event: LLMEvent): void {
    this.emit('llm_event', event);
    this.emit(event.type, event);
  }

  // -------------------- UTILITY --------------------

  getAvailableModels(): string[] {
    return this.registry.getAvailableModels().map(m => m.id);
  }

  getRegistryStats() {
    return this.registry.getRegistryStats();
  }

  async checkProviderHealth(providerId: string) {
    return this.registry.checkProviderHealth(providerId as any);
  }
}

// -------------------- SINGLETON --------------------

let engineInstance: LLMExecutionEngine | null = null;

export function getLLMExecutionEngine(config?: LLMExecutionConfig): LLMExecutionEngine {
  if (!engineInstance) {
    engineInstance = new LLMExecutionEngine(config);
  }
  return engineInstance;
}

export function resetLLMExecutionEngine(): void {
  engineInstance = null;
}
