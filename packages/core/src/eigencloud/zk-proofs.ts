// ============================================================
// ZK PROOF SERVICE
// Zero-Knowledge Proof Generation and Verification
// For verifiable computation proofs in Synapse
// ============================================================

import { EventEmitter } from 'eventemitter3';

export interface ZKProofConfig {
  verifierEndpoint: string;
  apiKey?: string;
  defaultProtocol?: 'groth16' | 'plonk' | 'stark';
  defaultCurve?: 'bn128' | 'bls12_381';
  demoMode?: boolean;
}

export interface ZKProof {
  id: string;
  protocol: 'groth16' | 'plonk' | 'stark';
  curve?: 'bn128' | 'bls12_381';
  proof: string;                      // Base64 encoded proof
  publicInputs: string[];
  verificationKey: string;
  circuitId?: string;
  timestamp: number;
}

export interface ZKVerificationResult {
  valid: boolean;
  proofId: string;
  verifiedAt: number;
  publicInputs: string[];
  computationHash?: string;
  error?: string;
}

export interface ProofGenerationRequest {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  computationType: string;            // e.g., "weather.current", "crypto.price"
  executionId?: string;
  protocol?: 'groth16' | 'plonk' | 'stark';
}

export interface ProofVerificationRequest {
  proof: ZKProof;
  expectedInputHash?: string;
  expectedOutputHash?: string;
}

interface ZKProofEvents {
  'proof:generated': (proof: ZKProof) => void;
  'proof:verified': (result: ZKVerificationResult) => void;
  'proof:failed': (error: string) => void;
}

/**
 * ZK Proof Service
 *
 * Generates and verifies zero-knowledge proofs for computation.
 * Used to prove that an agent correctly executed a task without
 * revealing the actual computation details.
 *
 * Supports multiple proving systems:
 * - Groth16: Fast verification, requires trusted setup
 * - PLONK: Universal setup, slightly larger proofs
 * - STARK: No trusted setup, largest proofs but quantum-resistant
 *
 * Use cases in Synapse:
 * 1. Prove weather data was fetched correctly
 * 2. Prove crypto price calculation is accurate
 * 3. Prove news aggregation was comprehensive
 */
export class ZKProofService extends EventEmitter<ZKProofEvents> {
  private config: ZKProofConfig;
  private proofCache: Map<string, ZKProof> = new Map();
  private verificationCache: Map<string, ZKVerificationResult> = new Map();
  private circuits: Map<string, { verificationKey: string; circuitHash: string }> = new Map();

  constructor(config: ZKProofConfig) {
    super();
    this.config = {
      defaultProtocol: 'groth16',
      defaultCurve: 'bn128',
      demoMode: true,
      ...config
    };

    // Pre-register common circuits
    this.registerDefaultCircuits();
  }

  /**
   * Generate a ZK proof for a computation
   */
  async generateProof(request: ProofGenerationRequest): Promise<ZKProof> {
    if (this.config.demoMode) {
      return this.mockGenerateProof(request);
    }

    try {
      const response = await fetch(`${this.config.verifierEndpoint}/v1/proofs/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          input: request.input,
          output: request.output,
          computationType: request.computationType,
          protocol: request.protocol || this.config.defaultProtocol
        })
      });

      if (!response.ok) {
        const error = await response.text();
        this.emit('proof:failed', error);
        throw new Error(`Proof generation failed: ${error}`);
      }

      const proof: ZKProof = await response.json();
      this.proofCache.set(proof.id, proof);
      this.emit('proof:generated', proof);
      return proof;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('proof:failed', errorMessage);
      throw error;
    }
  }

  /**
   * Verify a ZK proof
   */
  async verifyProof(request: ProofVerificationRequest): Promise<ZKVerificationResult> {
    const cacheKey = request.proof.id;
    const cached = this.verificationCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    if (this.config.demoMode) {
      return this.mockVerifyProof(request);
    }

    try {
      const response = await fetch(`${this.config.verifierEndpoint}/v1/proofs/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          proof: request.proof.proof,
          publicInputs: request.proof.publicInputs,
          verificationKey: request.proof.verificationKey,
          protocol: request.proof.protocol
        })
      });

      if (!response.ok) {
        const error = await response.text();
        const result: ZKVerificationResult = {
          valid: false,
          proofId: request.proof.id,
          verifiedAt: Date.now(),
          publicInputs: request.proof.publicInputs,
          error
        };
        return result;
      }

      const result: ZKVerificationResult = await response.json();
      this.verificationCache.set(cacheKey, result);
      this.emit('proof:verified', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        proofId: request.proof.id,
        verifiedAt: Date.now(),
        publicInputs: request.proof.publicInputs,
        error: errorMessage
      };
    }
  }

  /**
   * Verify proof from EigenCompute execution result
   */
  async verifyExecutionProof(proofData: {
    zkProof: string;
    publicInputs: string[];
    verificationKey: string;
  } | null): Promise<ZKVerificationResult> {
    if (!proofData) {
      return {
        valid: false,
        proofId: 'none',
        verifiedAt: Date.now(),
        publicInputs: [],
        error: 'No proof provided'
      };
    }

    const proof: ZKProof = {
      id: `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      protocol: 'groth16',
      curve: 'bn128',
      proof: proofData.zkProof,
      publicInputs: proofData.publicInputs,
      verificationKey: proofData.verificationKey,
      timestamp: Date.now()
    };

    return this.verifyProof({ proof });
  }

  /**
   * Register a circuit for a computation type
   */
  registerCircuit(computationType: string, verificationKey: string, circuitHash: string): void {
    this.circuits.set(computationType, { verificationKey, circuitHash });
  }

  /**
   * Get registered circuit for computation type
   */
  getCircuit(computationType: string): { verificationKey: string; circuitHash: string } | undefined {
    return this.circuits.get(computationType);
  }

  /**
   * Batch verify multiple proofs
   */
  async batchVerify(proofs: ZKProof[]): Promise<ZKVerificationResult[]> {
    if (this.config.demoMode) {
      return Promise.all(proofs.map(proof => this.mockVerifyProof({ proof })));
    }

    const response = await fetch(`${this.config.verifierEndpoint}/v1/proofs/batch-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify({ proofs })
    });

    if (!response.ok) {
      throw new Error(`Batch verification failed: ${await response.text()}`);
    }

    const results: ZKVerificationResult[] = await response.json();
    results.forEach((r, i) => {
      this.verificationCache.set(proofs[i].id, r);
      this.emit('proof:verified', r);
    });

    return results;
  }

  /**
   * Compute hash of data for public input
   */
  computeHash(data: unknown): string {
    const str = JSON.stringify(data);
    return this.generateHash(str);
  }

  /**
   * Check if two hashes match (for input/output verification)
   */
  hashesMatch(hash1: string, hash2: string): boolean {
    return hash1.toLowerCase() === hash2.toLowerCase();
  }

  /**
   * Get proof by ID
   */
  getProof(proofId: string): ZKProof | undefined {
    return this.proofCache.get(proofId);
  }

  /**
   * Get verification result by proof ID
   */
  getVerificationResult(proofId: string): ZKVerificationResult | undefined {
    return this.verificationCache.get(proofId);
  }

  // ============================================================
  // MOCK IMPLEMENTATIONS (for demo mode)
  // ============================================================

  private registerDefaultCircuits(): void {
    // Pre-register verification keys for common computation types
    const computeTypes = [
      'weather.current',
      'weather.forecast',
      'crypto.price',
      'crypto.history',
      'news.latest',
      'news.search',
      'compute.general'
    ];

    for (const type of computeTypes) {
      this.circuits.set(type, {
        verificationKey: `vk_${this.generateHash(type)}`,
        circuitHash: this.generateHash(`circuit_${type}`)
      });
    }
  }

  private async mockGenerateProof(request: ProofGenerationRequest): Promise<ZKProof> {
    // Simulate proof generation delay (50-150ms)
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    const inputHash = this.computeHash(request.input);
    const outputHash = this.computeHash(request.output);

    const circuit = this.circuits.get(request.computationType) ||
                   this.circuits.get('compute.general');

    const proof: ZKProof = {
      id: `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      protocol: request.protocol || this.config.defaultProtocol!,
      curve: this.config.defaultCurve,
      proof: this.generateMockProofData(inputHash, outputHash),
      publicInputs: [inputHash, outputHash],
      verificationKey: circuit?.verificationKey || `vk_${this.generateHash('default')}`,
      circuitId: circuit?.circuitHash,
      timestamp: Date.now()
    };

    this.proofCache.set(proof.id, proof);
    this.emit('proof:generated', proof);
    return proof;
  }

  private mockVerifyProof(request: ProofVerificationRequest): ZKVerificationResult {
    const { proof } = request;

    // Parse the mock proof to extract hashes
    let proofData: { inputHash?: string; outputHash?: string } = {};
    try {
      proofData = JSON.parse(Buffer.from(proof.proof, 'base64').toString());
    } catch {
      // If not parseable, still consider valid in demo mode
    }

    // Validate public inputs match expected if provided
    let valid = true;
    if (request.expectedInputHash && proof.publicInputs[0]) {
      valid = valid && this.hashesMatch(request.expectedInputHash, proof.publicInputs[0]);
    }
    if (request.expectedOutputHash && proof.publicInputs[1]) {
      valid = valid && this.hashesMatch(request.expectedOutputHash, proof.publicInputs[1]);
    }

    const result: ZKVerificationResult = {
      valid,
      proofId: proof.id,
      verifiedAt: Date.now(),
      publicInputs: proof.publicInputs,
      computationHash: proofData.inputHash
    };

    this.verificationCache.set(proof.id, result);
    this.emit('proof:verified', result);
    return result;
  }

  private generateMockProofData(inputHash: string, outputHash: string): string {
    const proofData = {
      protocol: this.config.defaultProtocol,
      curve: this.config.defaultCurve,
      pi_a: [
        this.generateHash(`pi_a_0_${inputHash}`),
        this.generateHash(`pi_a_1_${inputHash}`)
      ],
      pi_b: [[
        this.generateHash(`pi_b_0_0_${inputHash}`),
        this.generateHash(`pi_b_0_1_${inputHash}`)
      ], [
        this.generateHash(`pi_b_1_0_${inputHash}`),
        this.generateHash(`pi_b_1_1_${inputHash}`)
      ]],
      pi_c: [
        this.generateHash(`pi_c_0_${outputHash}`),
        this.generateHash(`pi_c_1_${outputHash}`)
      ],
      inputHash,
      outputHash,
      generatedAt: Date.now()
    };
    return Buffer.from(JSON.stringify(proofData)).toString('base64');
  }

  private generateHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.proofCache.clear();
    this.verificationCache.clear();
  }
}

// Singleton instance
let zkProofServiceInstance: ZKProofService | null = null;

export function getZKProofService(config?: ZKProofConfig): ZKProofService {
  if (!zkProofServiceInstance) {
    if (!config) {
      config = {
        verifierEndpoint: process.env.ZK_VERIFIER_URL || 'https://verify.eigencloud.xyz',
        apiKey: process.env.EIGENCLOUD_API_KEY,
        demoMode: process.env.ZK_DEMO_MODE !== 'false'
      };
    }
    zkProofServiceInstance = new ZKProofService(config);
  }
  return zkProofServiceInstance;
}

export function resetZKProofService(): void {
  zkProofServiceInstance = null;
}
