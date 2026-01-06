'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Droplets,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  RefreshCw,
  Info,
  Wallet,
  BarChart3,
  Clock,
  Users,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp, staggerContainer, staggerItem } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Pool {
  id: string;
  name: string;
  description: string;
  totalLiquidity: number;
  availableLiquidity: number;
  apy: number;
  utilizationRate: number;
  totalShares: number;
  sharePrice: number;
  depositFee: number;
  withdrawalFee: number;
  status: string;
}

interface Position {
  id: string;
  poolId: string;
  shares: number;
  depositedAmount: number;
  currentValue: number;
  earnedYield: number;
  pendingYield: number;
}

export default function LiquidityPoolsPage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [pools, setPools] = useState<Pool[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
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
      const poolsRes = await fetch(`${API_URL}/api/defi/pools`);

      if (poolsRes.ok) {
        const data = await poolsRes.json();
        setPools(data.pools || []);
      }

      // Only fetch positions if wallet is connected
      if (agentId) {
        const portfolioRes = await fetch(`${API_URL}/api/defi/portfolio/${agentId}`);
        if (portfolioRes.ok) {
          const data = await portfolioRes.json();
          setPositions(data.portfolio?.liquidityPositions || []);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch pools data:', err);
      setError('Failed to fetch pools data');
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!selectedPool || !depositAmount || !wallet?.address || !agentId) {
      setError('Please connect your wallet first');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/pools/${selectedPool.id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentAddress: wallet?.address,
          amount: parseFloat(depositAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDepositAmount('');
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

  const handleWithdraw = async () => {
    if (!selectedPool || !withdrawAmount) return;
    setActionLoading(true);
    setError(null);

    try {
      const position = positions.find(p => p.poolId === selectedPool.id);
      if (!position) {
        setError('Position not found');
        setActionLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/defi/pools/${selectedPool.id}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionId: position.id,
          shares: parseFloat(withdrawAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWithdrawAmount('');
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

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header isConnected={isConnected} />

      <PageHeader
        title="Liquidity Pools"
        subtitle="Deposit USDC to earn yield from platform activity"
        backHref="/defi"
        icon={<Droplets className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:text-red-300">×</button>
          </motion.div>
        )}

        {/* Portfolio Summary */}
        <motion.div
          variants={fadeIn}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          {[
            { label: 'Total Deposited', value: formatCurrency(totalDeposited), icon: Wallet, color: 'text-blue-400' },
            { label: 'Current Value', value: formatCurrency(totalValue), icon: TrendingUp, color: 'text-emerald-400' },
            { label: 'Total Earned', value: formatCurrency(totalEarned), icon: ArrowUpRight, color: 'text-green-400' },
            { label: 'Active Positions', value: positions.length.toString(), icon: BarChart3, color: 'text-purple-400' },
          ].map((stat, i) => (
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
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pool List */}
          <div className="lg:col-span-2">
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold text-white mb-4">Available Pools</h2>

              {loading ? (
                <div className="text-center py-12 text-dark-400">Loading pools...</div>
              ) : pools.length === 0 ? (
                <div className="text-center py-12 text-dark-400">No pools available</div>
              ) : (
                pools.map((pool) => {
                  const position = positions.find(p => p.poolId === pool.id);
                  const isSelected = selectedPool?.id === pool.id;

                  return (
                    <motion.div
                      key={pool.id}
                      variants={staggerItem}
                      onClick={() => setSelectedPool(pool)}
                      className={`p-5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-dark-700/50 hover:border-dark-600/50'
                      }`}
                      style={{ background: isSelected ? undefined : 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{pool.name}</h3>
                          <p className="text-sm text-dark-400">{pool.description}</p>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          pool.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {pool.status}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-dark-400">TVL</p>
                          <p className="text-sm font-semibold text-white">{formatCurrency(pool.totalLiquidity)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-400">APY</p>
                          <p className="text-sm font-semibold text-emerald-400">{formatPercent(pool.apy)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-400">Utilization</p>
                          <p className="text-sm font-semibold text-white">{formatPercent(pool.utilizationRate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-dark-400">Share Price</p>
                          <p className="text-sm font-semibold text-white">${pool.sharePrice.toFixed(4)}</p>
                        </div>
                      </div>

                      {position && (
                        <div className="mt-4 pt-4 border-t border-dark-700/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-dark-400">Your Position</span>
                            <span className="text-sm font-semibold text-white">{formatCurrency(position.currentValue)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-dark-500">Pending Yield</span>
                            <span className="text-xs text-emerald-400">+{formatCurrency(position.pendingYield)}</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </div>

          {/* Action Panel */}
          <div className="lg:col-span-1">
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="sticky top-24 p-6 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              {selectedPool ? (
                <>
                  <h3 className="text-lg font-semibold text-white mb-4">{selectedPool.name}</h3>

                  {/* Tabs */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setActiveTab('deposit')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'deposit'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-dark-800/50 text-dark-400 hover:text-white'
                      }`}
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Deposit
                    </button>
                    <button
                      onClick={() => setActiveTab('withdraw')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === 'withdraw'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-dark-800/50 text-dark-400 hover:text-white'
                      }`}
                    >
                      <Minus className="w-4 h-4 inline mr-1" />
                      Withdraw
                    </button>
                  </div>

                  {activeTab === 'deposit' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>

                      <div className="p-3 bg-dark-800/30 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Deposit Fee</span>
                          <span className="text-white">{formatPercent(selectedPool.depositFee)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Estimated APY</span>
                          <span className="text-emerald-400">{formatPercent(selectedPool.apy)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Shares to Receive</span>
                          <span className="text-white">
                            {depositAmount ? (parseFloat(depositAmount) / selectedPool.sharePrice).toFixed(4) : '0'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleDeposit}
                        disabled={!depositAmount || actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {actionLoading ? 'Processing...' : 'Deposit'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-dark-400 mb-2">Shares to Withdraw</label>
                        <input
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-red-500/50"
                        />
                      </div>

                      <div className="p-3 bg-dark-800/30 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Withdrawal Fee</span>
                          <span className="text-white">{formatPercent(selectedPool.withdrawalFee)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-dark-400">Estimated USDC</span>
                          <span className="text-white">
                            {withdrawAmount ? formatCurrency(parseFloat(withdrawAmount) * selectedPool.sharePrice) : '$0'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleWithdraw}
                        disabled={!withdrawAmount || actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {actionLoading ? 'Processing...' : 'Withdraw'}
                      </button>
                    </div>
                  )}

                  {/* Pool Info */}
                  <div className="mt-6 pt-6 border-t border-dark-700/50">
                    <div className="flex items-center gap-2 text-dark-400 mb-3">
                      <Info className="w-4 h-4" />
                      <span className="text-sm">Pool Information</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-dark-400">Available Liquidity</span>
                        <span className="text-white">{formatCurrency(selectedPool.availableLiquidity)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dark-400">Total Shares</span>
                        <span className="text-white">{selectedPool.totalShares.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Droplets className="w-12 h-12 text-dark-600 mx-auto mb-4" />
                  <p className="text-dark-400">Select a pool to deposit or withdraw</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
