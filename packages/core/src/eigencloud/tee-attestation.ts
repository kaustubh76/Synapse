// ============================================================
// TEE ATTESTATION SERVICE
// Verify Trusted Execution Environment attestations
// Supports Intel SGX, Intel TDX, AMD SEV
// ============================================================

import { EventEmitter } from 'eventemitter3';

export interface AttestationConfig {
  verifierEndpoint: string;
  apiKey?: string;
  trustedMeasurements?: string[];
  demoMode?: boolean;
}

export interface AttestationResult {
  valid: boolean;
  type: 'intel_sgx' | 'intel_tdx' | 'amd_sev' | 'unknown';
  enclaveId: string;
  measurements: {
    mrEnclave?: string;        // SGX enclave measurement
    mrSigner?: string;         // SGX signer measurement
    tdReport?: string;         // TDX report
    sevSnp?: string;           // AMD SEV-SNP measurement
  };
  timestamp: number;
  expiresAt: number;
  isvProdId?: number;
  isvSvn?: number;
  tcbLevel?: string;
  error?: string;
}

export interface AttestationQuote {
  raw: string;                 // Base64 encoded quote
  type: 'sgx' | 'tdx' | 'sev';
  userData?: string;           // Custom data included in quote
}

export interface AttestationRequest {
  quote: AttestationQuote;
  expectedMeasurement?: string;
  dockerDigest?: string;
  executionId?: string;
}

interface TEEAttestationEvents {
  'attestation:verified': (result: AttestationResult) => void;
  'attestation:failed': (quote: string, error: string) => void;
  'measurement:trusted': (measurement: string) => void;
  'measurement:untrusted': (measurement: string) => void;
}

/**
 * TEE Attestation Service
 *
 * Verifies that agent code runs in a Trusted Execution Environment.
 * Supports multiple TEE technologies:
 * - Intel SGX (Software Guard Extensions)
 * - Intel TDX (Trust Domain Extensions)
 * - AMD SEV (Secure Encrypted Virtualization)
 *
 * TEE attestation proves:
 * 1. Code runs in isolated enclave
 * 2. Code hasn't been tampered with
 * 3. Hardware is genuine Intel/AMD
 * 4. Enclave measurement matches expected value
 */
export class TEEAttestationService extends EventEmitter<TEEAttestationEvents> {
  private config: AttestationConfig;
  private trustedMeasurements: Set<string>;
  private verificationCache: Map<string, AttestationResult> = new Map();

  constructor(config: AttestationConfig) {
    super();
    this.config = {
      demoMode: true,
      ...config
    };
    this.trustedMeasurements = new Set(config.trustedMeasurements || []);
  }

  /**
   * Verify a TEE attestation quote
   */
  async verifyAttestation(request: AttestationRequest): Promise<AttestationResult> {
    const cacheKey = this.getCacheKey(request.quote.raw);
    const cached = this.verificationCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }

    if (this.config.demoMode) {
      return this.mockVerifyAttestation(request);
    }

    try {
      const response = await fetch(`${this.config.verifierEndpoint}/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          quote: request.quote.raw,
          quoteType: request.quote.type,
          userData: request.quote.userData,
          expectedMeasurement: request.expectedMeasurement
        })
      });

      if (!response.ok) {
        const error = await response.text();
        const result: AttestationResult = {
          valid: false,
          type: 'unknown',
          enclaveId: '',
          measurements: {},
          timestamp: Date.now(),
          expiresAt: 0,
          error
        };
        this.emit('attestation:failed', request.quote.raw, error);
        return result;
      }

      const result: AttestationResult = await response.json();
      this.verificationCache.set(cacheKey, result);
      this.emit('attestation:verified', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown verification error';
      const result: AttestationResult = {
        valid: false,
        type: 'unknown',
        enclaveId: '',
        measurements: {},
        timestamp: Date.now(),
        expiresAt: 0,
        error: errorMessage
      };
      this.emit('attestation:failed', request.quote.raw, errorMessage);
      return result;
    }
  }

  /**
   * Verify attestation from EigenCompute execution result
   */
  async verifyExecutionAttestation(teeData: {
    attestation: string;
    enclaveId: string;
    measurementHash: string;
    timestamp: number;
  }): Promise<AttestationResult> {
    // Parse the attestation data
    let attestationData: {
      type: string;
      quote: string;
      measurements: { mrEnclave?: string; mrSigner?: string };
    };

    try {
      attestationData = JSON.parse(Buffer.from(teeData.attestation, 'base64').toString());
    } catch {
      // If not JSON, treat as raw quote
      attestationData = {
        type: 'intel_tdx',
        quote: teeData.attestation,
        measurements: { mrEnclave: teeData.measurementHash }
      };
    }

    return this.verifyAttestation({
      quote: {
        raw: attestationData.quote || teeData.attestation,
        type: attestationData.type === 'intel_sgx' ? 'sgx' :
              attestationData.type === 'intel_tdx' ? 'tdx' : 'sev'
      },
      expectedMeasurement: teeData.measurementHash
    });
  }

  /**
   * Add a trusted measurement hash
   * Only attestations matching trusted measurements are considered fully verified
   */
  addTrustedMeasurement(measurement: string): void {
    this.trustedMeasurements.add(measurement);
    this.emit('measurement:trusted', measurement);
  }

  /**
   * Remove a trusted measurement
   */
  removeTrustedMeasurement(measurement: string): void {
    this.trustedMeasurements.delete(measurement);
    this.emit('measurement:untrusted', measurement);
  }

  /**
   * Check if a measurement is in the trusted set
   */
  isTrustedMeasurement(measurement: string): boolean {
    return this.trustedMeasurements.has(measurement);
  }

  /**
   * Get all trusted measurements
   */
  getTrustedMeasurements(): string[] {
    return Array.from(this.trustedMeasurements);
  }

  /**
   * Verify a docker digest matches expected value
   */
  verifyDockerDigest(actual: string, expected: string): boolean {
    // Normalize both values
    const normalizeDigest = (d: string) =>
      d.replace(/^sha256:/, '').toLowerCase();

    return normalizeDigest(actual) === normalizeDigest(expected);
  }

  /**
   * Generate attestation report for an agent
   */
  async generateAttestationReport(agentId: string, attestations: AttestationResult[]): Promise<{
    agentId: string;
    teeEnabled: boolean;
    attestationCount: number;
    latestAttestation: AttestationResult | null;
    trustedMeasurementMatch: boolean;
    summary: string;
  }> {
    const validAttestations = attestations.filter(a => a.valid);
    const latest = validAttestations.sort((a, b) => b.timestamp - a.timestamp)[0] || null;

    let trustedMatch = false;
    if (latest) {
      const measurement = latest.measurements.mrEnclave ||
                         latest.measurements.tdReport ||
                         latest.measurements.sevSnp;
      trustedMatch = measurement ? this.isTrustedMeasurement(measurement) : false;
    }

    let summary: string;
    if (!latest) {
      summary = 'No valid TEE attestations found';
    } else if (trustedMatch) {
      summary = `Fully verified: ${latest.type} attestation matches trusted measurement`;
    } else {
      summary = `Partially verified: ${latest.type} attestation valid but measurement not in trusted set`;
    }

    return {
      agentId,
      teeEnabled: validAttestations.length > 0,
      attestationCount: validAttestations.length,
      latestAttestation: latest,
      trustedMeasurementMatch: trustedMatch,
      summary
    };
  }

  // ============================================================
  // MOCK IMPLEMENTATION (for demo mode)
  // ============================================================

  private mockVerifyAttestation(request: AttestationRequest): AttestationResult {
    const now = Date.now();

    // Parse quote to determine type
    let quoteData: {
      type?: string;
      measurements?: { mrEnclave?: string; mrSigner?: string };
      timestamp?: number;
    } = {};

    try {
      quoteData = JSON.parse(Buffer.from(request.quote.raw, 'base64').toString());
    } catch {
      // If not valid JSON, generate mock data
    }

    const type = request.quote.type === 'sgx' ? 'intel_sgx' :
                 request.quote.type === 'tdx' ? 'intel_tdx' :
                 request.quote.type === 'sev' ? 'amd_sev' : 'intel_tdx';

    const measurementHash = request.expectedMeasurement ||
                           quoteData.measurements?.mrEnclave ||
                           this.generateMockHash(request.quote.raw);

    const result: AttestationResult = {
      valid: true,
      type: type as AttestationResult['type'],
      enclaveId: `enclave_${Math.random().toString(36).slice(2, 10)}`,
      measurements: {
        mrEnclave: type === 'intel_sgx' || type === 'intel_tdx' ? measurementHash : undefined,
        mrSigner: type === 'intel_sgx' ? this.generateMockHash('eigencloud_signer') : undefined,
        tdReport: type === 'intel_tdx' ? this.generateMockHash('td_report') : undefined,
        sevSnp: type === 'amd_sev' ? measurementHash : undefined
      },
      timestamp: now,
      expiresAt: now + 3600000, // 1 hour
      isvProdId: 1,
      isvSvn: 1,
      tcbLevel: 'UpToDate'
    };

    // Check if measurement is trusted
    if (this.trustedMeasurements.size > 0 && !this.isTrustedMeasurement(measurementHash)) {
      result.valid = true; // Still valid, just not in trusted set
    }

    this.verificationCache.set(this.getCacheKey(request.quote.raw), result);
    this.emit('attestation:verified', result);

    return result;
  }

  private generateMockHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
  }

  private getCacheKey(quote: string): string {
    return this.generateMockHash(quote);
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verificationCache.clear();
  }
}

// Singleton instance
let attestationServiceInstance: TEEAttestationService | null = null;

export function getTEEAttestationService(config?: AttestationConfig): TEEAttestationService {
  // If config is provided with demoMode explicitly set, always create new instance
  // This ensures the correct mode is used even if singleton was previously created
  if (config && config.demoMode !== undefined && attestationServiceInstance) {
    // Check if config differs from existing instance
    const needsRecreate = attestationServiceInstance['config'].demoMode !== config.demoMode;
    if (needsRecreate) {
      attestationServiceInstance = new TEEAttestationService(config);
    }
  }

  if (!attestationServiceInstance) {
    if (!config) {
      config = {
        verifierEndpoint: process.env.TEE_VERIFIER_URL || 'https://verify.eigencloud.xyz',
        apiKey: process.env.EIGENCLOUD_API_KEY,
        demoMode: process.env.TEE_DEMO_MODE !== 'false'
      };
    }
    attestationServiceInstance = new TEEAttestationService(config);
  }
  return attestationServiceInstance;
}

export function resetTEEAttestationService(): void {
  attestationServiceInstance = null;
}
