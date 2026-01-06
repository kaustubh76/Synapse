'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  TrendingUp,
  ArrowUpRight,
  Star,
  Award,
  Lock,
  Timer,
  Shield,
  Crown,
  Diamond,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp, staggerContainer, staggerItem } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StakingTier {
  name: string;
  minStake: number;
  priorityMultiplier: number;
  feeDiscount: number;
  maxConcurrentIntents: number;
  slashProtection: number;
  unbondingDays: number;
  baseAPY: number;
}

interface ProviderStake {
  id: string;
  providerId: string;
  stakedAmount: number;
  tier: string;
  earnedYield: number;
  claimedYield: number;
  pendingYield: number;
  slashedAmount: number;
  unbondingAmount: number;
  unbondingEndsAt: number | null;
  status: string;
  stakedAt: number;
}

const TIER_ICONS: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  bronze: { icon: Star, color: 'text-amber-600', bgColor: 'bg-amber-600/20' },
  silver: { icon: Star, color: 'text-gray-300', bgColor: 'bg-gray-300/20' },
  gold: { icon: Award, color: 'text-yellow-400', bgColor: 'bg-yellow-400/20' },
  platinum: { icon: Crown, color: 'text-cyan-400', bgColor: 'bg-cyan-400/20' },
  diamond: { icon: Diamond, color: 'text-purple-400', bgColor: 'bg-purple-400/20' },
};

export default function ProviderStakingPage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [tiers, setTiers] = useState<Record<string, StakingTier>>({});
  const [stake, setStake] = useState<ProviderStake | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake' | 'claim'>('stake');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Hydration safety - only render after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate provider ID from wallet address
  const providerId = wallet?.address ? `provider_${wallet.address.slice(2, 10).toLowerCase()}` : null;

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      // Always fetch tiers
      const tiersRes = await fetch(`${API_URL}/api/defi/staking/tiers`);
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setTiers(data.tiers || {});
      }

      // Only fetch stake if wallet is connected
      if (providerId) {
        const stakeRes = await fetch(`${API_URL}/api/defi/staking/${providerId}`);
        if (stakeRes.ok) {
          const data = await stakeRes.json();
          setStake(data.stake);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch staking data:', err);
      setError('Failed to fetch staking data');
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleStake = async () => {
    if (!stakeAmount || !providerId || !wallet?.address) {
      setError('Please connect your wallet first');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/staking/stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          providerAddress: wallet.address,
          amount: parseFloat(stakeAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStakeAmount('');
        fetchData();
      } else {
        setError(data.error || 'Stake failed');
      }
    } catch (err) {
      console.error('Stake failed:', err);
      setError('Stake failed');
    }

    setActionLoading(false);
  };

  const handleUnstake = async () => {
    if (!unstakeAmount || !stake) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/staking/unstake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeId: stake.id,
          amount: parseFloat(unstakeAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUnstakeAmount('');
        fetchData();
      } else {
        setError(data.error || 'Unstake failed');
      }
    } catch (err) {
      console.error('Unstake failed:', err);
      setError('Unstake failed');
    }

    setActionLoading(false);
  };

  const handleClaimYield = async () => {
    if (!stake || stake.pendingYield <= 0) return;
    setActionLoading(true);
    setError(null);

    try {
      // Use the correct endpoint: /api/defi/staking/:stakeId/claim
      const res = await fetch(`${API_URL}/api/defi/staking/${stake.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        fetchData();
      } else {
        setError(data.error || 'Claim yield failed');
      }
    } catch (err) {
      console.error('Claim yield failed:', err);
      setError('Claim yield failed');
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
    if (value === undefined || value === null) return '0.0%';
    return `${(value * 100).toFixed(1)}%`;
  };

  const getCurrentTier = (amount: number): string => {
    const tierOrder = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];
    for (const tier of tierOrder) {
      if (tiers[tier] && amount >= tiers[tier].minStake) {
        return tier;
      }
    }
    return 'bronze';
  };

  const getNextTier = (currentTier: string): string | null => {
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const currentIndex = tierOrder.indexOf(currentTier);
    if (currentIndex < tierOrder.length - 1) {
      return tierOrder[currentIndex + 1];
    }
    return null;
  };

  const currentTier = stake ? getCurrentTier(stake.stakedAmount) : 'bronze';
  const nextTier = getNextTier(currentTier);
  const amountToNextTier = nextTier && tiers[nextTier] && stake
    ? tiers[nextTier].minStake - stake.stakedAmount
    : 0;

  // Show loading during hydration to prevent SSR mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <div className="flex items-center justify-center h-screen">
          <div className="text-dark-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Show wallet connect prompt if not connected
  if (!wallet?.address) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <Header isConnected={isConnected} />
        <PageHeader
          title="Provider Staking"
          subtitle="Stake USDC for priority bidding and earn yield"
          backHref="/defi"
          icon={<Coins className="w-6 h-6" />}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="max-w-md mx-auto text-center py-12"
          >
            <Coins className="w-16 h-16 text-dark-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-dark-400 mb-4">
              Connect your wallet to access provider staking features.
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header isConnected={isConnected} />

      <PageHeader
        title="Provider Staking"
        subtitle="Stake USDC for priority bidding and earn yield"
        backHref="/defi"
        icon={<Coins className="w-6 h-6" />}
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

        {/* Current Stake Overview */}
        {stake && (
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="mb-8"
          >
            <div
              className="p-6 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
                <div className="flex items-center gap-4">
                  {(() => {
                    const tierInfo = TIER_ICONS[currentTier] || TIER_ICONS.bronze;
                    const TierIcon = tierInfo.icon;
                    return (
                      <div className={`w-16 h-16 rounded-full ${tierInfo.bgColor} flex items-center justify-center`}>
                        <TierIcon className={`w-8 h-8 ${tierInfo.color}`} />
                      </div>
                    );
                  })()}
                  <div>
                    <h2 className="text-xl font-bold text-white capitalize">{currentTier} Tier</h2>
                    <p className="text-dark-400">Staked: {formatCurrency(stake.stakedAmount)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-dark-400">Priority Multiplier</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {tiers[currentTier]?.priorityMultiplier || 1}x
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-dark-400">Fee Discount</p>
                    <p className="text-2xl font-bold text-cyan-400">
                      {formatPercent(tiers[currentTier]?.feeDiscount || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-dark-400">Base APY</p>
                    <p className="text-2xl font-bold text-purple-400">
                      {formatPercent(tiers[currentTier]?.baseAPY || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Yield Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm">Total Earned</span>
                  </div>
                  <p className="text-xl font-bold text-white">{formatCurrency(stake.earnedYield)}</p>
                </div>
                <div className="p-4 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <ArrowUpRight className="w-4 h-4" />
                    <span className="text-sm">Pending Yield</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">{formatCurrency(stake.pendingYield)}</p>
                </div>
                <div className="p-4 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <Lock className="w-4 h-4" />
                    <span className="text-sm">Unbonding</span>
                  </div>
                  <p className="text-xl font-bold text-yellow-400">{formatCurrency(stake.unbondingAmount)}</p>
                </div>
                <div className="p-4 bg-dark-800/30 rounded-lg">
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm">Slashed</span>
                  </div>
                  <p className="text-xl font-bold text-red-400">{formatCurrency(stake.slashedAmount)}</p>
                </div>
              </div>

              {/* Progress to Next Tier */}
              {nextTier && tiers[nextTier] && amountToNextTier > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-dark-400">Progress to {nextTier}</span>
                    <span className="text-white">{formatCurrency(amountToNextTier)} more needed</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (stake.stakedAmount / tiers[nextTier].minStake) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Staking Tiers */}
          <div className="lg:col-span-2">
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              <h2 className="text-lg font-semibold text-white mb-4">Staking Tiers</h2>

              {loading ? (
                <div className="text-center py-12 text-dark-400">Loading staking tiers...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(tiers).map(([tierName, tier]) => {
                    const tierInfo = TIER_ICONS[tierName] || TIER_ICONS.bronze;
                    const TierIcon = tierInfo.icon;
                    const isCurrentTier = currentTier === tierName;

                    return (
                      <motion.div
                        key={tierName}
                        variants={staggerItem}
                        className={`p-5 rounded-xl border transition-all ${
                          isCurrentTier
                            ? 'border-emerald-500/50 bg-emerald-500/5'
                            : 'border-dark-700/50'
                        }`}
                        style={!isCurrentTier ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' } : undefined}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`p-2 rounded-lg ${tierInfo.bgColor}`}>
                            <TierIcon className={`w-5 h-5 ${tierInfo.color}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white capitalize">{tierName}</h3>
                            <p className="text-xs text-dark-400">Min: {formatCurrency(tier.minStake)}</p>
                          </div>
                          {isCurrentTier && (
                            <span className="ml-auto px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                              Current
                            </span>
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-dark-400">Priority</span>
                            <span className="text-white font-medium">{tier.priorityMultiplier}x</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Fee Discount</span>
                            <span className="text-emerald-400">{formatPercent(tier.feeDiscount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Base APY</span>
                            <span className="text-purple-400">{formatPercent(tier.baseAPY)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Slash Protection</span>
                            <span className="text-cyan-400">{formatPercent(tier.slashProtection)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Unbonding</span>
                            <span className="text-white">{tier.unbondingDays} days</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Max Intents</span>
                            <span className="text-white">{tier.maxConcurrentIntents}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
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
              <h3 className="text-lg font-semibold text-white mb-4">Manage Stake</h3>

              {/* Tabs */}
              <div className="flex gap-2 mb-6">
                {(['stake', 'unstake', 'claim'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                      activeTab === tab
                        ? tab === 'stake' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          tab === 'unstake' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-dark-800/50 text-dark-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === 'stake' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                    <input
                      type="number"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  {stakeAmount && parseFloat(stakeAmount) > 0 && (
                    <div className="p-3 bg-dark-800/30 rounded-lg">
                      <p className="text-sm text-dark-400 mb-1">New Tier</p>
                      <p className="text-lg font-semibold text-white capitalize">
                        {getCurrentTier((stake?.stakedAmount || 0) + parseFloat(stakeAmount))}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleStake}
                    disabled={!stakeAmount || actionLoading}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {actionLoading ? 'Processing...' : 'Stake'}
                  </button>
                </div>
              )}

              {activeTab === 'unstake' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                    <input
                      type="number"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                      placeholder="0.00"
                      max={stake?.stakedAmount || 0}
                      className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-red-500/50"
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      Available: {formatCurrency(stake?.stakedAmount || 0)}
                    </p>
                  </div>

                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-400 text-sm">
                      <Timer className="w-4 h-4" />
                      <span>
                        {tiers[currentTier]?.unbondingDays || 7} day unbonding period
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleUnstake}
                    disabled={!unstakeAmount || actionLoading || !stake}
                    className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {actionLoading ? 'Processing...' : 'Unstake'}
                  </button>
                </div>
              )}

              {activeTab === 'claim' && (
                <div className="space-y-4">
                  <div className="p-4 bg-dark-800/30 rounded-lg text-center">
                    <p className="text-sm text-dark-400 mb-2">Pending Yield</p>
                    <p className="text-3xl font-bold text-emerald-400">
                      {formatCurrency(stake?.pendingYield || 0)}
                    </p>
                  </div>

                  <button
                    onClick={handleClaimYield}
                    disabled={actionLoading || !stake || stake.pendingYield <= 0}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {actionLoading ? 'Processing...' : 'Claim Yield'}
                  </button>

                  <p className="text-xs text-center text-dark-500">
                    Total claimed: {formatCurrency(stake?.claimedYield || 0)}
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
