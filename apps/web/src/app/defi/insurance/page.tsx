'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  DollarSign,
  Users,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp, staggerContainer, staggerItem } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface InsurancePool {
  id: string;
  name: string;
  riskCategory: string;
  description: string;
  totalCoverage: number;
  availableCoverage?: number;
  availableFunds?: number;
  premiumRate?: number;
  currentPremiumRate?: number;
  basePremiumRate?: number;
  totalPremiums?: number;
  totalClaims?: number;
  totalClaimsPaid?: number;
  claimRatio?: number;
  lossRatio?: number;
  status: string;
  maxCoveragePerPolicy?: number;
}

interface Policy {
  id: string;
  poolId: string;
  coverageAmount: number;
  premium: number;
  startDate: number;
  expiresAt: number;
  status: string;
}

interface Claim {
  id: string;
  policyId: string;
  claimAmount: number;
  reason: string;
  status: string;
  filedAt: number;
}

const RISK_CATEGORIES: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  provider_failure: { icon: AlertTriangle, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  dispute: { icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  dispute_coverage: { icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  smart_contract: { icon: FileText, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  oracle_failure: { icon: Activity, color: 'text-red-400', bgColor: 'bg-red-500/20' },
  slashing: { icon: ShieldAlert, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  slashing_protection: { icon: ShieldAlert, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
};

export default function InsurancePage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [pools, setPools] = useState<InsurancePool[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<InsurancePool | null>(null);
  const [coverageAmount, setCoverageAmount] = useState('');
  const [duration, setDuration] = useState('30');
  const [actionLoading, setActionLoading] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
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
      const poolsRes = await fetch(`${API_URL}/api/defi/insurance/pools`);

      if (poolsRes.ok) {
        const data = await poolsRes.json();
        setPools(data.pools || []);
      }

      // Only fetch user-specific data if wallet is connected
      if (agentId) {
        const portfolioRes = await fetch(`${API_URL}/api/defi/portfolio/${agentId}`);
        if (portfolioRes.ok) {
          const data = await portfolioRes.json();
          setPolicies(data.portfolio?.insurancePolicies || []);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch insurance data:', err);
      setError('Failed to fetch insurance data');
      setLoading(false);
    }
  };

  const handlePurchasePolicy = async () => {
    if (!selectedPool || !coverageAmount || !wallet?.address || !agentId) {
      setError('Please connect your wallet first');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/insurance/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: selectedPool.id,
          holderId: agentId,
          holderAddress: wallet?.address,
          coverageAmount: parseFloat(coverageAmount),
          durationDays: parseInt(duration),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCoverageAmount('');
        setShowPurchaseModal(false);
        fetchData();
      } else {
        setError(data.error || 'Purchase failed');
      }
    } catch (err) {
      console.error('Purchase failed:', err);
      setError('Purchase failed');
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const totalCoverage = policies.reduce((sum, p) => p.status === 'active' ? sum + p.coverageAmount : sum, 0);
  const activePolicies = policies.filter(p => p.status === 'active').length;
  const pendingClaims = claims.filter(c => c.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header isConnected={isConnected} />

      <PageHeader
        title="Insurance"
        subtitle="Protect your operations with coverage for various risks"
        backHref="/defi"
        icon={<Shield className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Coverage Summary */}
        <motion.div
          variants={fadeIn}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          {[
            { label: 'Total Coverage', value: formatCurrency(totalCoverage), icon: ShieldCheck, color: 'text-emerald-400' },
            { label: 'Active Policies', value: activePolicies.toString(), icon: FileText, color: 'text-blue-400' },
            { label: 'Pending Claims', value: pendingClaims.toString(), icon: Clock, color: 'text-yellow-400' },
            { label: 'Available Pools', value: pools.length.toString(), icon: Users, color: 'text-purple-400' },
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
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Insurance Pools */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Insurance Pools</h2>

          {loading ? (
            <div className="text-center py-12 text-dark-400">Loading insurance pools...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pools.map((pool) => {
                const category = RISK_CATEGORIES[pool.riskCategory] || RISK_CATEGORIES.provider_failure;
                const CategoryIcon = category.icon;

                return (
                  <motion.div
                    key={pool.id}
                    variants={staggerItem}
                    className="p-5 rounded-xl border border-dark-700/50 hover:border-dark-600/50 transition-all cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                    onClick={() => {
                      setSelectedPool(pool);
                      setShowPurchaseModal(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${category.bgColor}`}>
                          <CategoryIcon className={`w-5 h-5 ${category.color}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{pool.name}</h3>
                          <p className="text-xs text-dark-400 capitalize">{pool.riskCategory.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        pool.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {pool.status}
                      </span>
                    </div>

                    <p className="text-sm text-dark-400 mb-4 line-clamp-2">{pool.description}</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-dark-500">Available Coverage</p>
                        <p className="text-sm font-semibold text-white">{formatCurrency(pool.availableCoverage ?? pool.availableFunds ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-dark-500">Premium Rate</p>
                        <p className="text-sm font-semibold text-emerald-400">{formatPercent(pool.premiumRate ?? pool.currentPremiumRate ?? 0)}/year</p>
                      </div>
                      <div>
                        <p className="text-xs text-dark-500">Total Claims</p>
                        <p className="text-sm font-semibold text-white">{formatCurrency(pool.totalClaims ?? pool.totalClaimsPaid ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-dark-500">Claim Ratio</p>
                        <p className="text-sm font-semibold text-white">{formatPercent(pool.claimRatio ?? pool.lossRatio ?? 0)}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-dark-700/50">
                      <button className="w-full py-2 text-sm text-center text-emerald-400 hover:text-emerald-300 transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-4 h-4" />
                        Get Coverage
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Active Policies */}
        {policies.length > 0 && (
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            className="mb-8"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Your Policies</h2>

            <div className="space-y-3">
              {policies.map((policy) => {
                const pool = pools.find(p => p.id === policy.poolId);
                const isExpired = policy.expiresAt < Date.now();
                const daysRemaining = Math.max(0, Math.ceil((policy.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));

                return (
                  <div
                    key={policy.id}
                    className="p-4 rounded-xl border border-dark-700/50"
                    style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                          {isExpired ? (
                            <XCircle className="w-5 h-5 text-red-400" />
                          ) : (
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{pool?.name || 'Unknown Pool'}</p>
                          <p className="text-sm text-dark-400">Coverage: {formatCurrency(policy.coverageAmount)}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`text-sm font-medium ${isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                          {isExpired ? 'Expired' : `${daysRemaining} days left`}
                        </p>
                        <p className="text-xs text-dark-400">Expires {formatDate(policy.expiresAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Claims History */}
        {claims.length > 0 && (
          <motion.div
            variants={fadeInUp}
            initial="initial"
            animate="animate"
          >
            <h2 className="text-lg font-semibold text-white mb-4">Claims History</h2>

            <div className="space-y-3">
              {claims.map((claim) => (
                <div
                  key={claim.id}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{formatCurrency(claim.claimAmount)}</p>
                      <p className="text-sm text-dark-400">{claim.reason}</p>
                    </div>

                    <div className="text-right">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        claim.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                        claim.status === 'denied' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {claim.status}
                      </span>
                      <p className="text-xs text-dark-400 mt-1">Filed {formatDate(claim.filedAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Purchase Modal */}
        {showPurchaseModal && selectedPool && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md p-6 rounded-xl border border-dark-700/50 bg-dark-900"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Purchase Coverage</h3>
                <button
                  onClick={() => setShowPurchaseModal(false)}
                  className="text-dark-400 hover:text-white"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-dark-800/50 rounded-lg">
                <p className="text-sm text-dark-400">Pool</p>
                <p className="font-semibold text-white">{selectedPool.name}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Coverage Amount (USDC)</label>
                  <input
                    type="number"
                    value={coverageAmount}
                    onChange={(e) => setCoverageAmount(e.target.value)}
                    placeholder="0.00"
                    max={selectedPool.availableCoverage ?? selectedPool.availableFunds ?? selectedPool.maxCoveragePerPolicy ?? 0}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Max: {formatCurrency(Number(selectedPool.availableCoverage ?? selectedPool.availableFunds ?? selectedPool.maxCoveragePerPolicy ?? 0))}
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-dark-400 mb-2">Duration (Days)</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">365 days</option>
                  </select>
                </div>

                {coverageAmount && (
                  <div className="p-3 bg-dark-800/30 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Premium Rate</span>
                      <span className="text-white">{formatPercent(selectedPool.premiumRate ?? selectedPool.currentPremiumRate ?? 0)}/year</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Estimated Premium</span>
                      <span className="text-emerald-400">
                        {formatCurrency(
                          parseFloat(coverageAmount) * (selectedPool.premiumRate ?? selectedPool.currentPremiumRate ?? 0) * (parseInt(duration) / 365)
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePurchasePolicy}
                  disabled={!coverageAmount || actionLoading}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Purchase Coverage'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
