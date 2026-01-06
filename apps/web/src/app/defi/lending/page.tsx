'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Percent,
  DollarSign,
  Activity,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CreditLine {
  id: string;
  agentId: string;
  agentAddress: string;
  creditTier: string;
  creditScore: number;
  creditLimit: number;
  availableCredit: number;
  outstandingBalance: number;
  interestRate: number;
  collateralAmount: number;
  collateralRatio: number;
  healthFactor: number | null;
  status: string;
}

interface TierConfig {
  minScore: number;
  maxScore: number;
  creditLimit: number;
  interestRate: number;
  collateralRequired: number;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  exceptional: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  excellent: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  good: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  fair: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  subprime: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
};

export default function CreditLendingPage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [creditLine, setCreditLine] = useState<CreditLine | null>(null);
  const [tierConfig, setTierConfig] = useState<Record<string, TierConfig>>({});
  const [loading, setLoading] = useState(true);
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'borrow' | 'repay' | 'collateral'>('borrow');
  const [creditScoreInput, setCreditScoreInput] = useState('850'); // Default to exceptional tier (0% collateral)
  const [borrowPurpose, setBorrowPurpose] = useState('agent_operations');
  const [flashFeeRate, setFlashFeeRate] = useState<number>(0.0005);
  const [error, setError] = useState<string | null>(null);

  // Borrow purpose options
  const borrowPurposes = [
    { value: 'agent_operations', label: 'Agent Operations' },
    { value: 'working_capital', label: 'Working Capital' },
    { value: 'tool_execution', label: 'Tool Execution' },
    { value: 'other', label: 'Other' },
  ];

  // Generate agent ID from wallet address
  const agentId = wallet?.address ? `agent_${wallet.address.slice(2, 10).toLowerCase()}` : null;

  useEffect(() => {
    if (agentId) {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [agentId]);

  const fetchData = async () => {
    if (!agentId) return;

    try {
      setError(null);
      const [creditRes, ratesRes, flashRes] = await Promise.all([
        fetch(`${API_URL}/api/defi/credit/lines/${agentId}`),
        fetch(`${API_URL}/api/defi/credit/rates`),
        fetch(`${API_URL}/api/defi/flash/available`),
      ]);

      if (creditRes.ok) {
        const data = await creditRes.json();
        setCreditLine(data.creditLine || null);
      }

      if (ratesRes.ok) {
        const data = await ratesRes.json();
        // API returns 'tiers' not 'tierRates'
        setTierConfig(data.tiers || {});
      }

      if (flashRes.ok) {
        const data = await flashRes.json();
        setFlashFeeRate(data.availability?.feeRate || 0.0005);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch credit data:', err);
      setError('Failed to fetch credit data');
      setLoading(false);
    }
  };

  const handleOpenCreditLine = async () => {
    if (!wallet?.address || !agentId) {
      setError('Please connect your wallet first');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/credit/lines/${agentId}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentAddress: wallet?.address,
          creditScore: parseInt(creditScoreInput) || 750,
          collateral: 0,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        fetchData();
      } else {
        setError(data.error || 'Failed to open credit line');
      }
    } catch (err) {
      console.error('Failed to open credit line:', err);
      setError('Failed to open credit line');
    }
    setActionLoading(false);
  };

  const handleBorrow = async () => {
    if (!borrowAmount || !creditLine) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/credit/borrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLineId: creditLine.id,
          amount: parseFloat(borrowAmount),
          purpose: borrowPurpose,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBorrowAmount('');
        fetchData();
      } else {
        setError(data.error || 'Borrow failed');
      }
    } catch (err) {
      console.error('Borrow failed:', err);
      setError('Borrow failed');
    }

    setActionLoading(false);
  };

  const handleRepay = async () => {
    if (!repayAmount || !creditLine) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/credit/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLineId: creditLine.id,
          amount: parseFloat(repayAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRepayAmount('');
        fetchData();
      } else {
        setError(data.error || 'Repay failed');
      }
    } catch (err) {
      console.error('Repay failed:', err);
      setError('Repay failed');
    }

    setActionLoading(false);
  };

  const handleAddCollateral = async () => {
    if (!collateralAmount || !creditLine) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/credit/collateral/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditLineId: creditLine.id,
          amount: parseFloat(collateralAmount),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCollateralAmount('');
        fetchData();
      } else {
        setError(data.error || 'Add collateral failed');
      }
    } catch (err) {
      console.error('Add collateral failed:', err);
      setError('Add collateral failed');
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

  const getHealthColor = (health: number | null) => {
    if (health === null || health === Infinity) return 'text-emerald-400';
    if (health >= 2) return 'text-emerald-400';
    if (health >= 1.5) return 'text-yellow-400';
    if (health >= 1) return 'text-orange-400';
    return 'text-red-400';
  };

  const formatHealthFactor = (health: number | null) => {
    if (health === null) return '∞';
    if (health === Infinity) return '∞';
    return health.toFixed(2);
  };

  // Show wallet connect prompt if not connected
  if (!wallet?.address) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <Header isConnected={isConnected} />
        <PageHeader
          title="Credit Lending"
          subtitle="Under-collateralized loans based on your reputation"
          backHref="/defi"
          icon={<CreditCard className="w-6 h-6" />}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="max-w-md mx-auto text-center py-12"
          >
            <CreditCard className="w-16 h-16 text-dark-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-dark-400 mb-4">
              Connect your wallet to access credit lending features.
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
        title="Credit Lending"
        subtitle="Under-collateralized loans based on your reputation"
        backHref="/defi"
        icon={<CreditCard className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
          >
            {error}
          </motion.div>
        )}

        {loading ? (
          <div className="text-center py-12 text-dark-400">Loading credit data...</div>
        ) : !creditLine ? (
          /* No Credit Line - Show Open Credit Line CTA */
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="max-w-2xl mx-auto"
          >
            <div
              className="p-8 rounded-xl border border-dark-700/50 text-center"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <CreditCard className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Open Your Credit Line</h2>
              <p className="text-dark-400 mb-6">
                Get access to under-collateralized loans based on your agent's reputation.
                Higher credit scores mean lower interest rates and less collateral required.
              </p>

              {/* Tier Preview */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
                {Object.entries(tierConfig).map(([tier, config]) => {
                  const colors = TIER_COLORS[tier] || TIER_COLORS.fair;
                  return (
                    <div
                      key={tier}
                      className={`p-3 rounded-lg ${colors.bg} border ${colors.border}`}
                    >
                      <p className={`text-sm font-semibold capitalize ${colors.text}`}>{tier}</p>
                      <p className="text-xs text-dark-300 mt-1">{formatPercent(config.interestRate)} APR</p>
                      <p className="text-xs text-dark-400">{formatPercent(config.collateralRequired)} collateral</p>
                    </div>
                  );
                })}
              </div>

              {/* Credit Score Input */}
              <div className="mb-6">
                <label className="block text-sm text-dark-400 mb-2">Your Credit Score (300-850)</label>
                <input
                  type="number"
                  min="300"
                  max="850"
                  value={creditScoreInput}
                  onChange={(e) => setCreditScoreInput(e.target.value)}
                  className="w-full max-w-xs mx-auto px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white text-center placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-xs text-dark-500 mt-1">
                  Connected: {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                </p>
                <p className="text-xs text-emerald-400 mt-2">
                  💡 Tip: Score 850+ = Exceptional tier with 0% collateral required
                </p>
              </div>

              <button
                onClick={handleOpenCreditLine}
                disabled={actionLoading}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {actionLoading ? 'Opening...' : 'Open Credit Line'}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Has Credit Line - Show Dashboard */
          <>
            {/* Credit Line Overview */}
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
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{creditLine.creditScore}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white capitalize">{creditLine.creditTier} Tier</h2>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          creditLine.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {creditLine.status}
                        </span>
                      </div>
                      <p className="text-dark-400">Credit Score: {creditLine.creditScore}/850</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-dark-400">Health Factor</p>
                      <p className={`text-2xl font-bold ${getHealthColor(creditLine.healthFactor)}`}>
                        {formatHealthFactor(creditLine.healthFactor)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-dark-400">Interest Rate</p>
                      <p className="text-2xl font-bold text-white">{formatPercent(creditLine.interestRate)}</p>
                    </div>
                  </div>
                </div>

                {/* Credit Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <DollarSign className="w-4 h-4" />
                      <span className="text-sm">Credit Limit</span>
                    </div>
                    <p className="text-xl font-bold text-white">{formatCurrency(creditLine.creditLimit)}</p>
                  </div>
                  <div className="p-4 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Available</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-400">{formatCurrency(creditLine.availableCredit)}</p>
                  </div>
                  <div className="p-4 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <ArrowDownRight className="w-4 h-4" />
                      <span className="text-sm">Outstanding</span>
                    </div>
                    <p className="text-xl font-bold text-orange-400">{formatCurrency(creditLine.outstandingBalance)}</p>
                  </div>
                  <div className="p-4 bg-dark-800/30 rounded-lg">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm">Collateral</span>
                    </div>
                    <p className="text-xl font-bold text-white">{formatCurrency(creditLine.collateralAmount)}</p>
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="mt-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-dark-400">Credit Utilization</span>
                    <span className="text-white">
                      {formatPercent((creditLine.creditLimit - creditLine.availableCredit) / creditLine.creditLimit)}
                    </span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                      style={{ width: `${((creditLine.creditLimit - creditLine.availableCredit) / creditLine.creditLimit) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Action Panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Borrow */}
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                className={`p-6 rounded-xl border cursor-pointer transition-all ${
                  activeAction === 'borrow' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-dark-700/50'
                }`}
                style={activeAction !== 'borrow' ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' } : undefined}
                onClick={() => setActiveAction('borrow')}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Borrow</h3>
                </div>

                {activeAction === 'borrow' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                      <input
                        type="number"
                        value={borrowAmount}
                        onChange={(e) => setBorrowAmount(e.target.value)}
                        placeholder="0.00"
                        max={creditLine.availableCredit}
                        className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-emerald-500/50"
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        Max: {formatCurrency(creditLine.availableCredit)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Purpose</label>
                      <select
                        value={borrowPurpose}
                        onChange={(e) => setBorrowPurpose(e.target.value)}
                        className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white focus:outline-none focus:border-emerald-500/50"
                      >
                        {borrowPurposes.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleBorrow}
                      disabled={!borrowAmount || actionLoading || parseFloat(borrowAmount) > creditLine.availableCredit}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionLoading ? 'Processing...' : 'Borrow'}
                    </button>
                  </div>
                )}
              </motion.div>

              {/* Repay */}
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.1 }}
                className={`p-6 rounded-xl border cursor-pointer transition-all ${
                  activeAction === 'repay' ? 'border-blue-500/50 bg-blue-500/5' : 'border-dark-700/50'
                }`}
                style={activeAction !== 'repay' ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' } : undefined}
                onClick={() => setActiveAction('repay')}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <ArrowDownRight className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Repay</h3>
                </div>

                {activeAction === 'repay' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                      <input
                        type="number"
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                        placeholder="0.00"
                        max={creditLine.outstandingBalance}
                        className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-blue-500/50"
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        Outstanding: {formatCurrency(creditLine.outstandingBalance)}
                      </p>
                    </div>

                    <button
                      onClick={handleRepay}
                      disabled={!repayAmount || actionLoading || creditLine.outstandingBalance === 0}
                      className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionLoading ? 'Processing...' : 'Repay'}
                    </button>
                  </div>
                )}
              </motion.div>

              {/* Add Collateral */}
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                transition={{ delay: 0.2 }}
                className={`p-6 rounded-xl border cursor-pointer transition-all ${
                  activeAction === 'collateral' ? 'border-purple-500/50 bg-purple-500/5' : 'border-dark-700/50'
                }`}
                style={activeAction !== 'collateral' ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' } : undefined}
                onClick={() => setActiveAction('collateral')}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Shield className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Add Collateral</h3>
                </div>

                {activeAction === 'collateral' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-dark-400 mb-2">Amount (USDC)</label>
                      <input
                        type="number"
                        value={collateralAmount}
                        onChange={(e) => setCollateralAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-purple-500/50"
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        Current: {formatCurrency(creditLine.collateralAmount)}
                      </p>
                    </div>

                    <button
                      onClick={handleAddCollateral}
                      disabled={!collateralAmount || actionLoading}
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionLoading ? 'Processing...' : 'Add Collateral'}
                    </button>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Flash Loans Section */}
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="mt-8 p-6 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Zap className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Flash Loans</h3>
                  <p className="text-sm text-dark-400">Instant uncollateralized loans - {(flashFeeRate * 100).toFixed(2)}% fee</p>
                </div>
              </div>

              <p className="text-dark-400 text-sm mb-4">
                Flash loans allow you to borrow any amount instantly without collateral,
                as long as you repay within the same transaction. Perfect for arbitrage,
                liquidations, and multi-step operations.
              </p>

              <a
                href="/defi/flash-loans"
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
              >
                <Zap className="w-4 h-4" />
                Execute Flash Loan
              </a>
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
