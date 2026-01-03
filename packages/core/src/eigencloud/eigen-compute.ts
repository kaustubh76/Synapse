// ============================================================
// EIGENCOMPUTE CLIENT
// TEE-based execution for verifiable agent computation
// Based on: https://docs.eigencloud.xyz/products/eigencompute
// ============================================================

import { EventEmitter } from 'eventemitter3';

export interface EigenComputeConfig {
  apiEndpoint: string;
  apiKey: string;
  projectId?: string;
  defaultTimeout?: number;
  demoMode?: boolean;
}

export interface ExecutionRequest {
  dockerImage: string;
  dockerDigest?: string;
  command?: string[];
  env?: Record<string, string>;
  input: Record<string, unknown>;
  timeout?: number;
  memoryLimit?: string;
  cpuLimit?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  output: unknown;
  logs?: string;
  metrics: {
    startTime: number;
    endTime: number;
    executionTimeMs: number;
    memoryUsedMb: number;
    cpuTimeMs: number;
  };
  tee: {
    attestation: string;
    enclaveId: string;
    measurementHash: string;
    timestamp: number;
  };
  proof: {
    zkProof: string;
    publicInputs: string[];
    verificationKey: string;
  } | null;
  error?: string;
}

export interface DeploymentResult {
  deploymentId: string;
  dockerDigest: string;
  status: 'deployed' | 'pending' | 'failed';
  endpoint: string;
  teeCapabilities: {
    sgx: boolean;
    tdx: boolean;
    sev: boolean;
  };
}

interface EigenComputeEvents {
  'execution:started': (executionId: string) => void;
  'execution:completed': (result: ExecutionResult) => void;
  'execution:failed': (executionId: string, error: string) => void;
  'deployment:completed': (result: DeploymentResult) => void;
}

/**
 * EigenCompute Client
 *
 * Provides verifiable computation in Trusted Execution Environments (TEE).
 * Each execution produces:
 * - Result data
 * - TEE attestation proving code ran in secure enclave
 * - ZK proof of correct execution (optional)
 *
 * @see https://docs.eigencloud.xyz/products/eigencompute
 */
export class EigenComputeClient extends EventEmitter<EigenComputeEvents> {
  private config: EigenComputeConfig;
  private executions: Map<string, ExecutionResult> = new Map();
  private deployments: Map<string, DeploymentResult> = new Map();

  constructor(config: EigenComputeConfig) {
    super();
    // Default to production mode when API key is present
    this.config = {
      defaultTimeout: 30000,
      demoMode: config.demoMode ?? !config.apiKey,  // Real mode if API key provided
      ...config
    };

    if (this.config.demoMode) {
      console.log('[EigenCompute] Demo mode enabled - using mock TEE attestations');
    } else {
      console.log('[EigenCompute] Production mode - using real EigenCloud API');
    }
  }

  /**
   * Deploy a Docker image to EigenCompute
   * Returns a deployment ID and docker digest for verification
   */
  async deploy(dockerImage: string, options?: {
    tag?: string;
    env?: Record<string, string>;
    teeType?: 'sgx' | 'tdx' | 'sev';
  }): Promise<DeploymentResult> {
    if (this.config.demoMode) {
      return this.mockDeploy(dockerImage, options);
    }

    const response = await fetch(`${this.config.apiEndpoint}/v1/compute/deploy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.config.projectId && { 'X-Project-Id': this.config.projectId })
      },
      body: JSON.stringify({
        image: dockerImage,
        tag: options?.tag || 'latest',
        env: options?.env,
        teeType: options?.teeType || 'tdx'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`EigenCompute deployment failed: ${error}`);
    }

    const result: DeploymentResult = await response.json();
    this.deployments.set(result.deploymentId, result);
    this.emit('deployment:completed', result);
    return result;
  }

  /**
   * Execute code in TEE environment
   * Returns result with attestation and optional ZK proof
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (this.config.demoMode) {
      return this.mockExecute(request);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.emit('execution:started', executionId);

    try {
      const response = await fetch(`${this.config.apiEndpoint}/v1/compute/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...(this.config.projectId && { 'X-Project-Id': this.config.projectId })
        },
        body: JSON.stringify({
          ...request,
          timeout: request.timeout || this.config.defaultTimeout
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`EigenCompute execution failed: ${error}`);
      }

      const result: ExecutionResult = await response.json();
      this.executions.set(result.executionId, result);
      this.emit('execution:completed', result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('execution:failed', executionId, errorMessage);
      throw error;
    }
  }

  /**
   * Get execution status and result
   */
  async getExecution(executionId: string): Promise<ExecutionResult | null> {
    if (this.config.demoMode) {
      return this.executions.get(executionId) || null;
    }

    const response = await fetch(`${this.config.apiEndpoint}/v1/compute/executions/${executionId}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...(this.config.projectId && { 'X-Project-Id': this.config.projectId })
      }
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  /**
   * Verify TEE attestation for an execution
   */
  async verifyAttestation(executionId: string): Promise<{
    valid: boolean;
    enclaveId: string;
    measurementHash: string;
    timestamp: number;
  }> {
    const execution = await this.getExecution(executionId);
    if (!execution) {
      return { valid: false, enclaveId: '', measurementHash: '', timestamp: 0 };
    }

    if (this.config.demoMode) {
      return {
        valid: true,
        enclaveId: execution.tee.enclaveId,
        measurementHash: execution.tee.measurementHash,
        timestamp: execution.tee.timestamp
      };
    }

    const response = await fetch(`${this.config.apiEndpoint}/v1/verify/attestation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        attestation: execution.tee.attestation,
        executionId
      })
    });

    return response.json();
  }

  /**
   * Verify ZK proof for an execution
   */
  async verifyProof(executionId: string): Promise<{
    valid: boolean;
    publicInputs: string[];
    verifiedAt: number;
  }> {
    const execution = await this.getExecution(executionId);
    if (!execution || !execution.proof) {
      return { valid: false, publicInputs: [], verifiedAt: 0 };
    }

    if (this.config.demoMode) {
      return {
        valid: true,
        publicInputs: execution.proof.publicInputs,
        verifiedAt: Date.now()
      };
    }

    const response = await fetch(`${this.config.apiEndpoint}/v1/verify/proof`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        proof: execution.proof.zkProof,
        publicInputs: execution.proof.publicInputs,
        verificationKey: execution.proof.verificationKey
      })
    });

    return response.json();
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): DeploymentResult | undefined {
    return this.deployments.get(deploymentId);
  }

  // ============================================================
  // MOCK IMPLEMENTATIONS (for demo mode)
  // ============================================================

  private async mockDeploy(dockerImage: string, options?: {
    tag?: string;
    env?: Record<string, string>;
    teeType?: 'sgx' | 'tdx' | 'sev';
  }): Promise<DeploymentResult> {
    // Simulate deployment delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const imageHash = this.generateMockHash(dockerImage);

    const result: DeploymentResult = {
      deploymentId,
      dockerDigest: `sha256:${imageHash}`,
      status: 'deployed',
      endpoint: `https://compute.eigencloud.xyz/${deploymentId}`,
      teeCapabilities: {
        sgx: options?.teeType === 'sgx' || !options?.teeType,
        tdx: options?.teeType === 'tdx' || !options?.teeType,
        sev: options?.teeType === 'sev'
      }
    };

    this.deployments.set(deploymentId, result);
    this.emit('deployment:completed', result);
    return result;
  }

  private async mockExecute(request: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const startTime = Date.now();

    this.emit('execution:started', executionId);

    // Simulate execution delay (50-200ms)
    const executionTime = 50 + Math.random() * 150;
    await new Promise(resolve => setTimeout(resolve, executionTime));

    const endTime = Date.now();

    // Generate mock output based on input
    const output = this.generateMockOutput(request.input);

    // Generate mock attestation
    const attestation = this.generateMockAttestation(executionId, request.dockerDigest || request.dockerImage);

    // Generate mock ZK proof
    const proof = this.generateMockProof(request.input, output);

    const result: ExecutionResult = {
      executionId,
      status: 'completed',
      output,
      logs: `[EigenCompute] Executed ${request.dockerImage} in TEE\n[EigenCompute] Input processed successfully\n`,
      metrics: {
        startTime,
        endTime,
        executionTimeMs: endTime - startTime,
        memoryUsedMb: 64 + Math.random() * 128,
        cpuTimeMs: executionTime * 0.8
      },
      tee: {
        attestation,
        enclaveId: `enclave_${Math.random().toString(36).slice(2, 10)}`,
        measurementHash: this.generateMockHash(`${request.dockerImage}:${request.dockerDigest}`),
        timestamp: endTime
      },
      proof: {
        zkProof: proof,
        publicInputs: [
          this.generateMockHash(JSON.stringify(request.input)),
          this.generateMockHash(JSON.stringify(output))
        ],
        verificationKey: `vk_${Math.random().toString(36).slice(2, 20)}`
      }
    };

    this.executions.set(executionId, result);
    this.emit('execution:completed', result);
    return result;
  }

  private generateMockOutput(input: Record<string, unknown>): unknown {
    // Return structure based on common intent types
    if ('city' in input || 'location' in input) {
      return {
        temperature: 15 + Math.random() * 25,
        humidity: 30 + Math.random() * 50,
        conditions: ['Sunny', 'Cloudy', 'Partly Cloudy', 'Clear'][Math.floor(Math.random() * 4)],
        timestamp: Date.now()
      };
    }
    if ('symbol' in input || 'token' in input) {
      return {
        price: 1000 + Math.random() * 50000,
        change24h: -10 + Math.random() * 20,
        volume: 1000000 + Math.random() * 10000000,
        timestamp: Date.now()
      };
    }
    if ('query' in input || 'topic' in input) {
      return {
        results: [
          { title: 'News Article 1', source: 'Reuters', timestamp: Date.now() },
          { title: 'News Article 2', source: 'AP', timestamp: Date.now() - 3600000 }
        ],
        count: 2
      };
    }
    return { processed: true, input, timestamp: Date.now() };
  }

  private generateMockHash(data: string): string {
    // Simple mock hash generation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0').slice(0, 64);
  }

  private generateMockAttestation(executionId: string, dockerRef: string): string {
    // Mock Intel TDX/SGX attestation format
    const attestationData = {
      type: 'intel_tdx',
      version: '1.0',
      executionId,
      dockerRef,
      timestamp: Date.now(),
      measurements: {
        mrEnclave: this.generateMockHash(dockerRef),
        mrSigner: this.generateMockHash('eigencloud_signer'),
        isvProdId: 1,
        isvSvn: 1
      },
      quote: `tee_quote_${Math.random().toString(36).slice(2, 30)}`
    };
    return Buffer.from(JSON.stringify(attestationData)).toString('base64');
  }

  private generateMockProof(input: unknown, output: unknown): string {
    // Mock ZK-SNARK proof
    const proofData = {
      protocol: 'groth16',
      curve: 'bn128',
      pi_a: [this.generateMockHash('pi_a_1'), this.generateMockHash('pi_a_2')],
      pi_b: [[this.generateMockHash('pi_b_1'), this.generateMockHash('pi_b_2')]],
      pi_c: [this.generateMockHash('pi_c_1'), this.generateMockHash('pi_c_2')],
      inputHash: this.generateMockHash(JSON.stringify(input)),
      outputHash: this.generateMockHash(JSON.stringify(output))
    };
    return Buffer.from(JSON.stringify(proofData)).toString('base64');
  }
}

// Singleton instance
let computeClientInstance: EigenComputeClient | null = null;

export function getEigenComputeClient(config?: EigenComputeConfig): EigenComputeClient {
  if (!computeClientInstance) {
    if (!config) {
      const apiKey = process.env.EIGENCLOUD_API_KEY || '';
      // Default to production mode if API key is present
      config = {
        apiEndpoint: process.env.EIGENCOMPUTE_API_URL || 'https://api.eigencloud.xyz',
        apiKey,
        projectId: process.env.EIGENCLOUD_PROJECT_ID,
        // Demo mode only if explicitly enabled OR no API key provided
        demoMode: process.env.EIGENCLOUD_DEMO_MODE === 'true' || !apiKey
      };
    }
    computeClientInstance = new EigenComputeClient(config);
  }
  return computeClientInstance;
}

export function resetEigenComputeClient(): void {
  computeClientInstance = null;
}
