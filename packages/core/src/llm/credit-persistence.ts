// ============================================================
// SYNAPSE CREDIT SCORE PERSISTENCE
// Persistent storage for agent credit profiles
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { AgentCreditProfile } from './types.js';
import { CreditTransaction } from './credit-score-system.js';

export interface CreditPersistenceData {
  version: string;
  lastSaved: number;
  profiles: Record<string, AgentCreditProfile>;
  transactions: Record<string, CreditTransaction[]>;
}

export interface CreditPersistenceConfig {
  dataPath?: string;
  autoSaveInterval?: number; // milliseconds
  enableAutoSave?: boolean;
}

/**
 * Credit Score Persistence Manager
 *
 * Persists credit profiles and transactions to a JSON file.
 * Automatically saves on changes and loads on startup.
 */
export class CreditPersistence {
  private dataPath: string;
  private autoSaveInterval: number;
  private enableAutoSave: boolean;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(config: CreditPersistenceConfig = {}) {
    this.dataPath = config.dataPath || './data/credit-scores.json';
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
      console.log(`[CreditPersistence] Data directory ensured: ${dir}`);
    } catch (error) {
      console.error(`[CreditPersistence] Failed to create directory: ${error}`);
    }
  }

  /**
   * Load persisted data from disk
   */
  async load(): Promise<CreditPersistenceData | null> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data) as CreditPersistenceData;
      console.log(
        `[CreditPersistence] Loaded ${Object.keys(parsed.profiles).length} profiles from ${this.dataPath}`
      );
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[CreditPersistence] No existing data file found at ${this.dataPath}`);
        return null;
      }
      console.error(`[CreditPersistence] Error loading data: ${error}`);
      return null;
    }
  }

  /**
   * Save data to disk
   */
  async save(
    profiles: Map<string, AgentCreditProfile>,
    transactions: Map<string, CreditTransaction[]>
  ): Promise<void> {
    try {
      const data: CreditPersistenceData = {
        version: '1.0',
        lastSaved: Date.now(),
        profiles: Object.fromEntries(profiles),
        transactions: Object.fromEntries(transactions),
      };

      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;

      console.log(
        `[CreditPersistence] Saved ${profiles.size} profiles to ${this.dataPath}`
      );
    } catch (error) {
      console.error(`[CreditPersistence] Error saving data: ${error}`);
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
  startAutoSave(
    getProfiles: () => Map<string, AgentCreditProfile>,
    getTransactions: () => Map<string, CreditTransaction[]>
  ): void {
    if (!this.enableAutoSave) return;

    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save(getProfiles(), getTransactions());
        } catch (error) {
          console.error('[CreditPersistence] Auto-save failed:', error);
        }
      }
    }, this.autoSaveInterval);

    console.log(`[CreditPersistence] Auto-save enabled every ${this.autoSaveInterval}ms`);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      console.log('[CreditPersistence] Auto-save stopped');
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

let persistenceInstance: CreditPersistence | null = null;

export function getCreditPersistence(config?: CreditPersistenceConfig): CreditPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new CreditPersistence(config);
  }
  return persistenceInstance;
}

export function resetCreditPersistence(): void {
  if (persistenceInstance) {
    persistenceInstance.stopAutoSave();
  }
  persistenceInstance = null;
}
