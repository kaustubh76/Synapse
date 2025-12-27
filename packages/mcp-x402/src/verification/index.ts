// ============================================================
// SYNAPSE VERIFICATION MODULE
// On-chain payment verification and USDC transfers for x402 protocol
// ============================================================

// Payment Verification
export {
  PaymentVerifier,
  getPaymentVerifier,
  resetPaymentVerifier,
  BASE_SEPOLIA_CONFIG,
  USDC_DECIMALS,
  type PaymentExpectation,
  type VerificationResult,
  type TransactionDetails,
  type TransferLog,
} from './payment-verifier.js';

// USDC Transfer
export {
  USDCTransfer,
  getUSDCTransfer,
  resetUSDCTransfer,
  USDC_CONFIG,
  ERC20_ABI,
  type TransferRequest,
  type TransferResult,
  type WalletBalance as USDCWalletBalance,
} from './usdc-transfer.js';

// EigenWallet (for integrated payments)
export {
  EigenWallet,
  getEigenWallet,
  resetEigenWallet,
  EIGEN_WALLET_CONFIG,
  type EigenWalletConfig,
  type PaymentRequest,
  type PaymentResult,
} from './eigen-wallet.js';
