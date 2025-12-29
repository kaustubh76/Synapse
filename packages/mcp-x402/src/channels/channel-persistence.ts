// ============================================================
// PAYMENT CHANNEL PERSISTENCE
// Persistent storage for payment channel state
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  ChannelConfig,
  ChannelState,
  ChannelPayment,
} from './payment-channel.js';

/**
 * Serializable channel data (no functions/closures)
 */
export interface SerializableChannelData {
  id: string;
  config: ChannelConfig;
  state: ChannelState;
  sequence: number;
  spent: number;
  deposit: number;
  payments: ChannelPayment[];
  createdAt: number;
  expiresAt: number;
  openTxHash?: string;
  closeTxHash?: string;
}

/**
 * Persistence data structure
 */
export interface ChannelPersistenceData {
  version: string;
  lastSaved: number;
  channels: Record<string, SerializableChannelData>;
  recipientIndex: Record<string, string[]>;
}

/**
 * Persistence configuration
 */
export interface ChannelPersistenceConfig {
  dataPath?: string;
  autoSaveInterval?: number; // milliseconds
  enableAutoSave?: boolean;
}

/**
 * Payment Channel Persistence Manager
 *
 * Persists channel state to a JSON file.
 * Automatically saves on changes and loads on startup.
 */
export class ChannelPersistence {
  private dataPath: string;
  private autoSaveInterval: number;
  private enableAutoSave: boolean;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(config: ChannelPersistenceConfig = {}) {
    this.dataPath = config.dataPath || './data/channels.json';
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
      console.log(`[ChannelPersistence] Data directory ensured: ${dir}`);
    } catch (error) {
      console.error(`[ChannelPersistence] Failed to create directory: ${error}`);
    }
  }

  /**
   * Load persisted data from disk
   */
  async load(): Promise<ChannelPersistenceData | null> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data) as ChannelPersistenceData;
      console.log(
        `[ChannelPersistence] Loaded ${Object.keys(parsed.channels).length} channels from ${this.dataPath}`
      );
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[ChannelPersistence] No existing data file found at ${this.dataPath}`);
        return null;
      }
      console.error(`[ChannelPersistence] Error loading data: ${error}`);
      return null;
    }
  }

  /**
   * Save data to disk
   */
  async save(
    channels: Map<string, SerializableChannelData>,
    recipientIndex: Map<string, Set<string>>
  ): Promise<void> {
    try {
      // Convert Set to Array for serialization
      const recipientIndexRecord: Record<string, string[]> = {};
      for (const [recipient, channelIds] of recipientIndex) {
        recipientIndexRecord[recipient] = Array.from(channelIds);
      }

      const data: ChannelPersistenceData = {
        version: '1.0',
        lastSaved: Date.now(),
        channels: Object.fromEntries(channels),
        recipientIndex: recipientIndexRecord,
      };

      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;

      console.log(
        `[ChannelPersistence] Saved ${channels.size} channels to ${this.dataPath}`
      );
    } catch (error) {
      console.error(`[ChannelPersistence] Error saving data: ${error}`);
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
    getChannels: () => Map<string, SerializableChannelData>,
    getRecipientIndex: () => Map<string, Set<string>>
  ): void {
    if (!this.enableAutoSave) return;

    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save(getChannels(), getRecipientIndex());
        } catch (error) {
          console.error('[ChannelPersistence] Auto-save failed:', error);
        }
      }
    }, this.autoSaveInterval);

    console.log(`[ChannelPersistence] Auto-save enabled every ${this.autoSaveInterval}ms`);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      console.log('[ChannelPersistence] Auto-save stopped');
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

let persistenceInstance: ChannelPersistence | null = null;

export function getChannelPersistence(config?: ChannelPersistenceConfig): ChannelPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new ChannelPersistence(config);
  }
  return persistenceInstance;
}

export function resetChannelPersistence(): void {
  if (persistenceInstance) {
    persistenceInstance.stopAutoSave();
  }
  persistenceInstance = null;
}
