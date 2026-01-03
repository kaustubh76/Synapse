// ============================================================
// MCP IDENTITY PERSISTENCE
// Persistent storage for MCP identities (including private keys)
// WARNING: This stores sensitive cryptographic material
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Persisted identity data (sensitive!)
 */
export interface PersistedIdentity {
  clientId: string;
  address: string;
  publicKey: string;
  privateKey: string;  // WARNING: Sensitive data
  createdAt: number;
  network: 'base' | 'base-sepolia';
}

/**
 * Persistence data structure
 */
export interface IdentityPersistenceData {
  version: string;
  lastSaved: number;
  identities: Record<string, PersistedIdentity>;
}

/**
 * Persistence configuration
 */
export interface IdentityPersistenceConfig {
  dataPath?: string;
  autoSaveInterval?: number; // milliseconds
  enableAutoSave?: boolean;
}

/**
 * MCP Identity Persistence Manager
 *
 * Persists identity state (including private keys) to a JSON file.
 * Automatically saves on changes and loads on startup.
 *
 * WARNING: This stores private keys. Ensure the data file is properly secured.
 */
export class IdentityPersistence {
  private dataPath: string;
  private autoSaveInterval: number;
  private enableAutoSave: boolean;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(config: IdentityPersistenceConfig = {}) {
    this.dataPath = config.dataPath || './data/identities.json';
    this.autoSaveInterval = config.autoSaveInterval || 30000; // 30 seconds
    this.enableAutoSave = config.enableAutoSave ?? true;
  }

  /**
   * Initialize persistence - create directory if needed
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`[IdentityPersistence] Data directory ensured: ${dir}`);
    } catch (error) {
      console.error(`[IdentityPersistence] Failed to create directory: ${error}`);
    }
  }

  /**
   * Load persisted data from disk
   */
  async load(): Promise<IdentityPersistenceData | null> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data) as IdentityPersistenceData;
      console.log(
        `[IdentityPersistence] Loaded ${Object.keys(parsed.identities).length} identities from ${this.dataPath}`
      );
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[IdentityPersistence] No existing data file found at ${this.dataPath}`);
        return null;
      }
      console.error(`[IdentityPersistence] Error loading data: ${error}`);
      return null;
    }
  }

  /**
   * Save data to disk
   */
  async save(identities: Map<string, PersistedIdentity>): Promise<void> {
    try {
      const data: IdentityPersistenceData = {
        version: '1.0',
        lastSaved: Date.now(),
        identities: Object.fromEntries(identities),
      };

      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;

      console.log(
        `[IdentityPersistence] Saved ${identities.size} identities to ${this.dataPath}`
      );
    } catch (error) {
      console.error(`[IdentityPersistence] Error saving data: ${error}`);
      throw error;
    }
  }

  /**
   * Mark data as dirty (needs saving)
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Start auto-save timer
   */
  startAutoSave(getIdentities: () => Map<string, PersistedIdentity>): void {
    if (!this.enableAutoSave) return;

    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save(getIdentities());
        } catch (error) {
          console.error('[IdentityPersistence] Auto-save failed:', error);
        }
      }
    }, this.autoSaveInterval);

    console.log(`[IdentityPersistence] Auto-save enabled every ${this.autoSaveInterval}ms`);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      console.log('[IdentityPersistence] Auto-save stopped');
    }
  }

  /**
   * Get persistence file path
   */
  getDataPath(): string {
    return this.dataPath;
  }

  /**
   * Check if data needs saving
   */
  needsSave(): boolean {
    return this.isDirty;
  }
}

// -------------------- SINGLETON --------------------

let persistenceInstance: IdentityPersistence | null = null;

export function getIdentityPersistence(config?: IdentityPersistenceConfig): IdentityPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new IdentityPersistence(config);
  }
  return persistenceInstance;
}

export function resetIdentityPersistence(): void {
  if (persistenceInstance) {
    persistenceInstance.stopAutoSave();
  }
  persistenceInstance = null;
}
