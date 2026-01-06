'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
  Lock,
  Unlock,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Shield,
  Zap,
  Target,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp, staggerContainer, staggerItem } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'conservative' | 'balanced' | 'aggressive';
  expectedAPY: number;
  currentAPY: number;
  riskLevel: number;
  volatility: number;
  maxDrawdown: number;
  minDeposit: number;
  maxCapacity: number;
  currentCapacity: number;
  lockPeriod: number;
  managementFee: number;
  performanceFee: number;
  status: string;
  allocation: {
    liquidityPool: number;
    creditLending: number;
    insuranceBacking: number;
    providerStaking: number;
    reserve: number;
  };
}

interface Position {
  id: string;
  strategyId: string;
  depositedAmount: number;
  currentValue: number;
  shares: number;
  earnedYield: number;
  pendingYield: number;
  autoCompound: boolean;
  unlockTime: number | null;
  status: string;
}

const STRATEGY_COLORS: Record<string, { gradient: string; ring: string; bg: string }> = {
  conservative: {
    gradient: 'from-blue-500 to-cyan-500',
    ring: 'ring-blue-500/30',
    bg: 'bg-blue-500/10',
  },
  balanced: {
    gradient: 'from-emerald-500 to-teal-500',
    ring: 'ring-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  aggressive: {
    gradient: 'from-purple-500 to-pink-500',
    ring: 'ring-purple-500/30',
    bg: 'bg-purple-500/10',
  },
};

const RISK_LABELS = ['Very Low', 'Low', 'Moderate', 'High', 'Very High', 'Extreme'];

export default function YieldStrategiesPage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [autoCompound, setAutoCompound] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate agent ID from wallet address
  const agentId = wallet?.address ? `agent_${wallet.address.slice(2, 10).toLowerCase()}` : null;

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [agentId]);

  const fetchData = async () => {
    try {
      setError(null);
      const strategiesRes = await fetch(`${API_URL}/api/defi/strategies`);

      if (strategiesRes.ok) {
        const data = await strategiesRes.json();
        setStrategies(data.strategies || []);
      }

      // Only fetch positions if wallet is connected
      if (agentId) {
        const portfolioRes = await fetch(`${API_URL}/api/defi/portfolio/${agentId}`);
        if (portfolioRes.ok) {
          const data = await portfolioRes.json();
          setPositions(data.portfolio?.strategyPositions || []);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch strategies data:', err);
      setError('Failed to fetch strategies data');
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!selectedStrategy || !depositAmount || !wallet?.address || !agentId) {
      setError('Please connect your wallet first');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/strategies/${selectedStrategy.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentAddress: wallet?.address,
          amount: parseFloat(depositAmount),
          autoCompound,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDepositAmount('');
        setShowDepositModal(false);
        fetchData();
      } else {
        setError(data.error || 'Deposit failed');
      }
    } catch (err) {
      console.error('Deposit failed:', err);
      setError('Deposit failed');
    }

    setActionLoading(false);
  };

  const handleWithdraw = async (positionId: string, shares: number) => {
    setActionLoading(true);
    setError(null);

    try {
      // Find the position to get the strategyId for the correct endpoint
      const position = positions.find(p => p.id === positionId);
      if (!position) {
        setError('Position not found');
        setActionLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/defi/strategies/${position.strategyId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId,
          shares,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        fetchData();
      } else {
        setError(data.error || 'Withdraw failed');
      }
    } catch (err) {
      console.error('Withdraw failed:', err);
      setError('Withdraw failed');
    }

    setActionLoading(false);
  };

  const handleHarvest = async (positionId: string) => {
    setActionLoading(true);
    setError(null);

    try {
      // Find the position to get the strategyId for the correct endpoint
      const position = positions.find(p => p.id === positionId);
      if (!position) {
        setError('Position not found');
        setActionLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/defi/strategies/${position.strategyId}/harvest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        fetchData();
      } else {
        setError(data.error || 'Harvest failed');
      }
    } catch (err) {
      console.error('Harvest failed:', err);
      setError('Harvest failed');
    }

    setActionLoading(false);
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '$0.00';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '0.00%';
    return `${(value * 100).toFixed(2)}%`;
  };

  const totalDeposited = positions.reduce((sum, p) => sum + p.depositedAmount, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const totalEarned = positions.reduce((sum, p) => sum + p.earnedYield, 0);
  const avgAPY = positions.length > 0
    ? strategies
        .filter(s => positions.some(p => p.strategyId === s.id))
        .reduce((sum, s) => sum + s.currentAPY, 0) / positions.length
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header isConnected={isConnected} />

      <PageHeader
        title="Yield Strategies"
        subtitle="Automated yield optimization across DeFi protocols"
        backHref="/defi"
        icon={<Sparkles className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
            <button onClick={() => setError(null)} className="hover:text-red-300">×</button>
          </motion.div>
        )}

        {/* Portfolio Overview */}
        <motion.div
          variants={fadeIn}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          {[
            { label: 'Total Deposited', value: formatCurrency(totalDeposited), icon: Target, color: 'text-blue-400', change: null },
            { label: 'Current Value', value: formatCurrency(totalValue), icon: TrendingUp, color: 'text-emerald-400', change: totalValue > totalDeposited ? `+${formatCurrency(totalValue - totalDeposited)}` : null },
            { label: 'Total Earned', value: formatCurrency(totalEarned), icon: ArrowUpRight, color: 'text-green-400', change: null },
            { label: 'Avg APY', value: formatPercent(avgAPY), icon: BarChart3, color: 'text-purple-400', change: null },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-4 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-dark-800/50 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-dark-400">{stat.label}</p>
                  <p className="text-xl font-bold text-white">{stat.value}</p>
                  {stat.change && (
                    <p className="text-xs text-emerald-400">{stat.change}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Strategies */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Available Strategies</h2>

          {loading ? (
            <div className="text-center py-12 text-dark-400">Loading strategies...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {strategies.map((strategy) => {
                const colors = STRATEGY_COLORS[strategy.type] || STRATEGY_COLORS.balanced;
                const position = positions.find(p => p.strategyId === strategy.id);
                const capacityPercent = (strategy.currentCapacity / strategy.maxCapacity) * 100;

                return (
                  <motion.div
                    key={strategy.id}
                    variants={staggerItem}
                    className={`relative overflow-hidden rounded-xl border border-dark-700/50 ${colors.bg}`}
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                  >
                    {/* Header */}
                    <div className={`p-5 bg-gradient-to-r ${colors.gradient} bg-opacity-10`}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-white">{strategy.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white`}>
                          {strategy.type}
                        </span>
                      </div>
                      <p className="text-sm text-white/70">{strategy.description}</p>
                    </div>

                    {/* Stats */}
                    <div className="p-5">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-dark-400">Expected APY</p>
                          <p className="text-xl font-bold text-emerald-400">{formatPercent(strategy.expectedAPY)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-400">Current APY</p>
                          <p className="text-xl font-bold text-white">{formatPercent(strategy.currentAPY)}</p>
                        </div>
                      </div>

                      {/* Risk & Metrics */}
                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-dark-400">Risk Level</span>
                          <div className="flex items-center gap-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  i < Math.ceil(strategy.riskLevel / 2)
                                    ? strategy.riskLevel <= 3 ? 'bg-emerald-500' :
                                      strategy.riskLevel <= 6 ? 'bg-yellow-500' : 'bg-red-500'
                                    : 'bg-dark-700'
                                }`}
                              />
                            ))}
                            <span className="text-white text-xs ml-1">
                              {RISK_LABELS[Math.min(Math.floor(strategy.riskLevel / 2), 5)]}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Lock Period</span>
                          <span className="text-white">{strategy.lockPeriod / (24 * 60 * 60 * 1000)} days</span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Min Deposit</span>
                          <span className="text-white">{formatCurrency(strategy.minDeposit)}</span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Fees</span>
                          <span className="text-white">
                            {formatPercent(strategy.managementFee)} mgmt + {formatPercent(strategy.performanceFee)} perf
                          </span>
                        </div>
                      </div>

                      {/* Allocation */}
                      <div className="mb-4">
                        <p className="text-xs text-dark-400 mb-2">Allocation</p>
                        <div className="h-3 rounded-full overflow-hidden flex">
                          <div
                            className="bg-blue-500"
                            style={{ width: `${strategy.allocation.liquidityPool * 100}%` }}
                            title="Liquidity Pool"
                          />
                          <div
                            className="bg-emerald-500"
                            style={{ width: `${strategy.allocation.creditLending * 100}%` }}
                            title="Credit Lending"
                          />
                          <div
                            className="bg-purple-500"
                            style={{ width: `${strategy.allocation.insuranceBacking * 100}%` }}
                            title="Insurance"
                          />
                          <div
                            className="bg-yellow-500"
                            style={{ width: `${strategy.allocation.providerStaking * 100}%` }}
                            title="Staking"
                          />
                          <div
                            className="bg-gray-500"
                            style={{ width: `${strategy.allocation.reserve * 100}%` }}
                            title="Reserve"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded" /> LP</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded" /> Lending</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500 rounded" /> Insurance</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded" /> Staking</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-500 rounded" /> Reserve</span>
                        </div>
                      </div>

                      {/* Capacity */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-dark-400">Capacity</span>
                          <span className="text-white">{capacityPercent.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${colors.gradient}`}
                            style={{ width: `${capacityPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Position Info */}
                      {position && (
                        <div className="p-3 bg-dark-800/50 rounded-lg mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-dark-400">Your Position</span>
                            <span className="text-white font-semibold">{formatCurrency(position.currentValue)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-dark-500">Pending Yield</span>
                            <span className="text-emerald-400">+{formatCurrency(position.pendingYield)}</span>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedStrategy(strategy);
                            setShowDepositModal(true);
                          }}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg bg-gradient-to-r ${colors.gradient} text-white hover:opacity-90 transition-opacity`}
                        >
                          Deposit
                        </button>
                        {position && position.pendingYield > 0 && (
                          <button
                            onClick={() => handleHarvest(position.id)}
                            disabled={actionLoading}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-dark-800 text-white hover:bg-dark-700 transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Active Positions */}
        {positions.length > 0 && (
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Your Positions</h2>

            <div className="space-y-4">
              {positions.map((position) => {
                const strategy = strategies.find(s => s.id === position.strategyId);
                if (!strategy) return null;

                const colors = STRATEGY_COLORS[strategy.type] || STRATEGY_COLORS.balanced;
                const profitLoss = position.currentValue - position.depositedAmount;
                const profitPercent = (profitLoss / position.depositedAmount) * 100;
                const isLocked = position.unlockTime && position.unlockTime > Date.now();

                return (
                  <div
                    key={position.id}
                    className="p-5 rounded-xl border border-dark-700/50"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-lg bg-gradient-to-br ${colors.gradient}`}>
                          <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{strategy.name}</h3>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-dark-400">{formatCurrency(position.depositedAmount)} deposited</span>
                            {position.autoCompound && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                                Auto-compound
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-dark-400">Current Value</p>
                          <p className="text-lg font-bold text-white">{formatCurrency(position.currentValue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-dark-400">P&L</p>
                          <p className={`text-lg font-bold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {profitLoss >= 0 ? '+' : ''}{formatCurrency(profitLoss)} ({profitPercent.toFixed(2)}%)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-dark-400">Pending Yield</p>
                          <p className="text-lg font-bold text-purple-400">{formatCurrency(position.pendingYield)}</p>
                        </div>

                        <div className="flex gap-2">
                          {position.pendingYield > 0 && !position.autoCompound && (
                            <button
                              onClick={() => handleHarvest(position.id)}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-medium"
                            >
                              Harvest
                            </button>
                          )}
                          {!isLocked && (
                            <button
                              onClick={() => handleWithdraw(position.id, position.shares)}
                              disabled={actionLoading}
                              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium"
                            >
                              Withdraw
                            </button>
                          )}
                          {isLocked && (
                            <div className="flex items-center gap-1 text-yellow-400 text-sm">
                              <Lock className="w-4 h-4" />
                              <span>Locked</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Deposit Modal */}
        {showDepositModal && selectedStrategy && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md p-6 rounded-xl border border-dark-700/50 bg-dark-900"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Deposit to {selectedStrategy.name}</h3>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="text-dark-400 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    min={selectedStrategy.minDeposit}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Min: {formatCurrency(selectedStrategy.minDeposit)}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                  <span className="text-sm text-dark-400">Auto-compound yields</span>
                  <button
                    onClick={() => setAutoCompound(!autoCompound)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      autoCompound ? 'bg-emerald-500' : 'bg-dark-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        autoCompound ? 'left-7' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 bg-dark-800/30 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Expected APY</span>
                    <span className="text-emerald-400">{formatPercent(selectedStrategy.expectedAPY)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Lock Period</span>
                    <span className="text-white">{selectedStrategy.lockPeriod / (24 * 60 * 60 * 1000)} days</span>
                  </div>
                  {depositAmount && parseFloat(depositAmount) > 0 && (
                    <div className="flex justify-between text-sm pt-2 border-t border-dark-700/50">
                      <span className="text-dark-400">Est. Monthly Yield</span>
                      <span className="text-emerald-400">
                        +{formatCurrency(parseFloat(depositAmount) * selectedStrategy.expectedAPY / 12)}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) < selectedStrategy.minDeposit || actionLoading}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Deposit'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
