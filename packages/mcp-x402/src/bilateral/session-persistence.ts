// ============================================================
// BILATERAL SESSION PERSISTENCE
// Persistent storage for bilateral session state
// ============================================================

import { promises as fs } from 'fs';
import * as path from 'path';
import type { BilateralSession } from './bilateral-session.js';

/**
 * Persistence data structure
 */
export interface SessionPersistenceData {
  version: string;
  lastSaved: number;
  sessions: Record<string, BilateralSession>;
}

/**
 * Persistence configuration
 */
export interface SessionPersistenceConfig {
  dataPath?: string;
  autoSaveInterval?: number; // milliseconds
  enableAutoSave?: boolean;
}

/**
 * Bilateral Session Persistence Manager
 *
 * Persists session state to a JSON file.
 * Automatically saves on changes and loads on startup.
 */
export class SessionPersistence {
  private dataPath: string;
  private autoSaveInterval: number;
  private enableAutoSave: boolean;
  private saveTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(config: SessionPersistenceConfig = {}) {
    this.dataPath = config.dataPath || './data/sessions.json';
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
      console.log(`[SessionPersistence] Data directory ensured: ${dir}`);
    } catch (error) {
      console.error(`[SessionPersistence] Failed to create directory: ${error}`);
    }
  }

  /**
   * Load persisted data from disk
   */
  async load(): Promise<SessionPersistenceData | null> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data) as SessionPersistenceData;
      console.log(
        `[SessionPersistence] Loaded ${Object.keys(parsed.sessions).length} sessions from ${this.dataPath}`
      );
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[SessionPersistence] No existing data file found at ${this.dataPath}`);
        return null;
      }
      console.error(`[SessionPersistence] Error loading data: ${error}`);
      return null;
    }
  }

  /**
   * Save data to disk
   */
  async save(sessions: Map<string, BilateralSession>): Promise<void> {
    try {
      const data: SessionPersistenceData = {
        version: '1.0',
        lastSaved: Date.now(),
        sessions: Object.fromEntries(sessions),
      };

      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;

      console.log(
        `[SessionPersistence] Saved ${sessions.size} sessions to ${this.dataPath}`
      );
    } catch (error) {
      console.error(`[SessionPersistence] Error saving data: ${error}`);
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
  startAutoSave(getSessions: () => Map<string, BilateralSession>): void {
    if (!this.enableAutoSave) return;

    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save(getSessions());
        } catch (error) {
          console.error('[SessionPersistence] Auto-save failed:', error);
        }
      }
    }, this.autoSaveInterval);

    console.log(`[SessionPersistence] Auto-save enabled every ${this.autoSaveInterval}ms`);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      console.log('[SessionPersistence] Auto-save stopped');
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

let persistenceInstance: SessionPersistence | null = null;

export function getSessionPersistence(config?: SessionPersistenceConfig): SessionPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new SessionPersistence(config);
  }
  return persistenceInstance;
}

export function resetSessionPersistence(): void {
  if (persistenceInstance) {
    persistenceInstance.stopAutoSave();
  }
  persistenceInstance = null;
}
