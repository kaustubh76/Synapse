// ============================================================
// SYNAPSE API - Agent Identity Routes
// ============================================================

import { Router, Express, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  getAgentIdentityRegistry,
  VerificationLevel,
  ApiResponse,
  AgentProfile
} from '@synapse/core';

const RegisterAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  walletAddress: z.string().min(1),
  ownerAddress: z.string().optional(),
  mcpEndpoint: z.string().url().optional(),
  apiEndpoint: z.string().url().optional(),
  teeAttestation: z.boolean().optional(),
  dockerDigest: z.string().optional(),
  initialStake: z.number().positive().optional()
});

const FeedbackSchema = z.object({
  agentId: z.string().min(1),
  intentId: z.string().min(1),
  rating: z.number().min(1).max(5),
  success: z.boolean(),
  responseTime: z.number().positive(),
  comment: z.string().max(500).optional()
});

const StakeSchema = z.object({
  amount: z.number().positive()
});

export function setupAgentRoutes(
  app: Express,
  io: SocketIOServer
): void {
  const router = Router();
  const registry = getAgentIdentityRegistry();

  // -------------------- REGISTER AGENT --------------------
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const validation = RegisterAgentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const profile = registry.registerAgent(validation.data);

      // Broadcast new agent registration
      io.emit('agent:registered', {
        profile,
        timestamp: Date.now()
      });

      res.status(201).json({
        success: true,
        data: profile,
        timestamp: Date.now()
      } as ApiResponse<AgentProfile>);
    } catch (error) {
      console.error('Error registering agent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REGISTER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to register agent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET AGENT --------------------
  router.get('/:agentId', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const profile = registry.getAgent(agentId);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `Agent ${agentId} not found`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: profile,
        timestamp: Date.now()
      } as ApiResponse<AgentProfile>);
    } catch (error) {
      console.error('Error getting agent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AGENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get agent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET AGENT BY WALLET --------------------
  router.get('/wallet/:walletAddress', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.params;
      const profile = registry.getAgentByWallet(walletAddress);

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: `No agent found for wallet ${walletAddress}`
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      res.json({
        success: true,
        data: profile,
        timestamp: Date.now()
      } as ApiResponse<AgentProfile>);
    } catch (error) {
      console.error('Error getting agent by wallet:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AGENT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get agent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- LIST ACTIVE AGENTS --------------------
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { verified, minReputation, sortBy, capability } = req.query;
      let agents = registry.getActiveAgents();

      // Filter by verification status
      if (verified === 'true') {
        agents = agents.filter(
          (a: AgentProfile) => a.verificationLevel !== VerificationLevel.UNVERIFIED
        );
      }

      // Filter by capability
      if (capability && typeof capability === 'string') {
        agents = registry.findAgentsByCapability(capability);
      }

      // Filter by minimum reputation
      if (minReputation) {
        const minRep = parseFloat(minReputation as string);
        if (!isNaN(minRep)) {
          agents = agents.filter((a: AgentProfile) => a.reputationScore >= minRep);
        }
      }

      // Sort
      if (sortBy === 'reputation') {
        agents.sort((a: AgentProfile, b: AgentProfile) => b.reputationScore - a.reputationScore);
      } else if (sortBy === 'stake') {
        agents.sort((a: AgentProfile, b: AgentProfile) => b.stakedAmount - a.stakedAmount);
      } else if (sortBy === 'jobs') {
        agents.sort((a: AgentProfile, b: AgentProfile) => b.totalJobs - a.totalJobs);
      }

      res.json({
        success: true,
        data: {
          agents,
          total: agents.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ agents: AgentProfile[]; total: number }>);
    } catch (error) {
      console.error('Error listing agents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_AGENTS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list agents'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SUBMIT FEEDBACK --------------------
  router.post('/feedback', async (req: Request, res: Response) => {
    try {
      const validation = FeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      registry.submitFeedback(validation.data);
      const updatedProfile = registry.getAgent(validation.data.agentId);

      // Broadcast feedback
      io.emit('agent:feedback', {
        agentId: validation.data.agentId,
        rating: validation.data.rating,
        newReputation: updatedProfile?.reputationScore,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          message: 'Feedback submitted successfully',
          newReputation: updatedProfile?.reputationScore
        },
        timestamp: Date.now()
      } as ApiResponse<{ message: string; newReputation: number | undefined }>);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FEEDBACK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to submit feedback'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DEPOSIT STAKE --------------------
  router.post('/:agentId/stake', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const validation = StakeSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid stake amount',
            details: validation.error.errors
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      registry.depositStake(agentId, validation.data.amount);
      const updatedProfile = registry.getAgent(agentId);

      // Broadcast stake deposit
      io.emit('agent:staked', {
        agentId,
        amount: validation.data.amount,
        totalStake: updatedProfile?.stakedAmount,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          message: 'Stake deposited successfully',
          totalStake: updatedProfile?.stakedAmount
        },
        timestamp: Date.now()
      } as ApiResponse<{ message: string; totalStake: number | undefined }>);
    } catch (error) {
      console.error('Error depositing stake:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STAKE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to deposit stake'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- VERIFY TEE ATTESTATION --------------------
  router.post('/:agentId/verify-tee', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { attestation } = req.body;

      if (!attestation || typeof attestation !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Attestation string is required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      const attestationResult = await registry.verifyTEEAttestation(agentId, attestation);
      const updatedProfile = registry.getAgent(agentId);

      if (attestationResult.valid) {
        io.emit('agent:verified', {
          agentId,
          verificationLevel: updatedProfile?.verificationLevel,
          attestationType: attestationResult.type,
          timestamp: Date.now()
        });
      }

      res.json({
        success: true,
        data: {
          verified: attestationResult.valid,
          verificationLevel: updatedProfile?.verificationLevel,
          attestation: {
            type: attestationResult.type,
            enclaveId: attestationResult.enclaveId,
            measurements: attestationResult.measurements,
            expiresAt: attestationResult.expiresAt
          }
        },
        timestamp: Date.now()
      } as ApiResponse<{
        verified: boolean;
        verificationLevel: VerificationLevel | undefined;
        attestation: {
          type: string;
          enclaveId: string;
          measurements: Record<string, string | undefined>;
          expiresAt: number;
        };
      }>);
    } catch (error) {
      console.error('Error verifying TEE:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'VERIFY_TEE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to verify TEE attestation'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- RECORD JOB COMPLETION --------------------
  router.post('/:agentId/job-complete', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { success, earnings, responseTime } = req.body;

      if (typeof success !== 'boolean' || typeof earnings !== 'number' || typeof responseTime !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'success (boolean), earnings (number), and responseTime (number) are required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      registry.recordJobCompletion(agentId, success, earnings, responseTime);
      const updatedProfile = registry.getAgent(agentId);

      io.emit('agent:job-completed', {
        agentId,
        success,
        earnings,
        totalJobs: updatedProfile?.totalJobs,
        totalEarnings: updatedProfile?.totalEarnings,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          message: 'Job completion recorded',
          totalJobs: updatedProfile?.totalJobs,
          totalEarnings: updatedProfile?.totalEarnings
        },
        timestamp: Date.now()
      } as ApiResponse<{ message: string; totalJobs?: number; totalEarnings?: number }>);
    } catch (error) {
      console.error('Error recording job completion:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_COMPLETE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record job completion'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET LEADERBOARD --------------------
  router.get('/leaderboard/top', async (req: Request, res: Response) => {
    try {
      const { limit = '10', metric = 'reputation' } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 10, 100);

      let sorted: AgentProfile[];

      switch (metric) {
        case 'earnings':
          sorted = registry.getActiveAgents().sort((a: AgentProfile, b: AgentProfile) =>
            b.totalEarnings - a.totalEarnings
          );
          break;
        case 'jobs':
          sorted = registry.getActiveAgents().sort((a: AgentProfile, b: AgentProfile) =>
            b.totalJobs - a.totalJobs
          );
          break;
        case 'stake':
          sorted = registry.getActiveAgents().sort((a: AgentProfile, b: AgentProfile) =>
            b.stakedAmount - a.stakedAmount
          );
          break;
        case 'reputation':
        default:
          sorted = registry.getTopAgents(limitNum);
      }

      const leaderboard = sorted.slice(0, limitNum).map((agent: AgentProfile, index: number) => ({
        rank: index + 1,
        agentId: agent.agentId,
        name: agent.name,
        score: metric === 'earnings' ? agent.totalEarnings :
               metric === 'jobs' ? agent.totalJobs :
               metric === 'stake' ? agent.stakedAmount :
               agent.reputationScore,
        verificationLevel: agent.verificationLevel
      }));

      res.json({
        success: true,
        data: {
          metric,
          leaderboard
        },
        timestamp: Date.now()
      } as ApiResponse<{ metric: string; leaderboard: any[] }>);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LEADERBOARD_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get leaderboard'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- GET STATS --------------------
  router.get('/stats/summary', async (req: Request, res: Response) => {
    try {
      const stats = registry.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: Date.now()
      } as ApiResponse<typeof stats>);
    } catch (error) {
      console.error('Error getting agent stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get agent stats'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- SLASH STAKE --------------------
  router.post('/:agentId/slash', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const { amount, reason } = req.body;

      if (typeof amount !== 'number' || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'amount (number) and reason are required'
          },
          timestamp: Date.now()
        } as ApiResponse<never>);
      }

      registry.slashStake(agentId, amount, reason);
      const updatedProfile = registry.getAgent(agentId);

      // Broadcast slash
      io.emit('agent:slashed', {
        agentId,
        amount,
        reason,
        remainingStake: updatedProfile?.stakedAmount,
        slashCount: updatedProfile?.slashCount,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          message: 'Stake slashed successfully',
          remainingStake: updatedProfile?.stakedAmount,
          slashCount: updatedProfile?.slashCount
        },
        timestamp: Date.now()
      } as ApiResponse<{ message: string; remainingStake?: number; slashCount?: number }>);
    } catch (error) {
      console.error('Error slashing stake:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SLASH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to slash stake'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- DEACTIVATE AGENT --------------------
  router.post('/:agentId/deactivate', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;

      registry.deactivateAgent(agentId);

      // Broadcast deactivation
      io.emit('agent:deactivated', {
        agentId,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        data: {
          message: 'Agent deactivated successfully'
        },
        timestamp: Date.now()
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      console.error('Error deactivating agent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DEACTIVATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to deactivate agent'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // -------------------- FIND AGENTS FOR INTENT --------------------
  router.get('/find/:intentType', async (req: Request, res: Response) => {
    try {
      const { intentType } = req.params;
      const agents = registry.findAgentsForIntent(intentType);

      res.json({
        success: true,
        data: {
          agents,
          total: agents.length
        },
        timestamp: Date.now()
      } as ApiResponse<{ agents: AgentProfile[]; total: number }>);
    } catch (error) {
      console.error('Error finding agents:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FIND_AGENTS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to find agents'
        },
        timestamp: Date.now()
      } as ApiResponse<never>);
    }
  });

  // Mount router
  app.use('/api/agents', router);
}
