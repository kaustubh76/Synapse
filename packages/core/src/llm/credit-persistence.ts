// ============================================================
// SYNAPSE CREDIT SCORE PERSISTENCE
// Persistent storage for agent credit profiles
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { AgentCreditProfile } from './types.js';
import { CreditTransaction } from './credit-score-system.js';

export interface CreditPersistenceData {
  version: string;
  lastSaved: number;
  checksum?: string; // Data integrity checksum
  profiles: Record<string, AgentCreditProfile>;
  transactions: Record<string, CreditTransaction[]>;
}

export interface CreditPersistenceConfig {
  dataPath?: string;
  autoSaveInterval?: number; // milliseconds
  enableAutoSave?: boolean;
  debounceMs?: number; // Debounce rapid changes before writing
  maxTransactionsPerAgent?: number; // Limit transaction history
  enableBackup?: boolean; // Create backup before writing
}

// Statistics for monitoring
interface PersistenceStats {
  totalSaves: number;
  totalLoads: number;
  lastSaveTime: number;
  lastLoadTime: number;
  lastSaveDuration: number;
  saveErrors: number;
  debounceSkips: number;
  checksumMismatches: number;
}

/**
 * Credit Score Persistence Manager
 *
 * Persists credit profiles and transactions to a JSON file.
 * Features:
 * - Debounced writes to reduce I/O
 * - Batched saves (dirty flag)
 * - Data integrity checksums
 * - Optional backup before write
 * - Transaction history limits
 */
export class CreditPersistence {
  private dataPath: string;
  private autoSaveInterval: number;
  private enableAutoSave: boolean;
  private debounceMs: number;
  private maxTransactionsPerAgent: number;
  private enableBackup: boolean;

  private saveTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;
  private isSaving: boolean = false;
  private pendingSave: (() => Promise<void>) | null = null;

  private stats: PersistenceStats = {
    totalSaves: 0,
    totalLoads: 0,
    lastSaveTime: 0,
    lastLoadTime: 0,
    lastSaveDuration: 0,
    saveErrors: 0,
    debounceSkips: 0,
    checksumMismatches: 0,
  };

  constructor(config: CreditPersistenceConfig = {}) {
    this.dataPath = config.dataPath || './data/credit-scores.json';
    this.autoSaveInterval = config.autoSaveInterval || 30000; // 30 seconds
    this.enableAutoSave = config.enableAutoSave ?? true;
    this.debounceMs = config.debounceMs ?? 2000; // 2 seconds debounce
    this.maxTransactionsPerAgent = config.maxTransactionsPerAgent ?? 100;
    this.enableBackup = config.enableBackup ?? true;
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
   * Compute checksum for data integrity verification
   */
  private computeChecksum(profiles: Record<string, AgentCreditProfile>): string {
    const data = JSON.stringify(profiles);
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Verify data integrity using checksum
   */
  private verifyChecksum(data: CreditPersistenceData): boolean {
    if (!data.checksum) return true; // No checksum = legacy data, accept it

    const computed = this.computeChecksum(data.profiles);
    if (computed !== data.checksum) {
      console.warn(`[CreditPersistence] Checksum mismatch! Expected ${data.checksum}, got ${computed}`);
      this.stats.checksumMismatches++;
      return false;
    }
    return true;
  }

  /**
   * Load persisted data from disk
   */
  async load(): Promise<CreditPersistenceData | null> {
    const startTime = Date.now();

    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data) as CreditPersistenceData;

      // Verify data integrity
      if (!this.verifyChecksum(parsed)) {
        // Try loading from backup
        console.warn('[CreditPersistence] Attempting to load from backup...');
        try {
          const backupData = await fs.readFile(`${this.dataPath}.backup`, 'utf-8');
          const backupParsed = JSON.parse(backupData) as CreditPersistenceData;
          if (this.verifyChecksum(backupParsed)) {
            console.log('[CreditPersistence] Loaded from backup successfully');
            this.stats.totalLoads++;
            this.stats.lastLoadTime = Date.now();
            return backupParsed;
          }
        } catch {
          // No valid backup
        }
        // Accept corrupted data with warning (better than losing everything)
        console.warn('[CreditPersistence] Using potentially corrupted data');
      }

      this.stats.totalLoads++;
      this.stats.lastLoadTime = Date.now();

      console.log(
        `[CreditPersistence] Loaded ${Object.keys(parsed.profiles).length} profiles in ${Date.now() - startTime}ms`
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
   * Trim transaction history to limit memory/storage
   */
  private trimTransactions(
    transactions: Map<string, CreditTransaction[]>
  ): Record<string, CreditTransaction[]> {
    const result: Record<string, CreditTransaction[]> = {};

    for (const [agentId, txs] of transactions) {
      // Keep only the most recent transactions
      if (txs.length > this.maxTransactionsPerAgent) {
        result[agentId] = txs.slice(-this.maxTransactionsPerAgent);
      } else {
        result[agentId] = txs;
      }
    }

    return result;
  }

  /**
   * Create backup of current data before writing
   */
  private async createBackup(): Promise<void> {
    if (!this.enableBackup) return;

    try {
      await fs.access(this.dataPath);
      await fs.copyFile(this.dataPath, `${this.dataPath}.backup`);
    } catch {
      // No existing file to backup
    }
  }

  /**
   * Save data to disk with debouncing and integrity checks
   */
  async save(
    profiles: Map<string, AgentCreditProfile>,
    transactions: Map<string, CreditTransaction[]>
  ): Promise<void> {
    // If already saving, queue this save for after
    if (this.isSaving) {
      this.pendingSave = async () => {
        await this.save(profiles, transactions);
      };
      return;
    }

    this.isSaving = true;
    const startTime = Date.now();

    try {
      // Create backup before writing
      await this.createBackup();

      // Prepare data with trimmed transactions
      const profilesObj = Object.fromEntries(profiles);
      const transactionsObj = this.trimTransactions(transactions);

      const data: CreditPersistenceData = {
        version: '1.1', // Bumped version for new format with checksum
        lastSaved: Date.now(),
        checksum: this.computeChecksum(profilesObj),
        profiles: profilesObj,
        transactions: transactionsObj,
      };

      // Atomic write: write to temp file first, then rename
      const tempPath = `${this.dataPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, this.dataPath);

      this.isDirty = false;
      this.stats.totalSaves++;
      this.stats.lastSaveTime = Date.now();
      this.stats.lastSaveDuration = Date.now() - startTime;

      console.log(
        `[CreditPersistence] Saved ${profiles.size} profiles in ${this.stats.lastSaveDuration}ms`
      );
    } catch (error) {
      this.stats.saveErrors++;
      console.error(`[CreditPersistence] Error saving data: ${error}`);
      throw error;
    } finally {
      this.isSaving = false;

      // Execute pending save if any
      if (this.pendingSave) {
        const pending = this.pendingSave;
        this.pendingSave = null;
        await pending();
      }
    }
  }

  /**
   * Debounced save - waits for debounceMs before actually saving
   * Multiple calls within the debounce window only result in one save
   */
  debouncedSave(
    getProfiles: () => Map<string, AgentCreditProfile>,
    getTransactions: () => Map<string, CreditTransaction[]>
  ): void {
    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.stats.debounceSkips++;
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (this.isDirty) {
        try {
          await this.save(getProfiles(), getTransactions());
        } catch (error) {
          console.error('[CreditPersistence] Debounced save failed:', error);
        }
      }
    }, this.debounceMs);
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
   * Stop auto-save timer and clean up
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('[CreditPersistence] Auto-save stopped');
  }

  /**
   * Force immediate save (bypasses debounce)
   */
  async forceSave(
    profiles: Map<string, AgentCreditProfile>,
    transactions: Map<string, CreditTransaction[]>
  ): Promise<void> {
    // Cancel any pending debounced save
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    await this.save(profiles, transactions);
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

  /**
   * Get persistence statistics
   */
  getStats(): PersistenceStats {
    return { ...this.stats };
  }

  /**
   * Check if currently saving
   */
  isBusy(): boolean {
    return this.isSaving;
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
