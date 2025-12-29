// ============================================================
// SYNAPSE LLM LAYER - Main Exports
// ============================================================

// Types
export * from './types.js';

// LLM Registry
export {
  LLMRegistry,
  getLLMRegistry,
  resetLLMRegistry,
} from './llm-registry.js';

// Providers
export * from './providers/index.js';

// Execution Engine
export {
  LLMExecutionEngine,
  getLLMExecutionEngine,
  resetLLMExecutionEngine,
  type LLMExecutionConfig,
} from './llm-execution-engine.js';

// Credit Score System
export {
  AgentCreditScorer,
  getAgentCreditScorer,
  initializeAgentCreditScorer,
  resetAgentCreditScorer,
  type CreditTransaction,
  type CreditScorerConfig,
} from './credit-score-system.js';

// Credit Persistence
export {
  CreditPersistence,
  getCreditPersistence,
  resetCreditPersistence,
  type CreditPersistenceData,
  type CreditPersistenceConfig,
} from './credit-persistence.js';

// Streaming Payments
export {
  StreamingPaymentController,
  getStreamingPaymentController,
  resetStreamingPaymentController,
  type StreamConfig,
} from './streaming-payment-controller.js';

// MCP Monetization
export {
  MCPMonetizationService,
  getMCPMonetizationService,
  resetMCPMonetizationService,
  monetize,
  PerCallPricing,
  PerTokenPricing,
  PerKBPricing,
  PerMinutePricing,
  FreemiumPricing,
  SubscriptionPricing,
  type MonetizeConfig,
  type ToolCall,
  type ToolCallResult,
} from './mcp-monetization.js';

// LLM Intent Bridge (LLMs as competing bidders)
export {
  LLMIntentBridge,
  getLLMIntentBridge,
  resetLLMIntentBridge,
  type LLMIntentRequest,
  type LLMBid,
  type LLMIntent,
  type LLMIntentResult,
  type LLMProvider,
} from './llm-intent-bridge.js';
