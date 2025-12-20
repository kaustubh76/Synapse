// ============================================================
// SYNAPSE PROVIDER REGISTRY
// Manages provider registration, discovery, and reputation
// ============================================================

import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import {
  Provider,
  ProviderRegistration,
  ProviderStatus,
  SYNAPSE_CONSTANTS
} from '@synapse/types';

interface ProviderRegistryEvents {
  'provider:registered': (provider: Provider) => void;
  'provider:updated': (provider: Provider) => void;
  'provider:removed': (providerId: string) => void;
  'provider:online': (provider: Provider) => void;
  'provider:offline': (provider: Provider) => void;
}

export class ProviderRegistry extends EventEmitter<ProviderRegistryEvents> {
  private providers: Map<string, Provider> = new Map();
  private providersByAddress: Map<string, string> = new Map(); // address -> id
  private providersByCapability: Map<string, Set<string>> = new Map(); // capability -> provider ids
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds

  // -------------------- REGISTRATION --------------------

  registerProvider(registration: ProviderRegistration): Provider {
    // Check if provider already exists by address
    const existingId = this.providersByAddress.get(registration.address);
    if (existingId) {
      // Update existing provider
      return this.updateProvider(existingId, registration);
    }

    const provider: Provider = {
      id: `prov_${nanoid(12)}`,
      address: registration.address,
      name: registration.name,
      description: registration.description,
      capabilities: registration.capabilities,
      endpoint: registration.endpoint,
      teeAttested: false,
      verificationLevel: 'none',
      reputationScore: 3.0, // Start at neutral reputation
      totalJobs: 0,
      successfulJobs: 0,
      totalEarnings: 0,
      avgResponseTime: 0,
      stakedAmount: 0,
      slashCount: 0,
      status: ProviderStatus.ONLINE,
      lastActiveAt: Date.now()
    };

    this.providers.set(provider.id, provider);
    this.providersByAddress.set(provider.address, provider.id);

    // Index by capabilities
    for (const capability of provider.capabilities) {
      if (!this.providersByCapability.has(capability)) {
        this.providersByCapability.set(capability, new Set());
      }
      this.providersByCapability.get(capability)!.add(provider.id);
    }

    this.startHeartbeatTimer(provider.id);
    this.emit('provider:registered', provider);

    return provider;
  }

  private updateProvider(providerId: string, registration: Partial<ProviderRegistration>): Provider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Remove old capability indices
    if (registration.capabilities) {
      for (const capability of provider.capabilities) {
        this.providersByCapability.get(capability)?.delete(providerId);
      }
    }

    // Update provider
    if (registration.name) provider.name = registration.name;
    if (registration.description) provider.description = registration.description;
    if (registration.capabilities) provider.capabilities = registration.capabilities;
    if (registration.endpoint) provider.endpoint = registration.endpoint;

    provider.lastActiveAt = Date.now();
    provider.status = ProviderStatus.ONLINE;

    // Re-index capabilities
    if (registration.capabilities) {
      for (const capability of provider.capabilities) {
        if (!this.providersByCapability.has(capability)) {
          this.providersByCapability.set(capability, new Set());
        }
        this.providersByCapability.get(capability)!.add(providerId);
      }
    }

    this.emit('provider:updated', provider);
    return provider;
  }

  removeProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    // Clear heartbeat timer
    this.clearHeartbeatTimer(providerId);

    // Remove from indices
    this.providersByAddress.delete(provider.address);
    for (const capability of provider.capabilities) {
      this.providersByCapability.get(capability)?.delete(providerId);
    }

    this.providers.delete(providerId);
    this.emit('provider:removed', providerId);
    return true;
  }

  // -------------------- HEARTBEAT --------------------

  private startHeartbeatTimer(providerId: string): void {
    const timer = setTimeout(() => {
      this.markOffline(providerId);
    }, this.HEARTBEAT_TIMEOUT);

    this.heartbeatTimers.set(providerId, timer);
  }

  private clearHeartbeatTimer(providerId: string): void {
    const timer = this.heartbeatTimers.get(providerId);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(providerId);
    }
  }

  heartbeat(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    this.clearHeartbeatTimer(providerId);
    provider.lastActiveAt = Date.now();

    if (provider.status === ProviderStatus.OFFLINE) {
      provider.status = ProviderStatus.ONLINE;
      this.emit('provider:online', provider);
    }

    this.startHeartbeatTimer(providerId);
  }

  heartbeatByAddress(address: string): void {
    const providerId = this.providersByAddress.get(address);
    if (providerId) {
      this.heartbeat(providerId);
    }
  }

  private markOffline(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    provider.status = ProviderStatus.OFFLINE;
    this.emit('provider:offline', provider);
  }

  // -------------------- REPUTATION --------------------

  recordJobSuccess(providerId: string, responseTime: number, earnings: number): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    provider.totalJobs++;
    provider.successfulJobs++;
    provider.totalEarnings += earnings;

    // Update average response time
    const totalTime = provider.avgResponseTime * (provider.totalJobs - 1) + responseTime;
    provider.avgResponseTime = totalTime / provider.totalJobs;

    // Increase reputation (max 5.0)
    provider.reputationScore = Math.min(5.0,
      provider.reputationScore + SYNAPSE_CONSTANTS.REPUTATION_BONUS_SUCCESS
    );

    this.emit('provider:updated', provider);
  }

  recordJobFailure(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    provider.totalJobs++;

    // Decrease reputation (min 0)
    provider.reputationScore = Math.max(0,
      provider.reputationScore - SYNAPSE_CONSTANTS.REPUTATION_PENALTY_FAILURE
    );

    this.emit('provider:updated', provider);
  }

  slashProvider(providerId: string, amount: number): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    provider.slashCount++;
    provider.stakedAmount = Math.max(0, provider.stakedAmount - amount);

    // Additional reputation penalty for slash
    provider.reputationScore = Math.max(0,
      provider.reputationScore - SYNAPSE_CONSTANTS.REPUTATION_PENALTY_FAILURE * 2
    );

    this.emit('provider:updated', provider);
  }

  // -------------------- QUERIES --------------------

  getProvider(providerId: string): Provider | undefined {
    return this.providers.get(providerId);
  }

  getProviderByAddress(address: string): Provider | undefined {
    const id = this.providersByAddress.get(address);
    return id ? this.providers.get(id) : undefined;
  }

  getProvidersByCapability(capability: string): Provider[] {
    const ids = this.providersByCapability.get(capability);
    if (!ids) return [];

    return Array.from(ids)
      .map(id => this.providers.get(id)!)
      .filter(p => p && p.status === ProviderStatus.ONLINE);
  }

  getOnlineProviders(): Provider[] {
    return Array.from(this.providers.values())
      .filter(p => p.status === ProviderStatus.ONLINE);
  }

  getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  getProviderCount(): number {
    return this.providers.size;
  }

  getOnlineProviderCount(): number {
    return this.getOnlineProviders().length;
  }

  // -------------------- DISCOVERY --------------------

  /**
   * Find providers that can fulfill an intent type
   */
  discoverProviders(intentType: string, requirements?: {
    minReputation?: number;
    requireTEE?: boolean;
    excludedProviders?: string[];
  }): Provider[] {
    let providers = this.getProvidersByCapability(intentType);

    if (requirements) {
      if (requirements.minReputation) {
        providers = providers.filter(p =>
          p.reputationScore >= requirements.minReputation!
        );
      }

      if (requirements.requireTEE) {
        providers = providers.filter(p => p.teeAttested);
      }

      if (requirements.excludedProviders?.length) {
        providers = providers.filter(p =>
          !requirements.excludedProviders!.includes(p.address)
        );
      }
    }

    // Sort by reputation
    return providers.sort((a, b) => b.reputationScore - a.reputationScore);
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    total: number;
    online: number;
    offline: number;
    avgReputation: number;
    totalEarnings: number;
    capabilityCounts: Record<string, number>;
  } {
    const all = this.getAllProviders();
    const online = all.filter(p => p.status === ProviderStatus.ONLINE);

    const avgReputation = all.length > 0
      ? all.reduce((sum, p) => sum + p.reputationScore, 0) / all.length
      : 0;

    const totalEarnings = all.reduce((sum, p) => sum + p.totalEarnings, 0);

    const capabilityCounts: Record<string, number> = {};
    for (const [capability, ids] of this.providersByCapability.entries()) {
      capabilityCounts[capability] = ids.size;
    }

    return {
      total: all.length,
      online: online.length,
      offline: all.length - online.length,
      avgReputation: Math.round(avgReputation * 100) / 100,
      totalEarnings,
      capabilityCounts
    };
  }
}

// Singleton instance
let registryInstance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

export function resetProviderRegistry(): void {
  registryInstance = null;
}
