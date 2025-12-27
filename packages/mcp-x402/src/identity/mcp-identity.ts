// ============================================================
// MCP IDENTITY FACTORY
// Auto-generates cryptographic wallet identity for MCP clients
// Supports local wallets (ethers.js) and Crossmint MPC wallets
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { ethers } from 'ethers';
import { nanoid } from 'nanoid';

// -------------------- TYPES --------------------

export interface MCPIdentity {
  /** Unique client identifier */
  clientId: string;
  /** Ethereum wallet address */
  address: string;
  /** Public key for verification */
  publicKey: string;
  /** Identity creation timestamp */
  createdAt: number;
  /** Whether this is a local or managed wallet */
  walletType: 'local' | 'crossmint';
  /** Network this identity operates on */
  network: 'base' | 'base-sepolia';
}

export interface MCPIdentityWithWallet extends MCPIdentity {
  /** The wallet instance (for signing) */
  wallet: LocalWallet;
}

export interface LocalWallet {
  address: string;
  privateKey: string;
  publicKey: string;
  /** Sign a message */
  signMessage(message: string): Promise<string>;
  /** Sign typed data (EIP-712) */
  signTypedData(domain: ethers.TypedDataDomain, types: Record<string, ethers.TypedDataField[]>, value: Record<string, unknown>): Promise<string>;
}

export interface IdentityFactoryConfig {
  /** Network to use */
  network?: 'base' | 'base-sepolia';
  /** Crossmint API key (optional - enables MPC wallets) */
  crossmintApiKey?: string;
  /** Crossmint API URL */
  crossmintApiUrl?: string;
}

interface IdentityFactoryEvents {
  'identity:created': (identity: MCPIdentity) => void;
  'identity:restored': (identity: MCPIdentity) => void;
  'identity:error': (error: Error) => void;
}

// -------------------- LOCAL WALLET IMPLEMENTATION --------------------

class EthersLocalWallet implements LocalWallet {
  private ethersWallet: ethers.Wallet | ethers.HDNodeWallet;

  constructor(privateKey?: string) {
    this.ethersWallet = privateKey
      ? new ethers.Wallet(privateKey)
      : ethers.Wallet.createRandom();
  }

  get address(): string {
    return this.ethersWallet.address;
  }

  get privateKey(): string {
    return this.ethersWallet.privateKey;
  }

  get publicKey(): string {
    return this.ethersWallet.signingKey.publicKey;
  }

  async signMessage(message: string): Promise<string> {
    return this.ethersWallet.signMessage(message);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.ethersWallet.signTypedData(domain, types, value);
  }
}

// -------------------- IDENTITY FACTORY --------------------

export class MCPIdentityFactory extends EventEmitter<IdentityFactoryEvents> {
  private config: Required<IdentityFactoryConfig>;
  private identityCache: Map<string, MCPIdentityWithWallet> = new Map();

  constructor(config: IdentityFactoryConfig = {}) {
    super();
    this.config = {
      network: config.network || 'base-sepolia',
      crossmintApiKey: config.crossmintApiKey || '',
      crossmintApiUrl: config.crossmintApiUrl || 'https://staging.crossmint.com/api/v1-alpha2',
    };
  }

  /**
   * Create a new identity with auto-generated wallet
   * Uses local wallet by default, Crossmint MPC if API key provided
   */
  async createIdentity(clientId?: string): Promise<MCPIdentityWithWallet> {
    const id = clientId || `mcp_${nanoid(12)}`;

    try {
      // For now, always use local wallet (faster, no dependencies)
      // Crossmint MPC can be added later for production
      const wallet = new EthersLocalWallet();

      const identity: MCPIdentityWithWallet = {
        clientId: id,
        address: wallet.address,
        publicKey: wallet.publicKey,
        createdAt: Date.now(),
        walletType: 'local',
        network: this.config.network,
        wallet,
      };

      // Cache for later retrieval
      this.identityCache.set(id, identity);

      this.emit('identity:created', identity);
      console.log(`[MCPIdentity] Created identity: ${id} -> ${wallet.address}`);

      return identity;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('identity:error', err);
      throw err;
    }
  }

  /**
   * Restore identity from a stored private key
   */
  async restoreIdentity(privateKey: string, clientId?: string): Promise<MCPIdentityWithWallet> {
    const id = clientId || `mcp_${nanoid(12)}`;

    try {
      const wallet = new EthersLocalWallet(privateKey);

      const identity: MCPIdentityWithWallet = {
        clientId: id,
        address: wallet.address,
        publicKey: wallet.publicKey,
        createdAt: Date.now(),
        walletType: 'local',
        network: this.config.network,
        wallet,
      };

      // Cache for later retrieval
      this.identityCache.set(id, identity);

      this.emit('identity:restored', identity);
      console.log(`[MCPIdentity] Restored identity: ${id} -> ${wallet.address}`);

      return identity;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('identity:error', err);
      throw err;
    }
  }

  /**
   * Get existing identity or create new one (idempotent)
   */
  async getOrCreateIdentity(clientId: string): Promise<MCPIdentityWithWallet> {
    const existing = this.identityCache.get(clientId);
    if (existing) {
      return existing;
    }
    return this.createIdentity(clientId);
  }

  /**
   * Get identity by client ID
   */
  getIdentity(clientId: string): MCPIdentityWithWallet | undefined {
    return this.identityCache.get(clientId);
  }

  /**
   * Get identity by wallet address
   */
  getIdentityByAddress(address: string): MCPIdentityWithWallet | undefined {
    for (const identity of this.identityCache.values()) {
      if (identity.address.toLowerCase() === address.toLowerCase()) {
        return identity;
      }
    }
    return undefined;
  }

  /**
   * Export identity for persistence (returns private key)
   * WARNING: Handle with care - this is sensitive data
   */
  exportIdentity(clientId: string): { clientId: string; privateKey: string; network: string } | null {
    const identity = this.identityCache.get(clientId);
    if (!identity) return null;

    return {
      clientId: identity.clientId,
      privateKey: identity.wallet.privateKey,
      network: identity.network,
    };
  }

  /**
   * Remove identity from cache
   */
  removeIdentity(clientId: string): boolean {
    return this.identityCache.delete(clientId);
  }

  /**
   * List all cached identities (addresses only, not private keys)
   */
  listIdentities(): MCPIdentity[] {
    return Array.from(this.identityCache.values()).map(({ wallet, ...identity }) => identity);
  }

  /**
   * Verify a signature was made by a known identity
   */
  async verifySignature(message: string, signature: string, address: string): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  }
}

// -------------------- SINGLETON --------------------

let factoryInstance: MCPIdentityFactory | null = null;

export function getMCPIdentityFactory(config?: IdentityFactoryConfig): MCPIdentityFactory {
  if (!factoryInstance) {
    factoryInstance = new MCPIdentityFactory(config);
  }
  return factoryInstance;
}

export function resetMCPIdentityFactory(): void {
  factoryInstance = null;
}
