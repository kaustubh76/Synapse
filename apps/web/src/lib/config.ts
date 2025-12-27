// ============================================================
// SYNAPSE WEB APP CONFIGURATION
// All config values are read from environment variables
// ============================================================

// API Configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Blockchain RPC
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

// Network
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'base-sepolia';

// Wallet Addresses
export const EIGENCLOUD_WALLET = {
  id: 'eigencloud-wallet',
  address: process.env.NEXT_PUBLIC_EIGENCLOUD_WALLET_ADDRESS || '0xcF1A4587a4470634fc950270cab298B79b258eDe',
  chain: NETWORK,
  type: 'eigencloud',
  linkedUser: 'eigencloud-agent',
};

export const CROSSMINT_TREASURY = process.env.NEXT_PUBLIC_CROSSMINT_TREASURY_ADDRESS || '0x98280dc6fEF54De5DF58308a7c62e3003eA7F455';

export const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE21';

// USDC Contract Addresses
export const USDC_ADDRESSES: Record<string, string> = {
  'base-sepolia': process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'base': process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

export const USDC_ADDRESS = USDC_ADDRESSES[NETWORK] || USDC_ADDRESSES['base-sepolia'];

// LLM Configuration
export const LLM_SELECTION_PRICE = parseFloat(process.env.NEXT_PUBLIC_LLM_SELECTION_PRICE || '0.005');
export const LLM_DEFAULT_MAX_BUDGET = parseFloat(process.env.NEXT_PUBLIC_LLM_DEFAULT_MAX_BUDGET || '0.05');

// Transfer event signature for USDC (ERC20)
export const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Crossmint API
export const CROSSMINT_API_URL = process.env.NEXT_PUBLIC_CROSSMINT_API_URL || 'https://staging.crossmint.com/api/v1-alpha2';
