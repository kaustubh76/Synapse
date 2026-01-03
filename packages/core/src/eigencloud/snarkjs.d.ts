// Type declarations for snarkjs module
declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, string | bigint | number>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve: string;
      };
      publicSignals: string[];
    }>;

    function verify(
      verificationKey: object,
      publicSignals: string[],
      proof: object
    ): Promise<boolean>;

    function exportSolidityCallData(
      publicSignals: string[],
      proof: object
    ): Promise<string>;
  }

  export namespace plonk {
    function fullProve(
      input: Record<string, string | bigint | number>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: object;
      publicSignals: string[];
    }>;

    function verify(
      verificationKey: object,
      publicSignals: string[],
      proof: object
    ): Promise<boolean>;
  }

  export namespace zKey {
    function newZKey(
      r1csPath: string,
      ptauPath: string,
      zkeyPath: string
    ): Promise<void>;

    function contribute(
      zkeyInputPath: string,
      zkeyOutputPath: string,
      name: string,
      entropy: string
    ): Promise<string>;

    function beacon(
      zkeyInputPath: string,
      zkeyOutputPath: string,
      name: string,
      beaconHash: string,
      numIterations: number
    ): Promise<string>;

    function exportVerificationKey(
      zkeyPath: string
    ): Promise<object>;

    function exportSolidityVerifier(
      zkeyPath: string
    ): Promise<string>;
  }

  export namespace r1cs {
    function info(r1csPath: string): Promise<{
      n8: number;
      prime: bigint;
      nVars: number;
      nOutputs: number;
      nPubInputs: number;
      nPrvInputs: number;
      nLabels: number;
      nConstraints: number;
    }>;
  }

  export namespace wtns {
    function calculate(
      input: Record<string, string | bigint | number>,
      wasmPath: string,
      wtnsPath: string
    ): Promise<void>;
  }
}
