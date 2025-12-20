// ============================================================
// SYNAPSE Intent Decomposer
// Break complex intents into smaller executable sub-intents
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { Intent, IntentStatus, IntentCategory } from '@synapse/types';

export interface SubIntent {
  id: string;
  parentId: string;
  type: string;
  category: IntentCategory;
  params: Record<string, unknown>;
  budget: number;
  dependencies: string[];  // IDs of sub-intents that must complete first
  priority: number;        // Higher = execute first
  status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface DecompositionPlan {
  id: string;
  originalIntent: Partial<Intent>;
  subIntents: SubIntent[];
  executionOrder: string[][];  // Groups of IDs that can run in parallel
  totalBudget: number;
  estimatedTime: number;
  status: 'planned' | 'executing' | 'completed' | 'failed';
}

export interface DecompositionRule {
  name: string;
  pattern: RegExp | string;
  decompose: (intent: Partial<Intent>) => SubIntent[];
}

interface DecomposerEvents {
  'plan:created': (plan: DecompositionPlan) => void;
  'subintent:ready': (subIntent: SubIntent, plan: DecompositionPlan) => void;
  'subintent:completed': (subIntent: SubIntent, result: unknown) => void;
  'subintent:failed': (subIntent: SubIntent, error: string) => void;
  'plan:completed': (plan: DecompositionPlan, results: Record<string, unknown>) => void;
  'plan:failed': (plan: DecompositionPlan, error: string) => void;
}

/**
 * Intent Decomposer
 *
 * Analyzes complex intents and breaks them into smaller, executable sub-intents.
 * Supports parallel and sequential execution based on dependencies.
 *
 * Example:
 * "Get weather and crypto prices for my portfolio dashboard"
 * ->
 *   1. weather.current { city: 'user_location' }
 *   2. crypto.price { symbol: 'BTC' }  (parallel)
 *   3. crypto.price { symbol: 'ETH' }  (parallel)
 *   4. aggregate.dashboard { sources: [1, 2, 3] }
 */
export class IntentDecomposer extends EventEmitter<DecomposerEvents> {
  private rules: DecompositionRule[] = [];
  private plans: Map<string, DecompositionPlan> = new Map();

  constructor() {
    super();
    this.registerDefaultRules();
  }

  /**
   * Register a decomposition rule
   */
  registerRule(rule: DecompositionRule): void {
    this.rules.push(rule);
  }

  /**
   * Decompose an intent into a plan
   */
  decompose(intent: Partial<Intent>): DecompositionPlan {
    const subIntents: SubIntent[] = [];

    // Check rules
    for (const rule of this.rules) {
      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern)
        : rule.pattern;

      if (pattern.test(intent.type || '')) {
        const decomposed = rule.decompose(intent);
        subIntents.push(...decomposed);
        break;
      }
    }

    // If no rules matched, create a single sub-intent
    if (subIntents.length === 0) {
      subIntents.push(this.createSubIntent(intent, intent.type || 'unknown'));
    }

    // Calculate execution order (topological sort based on dependencies)
    const executionOrder = this.calculateExecutionOrder(subIntents);

    const plan: DecompositionPlan = {
      id: `plan_${nanoid(12)}`,
      originalIntent: intent,
      subIntents,
      executionOrder,
      totalBudget: subIntents.reduce((sum, si) => sum + si.budget, 0),
      estimatedTime: this.estimateExecutionTime(subIntents, executionOrder),
      status: 'planned'
    };

    this.plans.set(plan.id, plan);
    this.emit('plan:created', plan);

    return plan;
  }

  /**
   * Check if an intent should be decomposed
   */
  shouldDecompose(intent: Partial<Intent>): boolean {
    // Check for compound intent types
    if (intent.type?.includes('+')) return true;
    if (intent.type?.includes('composite')) return true;
    if (intent.type?.includes('multi')) return true;

    // Check for array params indicating multiple operations
    const params = intent.params || {};
    for (const value of Object.values(params)) {
      if (Array.isArray(value) && value.length > 1) {
        return true;
      }
    }

    // Check rules
    for (const rule of this.rules) {
      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern)
        : rule.pattern;

      if (pattern.test(intent.type || '')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Start executing a decomposition plan
   */
  startPlan(planId: string): SubIntent[] {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    plan.status = 'executing';

    // Get first batch of sub-intents that can execute
    const readySubIntents = this.getReadySubIntents(plan);

    readySubIntents.forEach(si => {
      si.status = 'ready';
      this.emit('subintent:ready', si, plan);
    });

    return readySubIntents;
  }

  /**
   * Mark a sub-intent as completed
   */
  completeSubIntent(planId: string, subIntentId: string, result: unknown): SubIntent[] {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const subIntent = plan.subIntents.find(si => si.id === subIntentId);
    if (!subIntent) throw new Error(`SubIntent ${subIntentId} not found`);

    subIntent.status = 'completed';
    subIntent.result = result;

    this.emit('subintent:completed', subIntent, result);

    // Check if all sub-intents are completed
    const allCompleted = plan.subIntents.every(
      si => si.status === 'completed' || si.status === 'failed'
    );

    if (allCompleted) {
      const anyFailed = plan.subIntents.some(si => si.status === 'failed');

      if (anyFailed) {
        plan.status = 'failed';
        this.emit('plan:failed', plan, 'One or more sub-intents failed');
      } else {
        plan.status = 'completed';
        const results: Record<string, unknown> = {};
        plan.subIntents.forEach(si => {
          results[si.id] = si.result;
        });
        this.emit('plan:completed', plan, results);
      }

      return [];
    }

    // Get next batch of ready sub-intents
    const nextBatch = this.getReadySubIntents(plan);

    nextBatch.forEach(si => {
      si.status = 'ready';
      this.emit('subintent:ready', si, plan);
    });

    return nextBatch;
  }

  /**
   * Mark a sub-intent as failed
   */
  failSubIntent(planId: string, subIntentId: string, error: string): void {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    const subIntent = plan.subIntents.find(si => si.id === subIntentId);
    if (!subIntent) throw new Error(`SubIntent ${subIntentId} not found`);

    subIntent.status = 'failed';
    subIntent.error = error;

    this.emit('subintent:failed', subIntent, error);

    // Mark dependent sub-intents as failed too
    const dependents = plan.subIntents.filter(si =>
      si.dependencies.includes(subIntentId)
    );

    dependents.forEach(si => {
      si.status = 'failed';
      si.error = `Dependency ${subIntentId} failed`;
    });

    // Check if plan is done
    const allDone = plan.subIntents.every(
      si => si.status === 'completed' || si.status === 'failed'
    );

    if (allDone) {
      plan.status = 'failed';
      this.emit('plan:failed', plan, error);
    }
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId: string): DecompositionPlan | undefined {
    return this.plans.get(planId);
  }

  // -------------------- Private Methods --------------------

  private registerDefaultRules(): void {
    // Multi-crypto price rule
    this.registerRule({
      name: 'multi-crypto',
      pattern: /crypto\.prices?$/,
      decompose: (intent) => {
        const symbols = (intent.params?.symbols as string[]) ||
                       (intent.params?.symbol ? [intent.params.symbol as string] : ['BTC']);
        const budgetPerSymbol = (intent.maxBudget || 0.05) / symbols.length;

        return symbols.map((symbol, i) => this.createSubIntent(
          {
            type: 'crypto.price',
            category: IntentCategory.DATA,
            params: { symbol },
            maxBudget: budgetPerSymbol
          },
          `crypto.price.${symbol}`,
          [],
          i
        ));
      }
    });

    // Multi-city weather rule
    this.registerRule({
      name: 'multi-weather',
      pattern: /weather\.multi$/,
      decompose: (intent) => {
        const cities = (intent.params?.cities as string[]) || ['New York'];
        const budgetPerCity = (intent.maxBudget || 0.05) / cities.length;

        return cities.map((city, i) => this.createSubIntent(
          {
            type: 'weather.current',
            category: IntentCategory.DATA,
            params: { city },
            maxBudget: budgetPerCity
          },
          `weather.current.${city}`,
          [],
          i
        ));
      }
    });

    // Dashboard composite rule
    this.registerRule({
      name: 'dashboard',
      pattern: /dashboard\.(crypto|portfolio|market)$/,
      decompose: (intent) => {
        const symbols = ['BTC', 'ETH', 'SOL'];
        const totalBudget = intent.maxBudget || 0.1;
        const priceBudget = totalBudget * 0.6;
        const newsBudget = totalBudget * 0.4;

        const priceIntents = symbols.map((symbol, i) => this.createSubIntent(
          {
            type: 'crypto.price',
            category: IntentCategory.DATA,
            params: { symbol },
            maxBudget: priceBudget / symbols.length
          },
          `price.${symbol}`,
          [],
          10 + i // High priority
        ));

        const newsIntent = this.createSubIntent(
          {
            type: 'news.latest',
            category: IntentCategory.DATA,
            params: { topic: 'cryptocurrency', limit: 3 },
            maxBudget: newsBudget
          },
          'news.crypto',
          [],
          5
        );

        return [...priceIntents, newsIntent];
      }
    });

    // Composite intent (type1+type2)
    this.registerRule({
      name: 'composite',
      pattern: /\+/,
      decompose: (intent) => {
        const types = (intent.type || '').split('+');
        const budgetPerType = (intent.maxBudget || 0.05) / types.length;

        return types.map((type, i) => this.createSubIntent(
          {
            type: type.trim(),
            category: intent.category,
            params: intent.params,
            maxBudget: budgetPerType
          },
          type.trim(),
          [],
          types.length - i // First type has highest priority
        ));
      }
    });

    // Sequential pipeline (type1 -> type2)
    this.registerRule({
      name: 'pipeline',
      pattern: /->/,
      decompose: (intent) => {
        const types = (intent.type || '').split('->');
        const budgetPerType = (intent.maxBudget || 0.05) / types.length;

        const subIntents: SubIntent[] = [];

        types.forEach((type, i) => {
          const si = this.createSubIntent(
            {
              type: type.trim(),
              category: intent.category,
              params: intent.params,
              maxBudget: budgetPerType
            },
            type.trim(),
            i > 0 ? [subIntents[i - 1].id] : [], // Depends on previous
            types.length - i
          );
          subIntents.push(si);
        });

        return subIntents;
      }
    });
  }

  private createSubIntent(
    intent: Partial<Intent>,
    typeHint: string,
    dependencies: string[] = [],
    priority: number = 0
  ): SubIntent {
    return {
      id: `si_${nanoid(8)}`,
      parentId: intent.id || 'unknown',
      type: intent.type || typeHint,
      category: intent.category || IntentCategory.DATA,
      params: intent.params || {},
      budget: intent.maxBudget || 0.01,
      dependencies,
      priority,
      status: 'pending'
    };
  }

  private calculateExecutionOrder(subIntents: SubIntent[]): string[][] {
    const order: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(subIntents.map(si => si.id));

    while (remaining.size > 0) {
      const batch: string[] = [];

      for (const si of subIntents) {
        if (!remaining.has(si.id)) continue;

        // Check if all dependencies are completed
        const depsCompleted = si.dependencies.every(dep => completed.has(dep));

        if (depsCompleted) {
          batch.push(si.id);
        }
      }

      if (batch.length === 0) {
        // Circular dependency - just add remaining
        batch.push(...remaining);
      }

      // Sort batch by priority
      batch.sort((a, b) => {
        const siA = subIntents.find(si => si.id === a)!;
        const siB = subIntents.find(si => si.id === b)!;
        return siB.priority - siA.priority;
      });

      order.push(batch);

      batch.forEach(id => {
        completed.add(id);
        remaining.delete(id);
      });
    }

    return order;
  }

  private getReadySubIntents(plan: DecompositionPlan): SubIntent[] {
    const completed = new Set(
      plan.subIntents
        .filter(si => si.status === 'completed')
        .map(si => si.id)
    );

    return plan.subIntents.filter(si => {
      if (si.status !== 'pending') return false;

      // Check if all dependencies are completed
      return si.dependencies.every(dep => completed.has(dep));
    });
  }

  private estimateExecutionTime(
    subIntents: SubIntent[],
    executionOrder: string[][]
  ): number {
    // Estimate 500ms per sub-intent, but parallel execution reduces time
    let totalTime = 0;

    for (const batch of executionOrder) {
      // Each batch runs in parallel, so time = max of batch
      totalTime += 500; // Base time per batch
    }

    return totalTime;
  }
}

// Singleton instance
let decomposerInstance: IntentDecomposer | null = null;

export function getIntentDecomposer(): IntentDecomposer {
  if (!decomposerInstance) {
    decomposerInstance = new IntentDecomposer();
  }
  return decomposerInstance;
}

export function resetIntentDecomposer(): void {
  decomposerInstance = null;
}
