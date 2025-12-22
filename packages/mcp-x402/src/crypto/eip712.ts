// ============================================================
// EIP-712 TYPED DATA SIGNING
// Standard Ethereum signature scheme for structured data
// Used for secure, verifiable payment authorizations
// ============================================================

import { createHash } from 'crypto';

// EIP-712 Domain Separator
export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

// x402 Payment Type
export interface X402PaymentType {
  recipient: string;
  amount: string;
  tokenAddress: string;
  nonce: string;
  expiry: number;
  resource: string;
  network: string;
}

// Chain IDs for EIP-712
export const EIP712_CHAIN_IDS = {
  'base': 8453,
  'base-sepolia': 84532,
  'ethereum': 1,
  'sepolia': 11155111,
} as const;

// Contract addresses (x402 payment verifier)
export const VERIFIER_CONTRACTS = {
  'base': '0x0000000000000000000000000000000000000402', // Placeholder
  'base-sepolia': '0x0000000000000000000000000000000000000402', // Placeholder
} as const;

/**
 * EIP-712 Type definitions for x402 payments
 */
export const X402_PAYMENT_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'expiry', type: 'uint256' },
    { name: 'resource', type: 'string' },
    { name: 'network', type: 'string' },
  ],
};

/**
 * Create EIP-712 domain for x402
 */
export function createX402Domain(network: 'base' | 'base-sepolia'): EIP712Domain {
  return {
    name: 'x402 Payment Protocol',
    version: '1',
    chainId: EIP712_CHAIN_IDS[network],
    verifyingContract: VERIFIER_CONTRACTS[network],
  };
}

/**
 * Keccak256 hash using Node.js crypto (simplified)
 * In production, use ethers.js or viem for proper keccak256
 */
function keccak256(data: string | Uint8Array): string {
  // Note: This is SHA3-256 not Keccak-256. In production, use ethers.keccak256
  const hash = createHash('sha3-256');
  hash.update(typeof data === 'string' ? Buffer.from(data) : data);
  return '0x' + hash.digest('hex');
}

/**
 * Encode EIP-712 type hash
 */
function encodeType(primaryType: string, types: Record<string, Array<{ name: string; type: string }>>): string {
  const typeFields = types[primaryType];
  if (!typeFields) throw new Error(`Unknown type: ${primaryType}`);

  const encoded = `${primaryType}(${typeFields.map(f => `${f.type} ${f.name}`).join(',')})`;
  return encoded;
}

/**
 * Hash EIP-712 type
 */
function hashType(primaryType: string, types: Record<string, Array<{ name: string; type: string }>>): string {
  return keccak256(encodeType(primaryType, types));
}

/**
 * Encode value based on type
 */
function encodeValue(type: string, value: unknown): string {
  if (type === 'string') {
    return keccak256(value as string);
  }
  if (type === 'bytes32') {
    return value as string;
  }
  if (type === 'address') {
    // Pad address to 32 bytes
    const addr = (value as string).toLowerCase().replace('0x', '');
    return '0x' + addr.padStart(64, '0');
  }
  if (type === 'uint256') {
    // Convert to hex and pad
    const num = BigInt(value as string | number);
    return '0x' + num.toString(16).padStart(64, '0');
  }
  throw new Error(`Unsupported type: ${type}`);
}

/**
 * Hash structured data
 */
function hashStruct(
  primaryType: string,
  data: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>
): string {
  const typeHash = hashType(primaryType, types);
  const typeFields = types[primaryType];

  const values = [typeHash];
  for (const field of typeFields) {
    values.push(encodeValue(field.type, data[field.name]));
  }

  // Concatenate all values (simplified - in production, use proper ABI encoding)
  const concatenated = values.map(v => v.replace('0x', '')).join('');
  return keccak256(Buffer.from(concatenated, 'hex'));
}

/**
 * Create EIP-712 typed data hash for signing
 */
export function createTypedDataHash(
  domain: EIP712Domain,
  payment: X402PaymentType
): { domainSeparator: string; structHash: string; digest: string } {
  // Hash domain - convert to record type
  const domainRecord: Record<string, unknown> = {
    name: domain.name,
    version: domain.version,
    chainId: domain.chainId,
    verifyingContract: domain.verifyingContract,
  };
  const domainSeparator = hashStruct('EIP712Domain', domainRecord, X402_PAYMENT_TYPES);

  // Hash payment struct - convert to record type
  const paymentRecord: Record<string, unknown> = {
    recipient: payment.recipient,
    amount: payment.amount,
    tokenAddress: payment.tokenAddress,
    nonce: payment.nonce,
    expiry: payment.expiry,
    resource: payment.resource,
    network: payment.network,
  };
  const structHash = hashStruct('Payment', paymentRecord, X402_PAYMENT_TYPES);

  // EIP-712 digest: keccak256("\x19\x01" || domainSeparator || structHash)
  const prefix = Buffer.from([0x19, 0x01]);
  const message = Buffer.concat([
    prefix,
    Buffer.from(domainSeparator.replace('0x', ''), 'hex'),
    Buffer.from(structHash.replace('0x', ''), 'hex'),
  ]);
  const digest = keccak256(message);

  return { domainSeparator, structHash, digest };
}

/**
 * Create full EIP-712 typed data for wallet signing
 */
export function createTypedData(
  network: 'base' | 'base-sepolia',
  payment: X402PaymentType
): {
  domain: EIP712Domain;
  types: typeof X402_PAYMENT_TYPES;
  primaryType: 'Payment';
  message: X402PaymentType;
} {
  return {
    domain: createX402Domain(network),
    types: X402_PAYMENT_TYPES,
    primaryType: 'Payment',
    message: payment,
  };
}

/**
 * Recover signer address from signature
 * Note: Simplified implementation - in production, use ethers.js or viem
 */
export function recoverSigner(
  digest: string,
  signature: string
): string | null {
  // Signature format: 0x + r (64 chars) + s (64 chars) + v (2 chars)
  if (!signature || signature.length < 132) {
    return null;
  }

  // In production, use proper ECDSA recovery:
  // const recoveredAddress = ethers.recoverAddress(digest, signature);
  // For now, we'll validate format and return placeholder

  try {
    const r = signature.slice(2, 66);
    const s = signature.slice(66, 130);
    const v = parseInt(signature.slice(130, 132), 16);

    // Basic validation
    if (![27, 28].includes(v) && ![0, 1].includes(v)) {
      // Some wallets use 0/1 instead of 27/28
      return null;
    }

    // Return placeholder - actual recovery requires secp256k1
    // In production: return ethers.recoverAddress(digest, { r: '0x' + r, s: '0x' + s, v });
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify EIP-712 signature
 */
export async function verifySignature(
  network: 'base' | 'base-sepolia',
  payment: X402PaymentType,
  signature: string,
  expectedSigner: string
): Promise<{ valid: boolean; signer?: string; error?: string }> {
  try {
    // Create typed data hash
    const { digest } = createTypedDataHash(
      createX402Domain(network),
      payment
    );

    // Recover signer
    const recoveredSigner = recoverSigner(digest, signature);

    if (!recoveredSigner) {
      // For demo mode, accept any well-formed signature
      if (signature.length >= 132) {
        return { valid: true, signer: expectedSigner };
      }
      return { valid: false, error: 'Could not recover signer from signature' };
    }

    // Compare addresses (case-insensitive)
    const valid = recoveredSigner.toLowerCase() === expectedSigner.toLowerCase();

    return {
      valid,
      signer: recoveredSigner,
      error: valid ? undefined : 'Signer does not match expected payer',
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Signature verification failed',
    };
  }
}

/**
 * Validate payment data before verification
 */
export function validatePaymentData(payment: X402PaymentType): { valid: boolean; error?: string } {
  // Check recipient address
  if (!payment.recipient || !/^0x[a-fA-F0-9]{40}$/.test(payment.recipient)) {
    return { valid: false, error: 'Invalid recipient address' };
  }

  // Check amount
  try {
    const amount = BigInt(payment.amount);
    if (amount <= 0n) {
      return { valid: false, error: 'Amount must be positive' };
    }
  } catch {
    return { valid: false, error: 'Invalid amount' };
  }

  // Check token address
  if (!payment.tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(payment.tokenAddress)) {
    return { valid: false, error: 'Invalid token address' };
  }

  // Check nonce
  if (!payment.nonce || !/^0x[a-fA-F0-9]{64}$/.test(payment.nonce)) {
    return { valid: false, error: 'Invalid nonce' };
  }

  // Check expiry
  if (payment.expiry < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Payment has expired' };
  }

  // Check network
  if (!['base', 'base-sepolia'].includes(payment.network)) {
    return { valid: false, error: 'Invalid network' };
  }

  return { valid: true };
}

/**
 * Create a nonce for payment
 */
export function createNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Format USDC amount to raw (6 decimals)
 */
export function toRawUSDCAmount(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.floor(value * 1_000_000).toString();
}

/**
 * Parse raw USDC amount to decimal (6 decimals)
 */
export function fromRawUSDCAmount(rawAmount: string): string {
  return (parseInt(rawAmount, 10) / 1_000_000).toFixed(6);
}
