/**
 * DeFi API Routes
 *
 * Comprehensive API for all DeFi operations:
 * - Liquidity Pools
 * - Credit Lending
 * - Flash Loans
 * - Insurance
 * - Provider Staking
 * - Yield Strategies
 */

import { Router, Request, Response } from 'express';
import { DeFiRouter } from '@synapse/core';

const router = Router();

// Initialize DeFi Router (singleton)
let defiRouter: DeFiRouter | null = null;

function getDefiRouter(): DeFiRouter {
  if (!defiRouter) {
    const enableRealTransfers = process.env.ENABLE_REAL_DEFI === 'true';

    if (enableRealTransfers) {
      console.log('[DeFi API] Real USDC transfers ENABLED');
      console.log('[DeFi API] Platform wallet:', process.env.EIGENCLOUD_WALLET_ADDRESS || process.env.PLATFORM_WALLET_ADDRESS);
    }

    defiRouter = new DeFiRouter({
      enableRealTransfers,
      platformWalletAddress: process.env.EIGENCLOUD_WALLET_ADDRESS || process.env.PLATFORM_WALLET_ADDRESS,
      platformPrivateKey: process.env.EIGENCLOUD_PRIVATE_KEY,
      rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    });
  }
  return defiRouter;
}

// =============================================================================
// SYSTEM
// =============================================================================

/**
 * GET /api/defi/stats
 * Get system-wide DeFi statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const stats = router.getSystemStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/portfolio/:agentId
 * Get full DeFi portfolio for an agent
 */
router.get('/portfolio/:agentId', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { address } = req.query;
    const router = getDefiRouter();
    const portfolio = router.getPortfolio(agentId, address as string || '0x0');
    res.json({ success: true, portfolio });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/config
 * Get all DeFi configuration (tiers, rates, etc.)
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    res.json({
      success: true,
      config: {
        creditTiers: router.getCreditTierConfig(),
        stakingTiers: router.getStakingTierConfig(),
        yieldStrategies: router.getYieldStrategyPresets(),
        insurance: router.getInsuranceConfig(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// LIQUIDITY POOLS
// =============================================================================

/**
 * GET /api/defi/pools
 * List all liquidity pools
 */
router.get('/pools', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const pools = router.liquidityPool.getAllPools();
    res.json({ success: true, pools });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/pools/:poolId
 * Get pool details
 */
router.get('/pools/:poolId', (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;
    const router = getDefiRouter();
    const pool = router.liquidityPool.getPool(poolId);
    const stats = router.liquidityPool.getPoolStats(poolId);

    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    res.json({ success: true, pool, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/pools/:poolId/deposit
 * Deposit to a liquidity pool
 */
router.post('/pools/:poolId/deposit', async (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;
    const { agentId, agentAddress, amount, lockDays } = req.body;

    if (!agentId || !agentAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.liquidityPool.deposit(
      poolId,
      agentId,
      agentAddress,
      parseFloat(amount),
      lockDays ? parseInt(lockDays) : 0
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/pools/:poolId/withdraw
 * Withdraw from a liquidity pool
 */
router.post('/pools/:poolId/withdraw', async (req: Request, res: Response) => {
  try {
    const { positionId, shares } = req.body;

    if (!positionId || !shares) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.liquidityPool.withdraw(positionId, parseFloat(shares));

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/pools/:poolId/positions/:agentId
 * Get agent's position in a pool
 */
router.get('/pools/:poolId/positions/:agentId', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const router = getDefiRouter();
    const positions = router.liquidityPool.getPositionsByAgent(agentId);
    res.json({ success: true, positions });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// CREDIT LENDING
// =============================================================================

/**
 * GET /api/defi/credit/rates
 * Get current interest rates by tier
 */
router.get('/credit/rates', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const rates = router.creditLending.getInterestRates();
    const tiers = router.getCreditTierConfig();
    res.json({ success: true, rates, tiers });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/credit/lines/:agentId
 * Get agent's credit line
 */
router.get('/credit/lines/:agentId', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const router = getDefiRouter();
    const creditLine = router.creditLending.getCreditLineByAgent(agentId);

    if (!creditLine) {
      return res.json({ success: true, creditLine: null, message: 'No credit line found' });
    }

    const loans = router.creditLending.getLoansByCreditLine(creditLine.id);
    const liquidationStatus = router.creditLending.checkLiquidation(creditLine.id);

    res.json({ success: true, creditLine, loans, liquidationStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/credit/lines/:agentId/open
 * Open a credit line for an agent
 */
router.post('/credit/lines/:agentId/open', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { agentAddress, creditScore, collateral } = req.body;

    if (!agentAddress || creditScore === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const creditLine = await router.creditLending.openCreditLine(
      agentId,
      agentAddress,
      parseFloat(creditScore),
      collateral ? parseFloat(collateral) : 0
    );

    res.json({ success: true, creditLine });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/credit/borrow
 * Borrow against a credit line
 */
router.post('/credit/borrow', async (req: Request, res: Response) => {
  try {
    const { creditLineId, amount, purpose, intentId } = req.body;

    if (!creditLineId || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const defiRouter = getDefiRouter();
    const result = await defiRouter.creditLending.borrow(
      creditLineId,
      parseFloat(amount),
      purpose || 'general',
      intentId
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/credit/repay
 * Repay a credit line
 */
router.post('/credit/repay', async (req: Request, res: Response) => {
  try {
    const { creditLineId, amount } = req.body;

    if (!creditLineId || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.creditLending.repay(creditLineId, parseFloat(amount));

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/credit/collateral/add
 * Add collateral to a credit line
 */
router.post('/credit/collateral/add', async (req: Request, res: Response) => {
  try {
    const { creditLineId, amount } = req.body;

    if (!creditLineId || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const success = await router.creditLending.addCollateral(creditLineId, parseFloat(amount));

    res.json({ success });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// FLASH LOANS
// =============================================================================

/**
 * GET /api/defi/flash/available
 * Check flash loan availability
 */
router.get('/flash/available', (req: Request, res: Response) => {
  try {
    const { amount } = req.query;
    const router = getDefiRouter();
    const availability = router.flashLoans.checkAvailability(
      amount ? parseFloat(amount as string) : undefined
    );
    res.json({ success: true, availability });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/flash/execute
 * Execute a flash loan (demo mode - auto-repays)
 */
router.post('/flash/execute', async (req: Request, res: Response) => {
  try {
    const { borrower, borrowerAddress, amount, purpose } = req.body;

    if (!borrower || !borrowerAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.flashLoans.flashSimple(
      borrower,
      borrowerAddress,
      parseFloat(amount),
      purpose || 'demo'
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/flash/history
 * Get recent flash loans
 */
router.get('/flash/history', (req: Request, res: Response) => {
  try {
    const { limit, borrower } = req.query;
    const router = getDefiRouter();

    let loans;
    if (borrower) {
      loans = router.flashLoans.getLoansByBorrower(borrower as string);
    } else {
      loans = router.flashLoans.getRecentLoans(limit ? parseInt(limit as string) : 10);
    }

    const stats = router.flashLoans.getStats();
    res.json({ success: true, loans, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// INSURANCE
// =============================================================================

/**
 * GET /api/defi/insurance/pools
 * List all insurance pools
 */
router.get('/insurance/pools', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const pools = router.insurance.getAllPools();
    res.json({ success: true, pools });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/insurance/pools/:poolId
 * Get insurance pool details
 */
router.get('/insurance/pools/:poolId', (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;
    const router = getDefiRouter();
    const pool = router.insurance.getPool(poolId);

    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const stakers = router.insurance.getStakersByPool(poolId);
    res.json({ success: true, pool, stakers });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/insurance/policies
 * Purchase an insurance policy
 */
router.post('/insurance/policies', async (req: Request, res: Response) => {
  try {
    const { poolId, holderId, holderAddress, coverageAmount, durationDays } = req.body;

    if (!poolId || !holderId || !holderAddress || !coverageAmount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();

    // Calculate premium first
    const quote = router.insurance.calculatePremium(
      poolId,
      parseFloat(coverageAmount),
      durationDays || 30
    );

    const result = await router.insurance.purchasePolicy({
      poolId,
      holderId,
      holderAddress,
      coverageAmount: parseFloat(coverageAmount),
      durationDays: durationDays || 30,
    });

    res.json({ ...result, quote });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/insurance/policies/:holderId
 * Get holder's insurance policies
 */
router.get('/insurance/policies/:holderId', (req: Request, res: Response) => {
  try {
    const { holderId } = req.params;
    const router = getDefiRouter();
    const policies = router.insurance.getPoliciesByHolder(holderId);
    res.json({ success: true, policies });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/insurance/claims
 * File an insurance claim
 */
router.post('/insurance/claims', async (req: Request, res: Response) => {
  try {
    const { policyId, amount, reason, evidence, intentId, disputeId } = req.body;

    if (!policyId || !amount || !reason) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const claim = await router.insurance.fileClaim({
      policyId,
      amount: parseFloat(amount),
      reason,
      evidence: evidence || [],
      intentId,
      disputeId,
    });

    res.json({ success: true, claim });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/insurance/stake
 * Stake in an insurance pool
 */
router.post('/insurance/stake', async (req: Request, res: Response) => {
  try {
    const { poolId, stakerAddress, amount } = req.body;

    if (!poolId || !stakerAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.insurance.stake(poolId, stakerAddress, parseFloat(amount));

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// PROVIDER STAKING
// =============================================================================

/**
 * GET /api/defi/staking/tiers
 * Get staking tier configuration
 */
router.get('/staking/tiers', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const tiers = router.providerStaking.getTierConfig();
    const stats = router.providerStaking.getStats();
    res.json({ success: true, tiers, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/staking/stake
 * Stake as a provider
 */
router.post('/staking/stake', async (req: Request, res: Response) => {
  try {
    const { providerId, providerAddress, amount, lockDays } = req.body;

    if (!providerId || !providerAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.providerStaking.stake(
      providerId,
      providerAddress,
      parseFloat(amount),
      lockDays ? parseInt(lockDays) : 0
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/staking/unstake
 * Unstake from provider staking
 */
router.post('/staking/unstake', async (req: Request, res: Response) => {
  try {
    const { stakeId, amount } = req.body;

    if (!stakeId || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.providerStaking.unstake(stakeId, parseFloat(amount));

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/staking/:providerId
 * Get provider's stake
 */
router.get('/staking/:providerId', (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    const router = getDefiRouter();
    const stake = router.providerStaking.getStakeByProvider(providerId);
    const benefits = stake ? router.providerStaking.getStakingBenefits(stake.id) : null;

    res.json({ success: true, stake, benefits });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/staking/:stakeId/claim
 * Claim staking yield
 */
router.post('/staking/:stakeId/claim', async (req: Request, res: Response) => {
  try {
    const { stakeId } = req.params;
    const router = getDefiRouter();
    const result = await router.providerStaking.claimYield(stakeId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================================================
// YIELD STRATEGIES
// =============================================================================

/**
 * GET /api/defi/strategies
 * List all yield strategies
 */
router.get('/strategies', (req: Request, res: Response) => {
  try {
    const router = getDefiRouter();
    const strategies = router.yieldStrategies.getAllStrategies();
    const stats = router.yieldStrategies.getStats();
    res.json({ success: true, strategies, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/strategies/:strategyId
 * Get strategy details
 */
router.get('/strategies/:strategyId', (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    const router = getDefiRouter();
    const strategy = router.yieldStrategies.getStrategy(strategyId);

    if (!strategy) {
      return res.status(404).json({ success: false, error: 'Strategy not found' });
    }

    const positions = router.yieldStrategies.getPositionsByStrategy(strategyId);
    res.json({ success: true, strategy, positions });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/strategies/:strategyId/deposit
 * Deposit to a yield strategy
 */
router.post('/strategies/:strategyId/deposit', async (req: Request, res: Response) => {
  try {
    const { strategyId } = req.params;
    const { agentId, agentAddress, amount } = req.body;

    if (!agentId || !agentAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.yieldStrategies.deposit(
      strategyId,
      agentId,
      agentAddress,
      parseFloat(amount)
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/strategies/:strategyId/withdraw
 * Withdraw from a yield strategy
 */
router.post('/strategies/:strategyId/withdraw', async (req: Request, res: Response) => {
  try {
    const { positionId, shares } = req.body;

    if (!positionId || !shares) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const router = getDefiRouter();
    const result = await router.yieldStrategies.withdraw(positionId, parseFloat(shares));

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/defi/strategies/:strategyId/harvest
 * Harvest yield from a position
 */
router.post('/strategies/:strategyId/harvest', async (req: Request, res: Response) => {
  try {
    const { positionId } = req.body;

    if (!positionId) {
      return res.status(400).json({ success: false, error: 'Missing positionId' });
    }

    const router = getDefiRouter();
    const result = await router.yieldStrategies.harvest(positionId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/defi/strategies/positions/:agentId
 * Get agent's strategy positions
 */
router.get('/strategies/positions/:agentId', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const router = getDefiRouter();
    const positions = router.yieldStrategies.getPositionsByAgent(agentId);
    res.json({ success: true, positions });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
