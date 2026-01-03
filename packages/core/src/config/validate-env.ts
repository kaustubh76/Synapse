// ============================================================
// SYNAPSE ENVIRONMENT VALIDATION
// Validates required configuration at startup
// ============================================================

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates payment configuration required for real USDC transfers
 */
export function validatePaymentConfig(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  // Required for real USDC transfers
  const paymentKeys = [
    'EIGENCLOUD_PRIVATE_KEY',
    'EIGENCLOUD_WALLET_ADDRESS',
  ];

  const missingPayment = paymentKeys.filter(key => !process.env[key]);
  if (missingPayment.length > 0) {
    result.warnings.push(`Missing payment config: ${missingPayment.join(', ')}`);
    result.warnings.push('Real USDC settlements will fail without these keys.');
  }

  // Check for demo mode
  if (process.env.X402_DEMO_MODE === 'true') {
    result.warnings.push('X402_DEMO_MODE=true - payments will be simulated, not real.');
  }

  // Check escrow configuration
  if (process.env.ENABLE_REAL_ESCROW === 'true' && !process.env.ESCROW_PRIVATE_KEY) {
    result.warnings.push('ENABLE_REAL_ESCROW=true but ESCROW_PRIVATE_KEY not set.');
  }

  return result;
}

/**
 * Validates LLM provider configuration
 */
export function validateLLMConfig(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  const llmKeys = [
    { key: 'OPENAI_API_KEY', provider: 'OpenAI' },
    { key: 'ANTHROPIC_API_KEY', provider: 'Anthropic' },
    { key: 'GOOGLE_API_KEY', provider: 'Google' },
    { key: 'GROQ_API_KEY', provider: 'Groq' },
    { key: 'TOGETHER_API_KEY', provider: 'Together' },
  ];

  const configured = llmKeys.filter(({ key }) => !!process.env[key]);
  const missing = llmKeys.filter(({ key }) => !process.env[key]);

  if (configured.length === 0) {
    result.warnings.push('No LLM API keys configured. LLM comparison will fail.');
    result.warnings.push(`Configure at least one: ${llmKeys.map(k => k.key).join(', ')}`);
  } else {
    result.warnings.push(`LLM providers available: ${configured.map(k => k.provider).join(', ')}`);
    if (missing.length > 0) {
      result.warnings.push(`LLM providers unavailable: ${missing.map(k => k.provider).join(', ')}`);
    }
  }

  return result;
}

/**
 * Validates all configuration and logs results
 */
export function validateAllConfig(): void {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           SYNAPSE CONFIGURATION VALIDATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const paymentResult = validatePaymentConfig();
  const llmResult = validateLLMConfig();

  console.log('📦 Payment Configuration:');
  if (paymentResult.warnings.length === 0) {
    console.log('   ✅ All payment keys configured');
  } else {
    paymentResult.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
  }

  console.log('\n🤖 LLM Configuration:');
  llmResult.warnings.forEach(w => console.log(`   ℹ️  ${w}`));

  // Summary
  const hasIssues = paymentResult.warnings.length > 0 || paymentResult.errors.length > 0;
  console.log('\n' + (hasIssues ? '⚠️  Configuration has warnings - some features may not work' : '✅ Configuration looks good'));
  console.log('');
}
