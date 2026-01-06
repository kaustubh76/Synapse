'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  TrendingUp,
  Shield,
  Zap,
  PiggyBank,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  CreditCard,
  Lock,
  Activity,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Header } from '../../components/Header';
import { PageHeader } from '../../components/PageHeader';
import { fadeIn, fadeInUp, scaleIn } from '../../lib/animations';
import { useSocket } from '../../hooks/useSocket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DeFiStats {
  totalValueLocked: number;
  liquidityPoolTVL: number;
  stakingTVL: number;
  insuranceTVL: number;
  strategyTVL: number;
  averageAPY: number;
  totalYieldDistributed: number;
  totalOutstandingLoans: number;
  totalFlashLoans: number;
  flashLoanVolume: number;
  totalCoverage: number;
  uniqueDepositors: number;
  uniqueBorrowers: number;
  uniqueStakers: number;
}

interface Pool {
  id: string;
  name: string;
  totalLiquidity: number;
  apy: number;
  utilizationRate: number;
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  currentAPY: number;
  riskLevel: number;
  currentCapacity: number;
}

interface CreditTier {
  minScore: number;
  maxScore: number;
  creditLimit: number;
  interestRate: number;
  collateralRequired: number;
}

interface StakingTier {
  minStake: number;
  baseAPY: number;
}

interface YieldStrategy {
  expectedAPY: number;
}

interface InsuranceConfig {
  basePremiumRate: number;
}

interface DeFiConfig {
  creditTiers: Record<string, CreditTier>;
  stakingTiers: Record<string, StakingTier>;
  yieldStrategies: Record<string, YieldStrategy>;
  insurance: Record<string, InsuranceConfig>;
}

interface FlashAvailability {
  feeRate: number;
}

export default function DeFiDashboard() {
  const { isConnected } = useSocket();
  const [stats, setStats] = useState<DeFiStats | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [config, setConfig] = useState<DeFiConfig | null>(null);
  const [flashFeeRate, setFlashFeeRate] = useState<number>(0.0005);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, poolsRes, strategiesRes, configRes, flashRes] = await Promise.all([
        fetch(`${API_URL}/api/defi/stats`),
        fetch(`${API_URL}/api/defi/pools`),
        fetch(`${API_URL}/api/defi/strategies`),
        fetch(`${API_URL}/api/defi/config`),
        fetch(`${API_URL}/api/defi/flash/available`),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      if (poolsRes.ok) {
        const data = await poolsRes.json();
        setPools(data.pools || []);
      }

      if (strategiesRes.ok) {
        const data = await strategiesRes.json();
        setStrategies(data.strategies || []);
      }

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.config);
      }

      if (flashRes.ok) {
        const data = await flashRes.json();
        setFlashFeeRate(data.availability?.feeRate || 0.0005);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to fetch DeFi data');
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '$0.00';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0.0%';
    return `${(value * 100).toFixed(1)}%`;
  };

  // Helper functions to calculate ranges from config
  const getCreditAPRRange = () => {
    if (!config?.creditTiers) return '5-25% APR';
    const rates = Object.values(config.creditTiers).map(t => t.interestRate);
    const minRate = Math.min(...rates) * 100;
    const maxRate = Math.max(...rates) * 100;
    return `${minRate.toFixed(0)}-${maxRate.toFixed(0)}% APR`;
  };

  const getStakingAPYRange = () => {
    if (!config?.stakingTiers) return '5-20% APY';
    const rates = Object.values(config.stakingTiers).map(t => t.baseAPY);
    const minRate = Math.min(...rates) * 100;
    const maxRate = Math.max(...rates) * 100;
    return `${minRate.toFixed(0)}-${maxRate.toFixed(0)}% APY`;
  };

  const getYieldAPYRange = () => {
    if (!config?.yieldStrategies) return '5-25% APY';
    const rates = Object.values(config.yieldStrategies).map(t => t.expectedAPY);
    const minRate = Math.min(...rates) * 100;
    const maxRate = Math.max(...rates) * 100;
    return `${minRate.toFixed(0)}-${maxRate.toFixed(0)}% APY`;
  };

  const getInsurancePremiumRange = () => {
    if (!config?.insurance) return '2-5% premium';
    const rates = Object.values(config.insurance).map(t => t.basePremiumRate);
    const minRate = Math.min(...rates) * 100;
    const maxRate = Math.max(...rates) * 100;
    return `${minRate.toFixed(0)}-${maxRate.toFixed(0)}% premium`;
  };

  const getFlashLoanFee = () => {
    return `${(flashFeeRate * 100).toFixed(2)}% fee`;
  };

  const protocolCards = [
    {
      title: 'Liquidity Pools',
      description: 'Earn yield by providing liquidity to the agent economy',
      icon: <PiggyBank className="w-6 h-6" />,
      value: stats ? formatCurrency(stats.liquidityPoolTVL) : '$0',
      apy: stats ? formatPercent(stats.averageAPY) : '0%',
      gradient: 'from-blue-500 to-cyan-500',
      href: '/defi/pools',
    },
    {
      title: 'Credit Lending',
      description: 'Under-collateralized loans based on reputation',
      icon: <CreditCard className="w-6 h-6" />,
      value: stats ? formatCurrency(stats.totalOutstandingLoans) : '$0',
      apy: getCreditAPRRange(),
      gradient: 'from-purple-500 to-pink-500',
      href: '/defi/lending',
    },
    {
      title: 'Flash Loans',
      description: 'Instant uncollateralized loans for arbitrage',
      icon: <Zap className="w-6 h-6" />,
      value: stats ? stats.totalFlashLoans.toString() : '0',
      apy: getFlashLoanFee(),
      gradient: 'from-yellow-500 to-orange-500',
      href: '/defi/flash-loans',
    },
    {
      title: 'Insurance',
      description: 'Protect against protocol and provider risks',
      icon: <Shield className="w-6 h-6" />,
      value: stats ? formatCurrency(stats.totalCoverage) : '$0',
      apy: getInsurancePremiumRange(),
      gradient: 'from-green-500 to-emerald-500',
      href: '/defi/insurance',
    },
    {
      title: 'Provider Staking',
      description: 'Stake for priority bidding and rewards',
      icon: <Lock className="w-6 h-6" />,
      value: stats ? formatCurrency(stats.stakingTVL) : '$0',
      apy: getStakingAPYRange(),
      gradient: 'from-red-500 to-rose-500',
      href: '/defi/staking',
    },
    {
      title: 'Yield Strategies',
      description: 'Automated yield optimization',
      icon: <BarChart3 className="w-6 h-6" />,
      value: stats ? formatCurrency(stats.strategyTVL) : '$0',
      apy: getYieldAPYRange(),
      gradient: 'from-indigo-500 to-violet-500',
      href: '/defi/strategies',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header isConnected={isConnected} />

      <PageHeader
        title="DeFi Hub"
        subtitle="Financial infrastructure for the autonomous agent economy"
        icon={<Coins className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Stats */}
        <motion.div
          variants={fadeIn}
          initial="initial"
          animate="animate"
          className="relative overflow-hidden rounded-2xl mb-8"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 50%, rgba(59, 130, 246, 0.1) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-blue-500/5" />
          <div className="relative p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">
                  Total Value Locked
                </h2>
                <p className="text-gray-400">
                  Across all DeFi protocols in the Synapse ecosystem
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchData}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
              </motion.button>
            </div>

            <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-8">
              {stats ? formatCurrency(stats.totalValueLocked) : '$0'}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-gray-400 text-sm mb-1">Avg APY</p>
                <p className="text-2xl font-semibold text-emerald-400">
                  {stats ? formatPercent(stats.averageAPY) : '0%'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Yield Distributed</p>
                <p className="text-2xl font-semibold text-cyan-400">
                  {stats ? formatCurrency(stats.totalYieldDistributed) : '$0'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Active Depositors</p>
                <p className="text-2xl font-semibold text-blue-400">
                  {stats?.uniqueDepositors || 0}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm mb-1">Active Borrowers</p>
                <p className="text-2xl font-semibold text-purple-400">
                  {stats?.uniqueBorrowers || 0}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Protocol Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {protocolCards.map((protocol, index) => (
            <motion.a
              key={protocol.title}
              href={protocol.href}
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="group relative overflow-hidden rounded-xl p-6 cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${protocol.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${protocol.gradient}`}>
                    {protocol.icon}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-xl font-semibold text-white mb-2">
                  {protocol.title}
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  {protocol.description}
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs">TVL / Volume</p>
                    <p className="text-lg font-semibold text-white">{protocol.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-xs">APY / Rate</p>
                    <p className="text-lg font-semibold text-emerald-400">{protocol.apy}</p>
                  </div>
                </div>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Liquidity Pools */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="rounded-xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-blue-400" />
                Active Pools
              </h3>
              <a href="/defi/pools" className="text-blue-400 text-sm hover:underline">
                View All →
              </a>
            </div>

            <div className="space-y-4">
              {pools.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No active pools</p>
              ) : (
                pools.slice(0, 3).map((pool) => (
                  <div
                    key={pool.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-white">{pool.name}</p>
                      <p className="text-sm text-gray-400">
                        {formatPercent(pool.utilizationRate)} utilized
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">
                        {formatCurrency(pool.totalLiquidity)}
                      </p>
                      <p className="text-sm text-emerald-400">
                        {formatPercent(pool.apy)} APY
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Yield Strategies */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="rounded-xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Yield Strategies
              </h3>
              <a href="/defi/strategies" className="text-indigo-400 text-sm hover:underline">
                View All →
              </a>
            </div>

            <div className="space-y-4">
              {strategies.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No active strategies</p>
              ) : (
                strategies.map((strategy) => (
                  <div
                    key={strategy.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        strategy.type === 'conservative' ? 'bg-green-500' :
                        strategy.type === 'balanced' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <p className="font-medium text-white">{strategy.name}</p>
                        <p className="text-sm text-gray-400 capitalize">
                          Risk Level: {strategy.riskLevel}/10
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">
                        {formatCurrency(strategy.currentCapacity)}
                      </p>
                      <p className="text-sm text-emerald-400">
                        {formatPercent(strategy.currentAPY)} APY
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        {/* Innovation Banner */}
        <motion.div
          variants={scaleIn}
          initial="initial"
          animate="animate"
          className="mt-8 relative overflow-hidden rounded-2xl p-8"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
          }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500">
                <Coins className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm font-medium text-purple-400">THE INNOVATION</span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              Reputation-Backed Lending
            </h3>
            <p className="text-gray-300 max-w-2xl mb-6">
              The first DeFi protocol where your on-chain reputation <strong>IS</strong> your collateral.
              High-reputation AI agents can borrow with 0% collateral requirements.
            </p>

            <div className="flex flex-wrap gap-4">
              <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                <span className="text-gray-400 text-sm">Exceptional Tier</span>
                <p className="text-white font-semibold">
                  {config?.creditTiers?.exceptional
                    ? `${(config.creditTiers.exceptional.collateralRequired * 100).toFixed(0)}% Collateral`
                    : '0% Collateral'}
                </p>
              </div>
              <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                <span className="text-gray-400 text-sm">Credit Limit</span>
                <p className="text-white font-semibold">
                  {config?.creditTiers?.exceptional
                    ? `Up to ${formatCurrency(config.creditTiers.exceptional.creditLimit)}`
                    : 'Up to $10,000'}
                </p>
              </div>
              <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                <span className="text-gray-400 text-sm">Interest Rate</span>
                <p className="text-white font-semibold">
                  {config?.creditTiers?.exceptional
                    ? `${(config.creditTiers.exceptional.interestRate * 100).toFixed(0)}% APR`
                    : '5% APR'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
