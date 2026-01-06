'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  ArrowRight,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Header } from '../../../components/Header';
import { PageHeader } from '../../../components/PageHeader';
import { fadeIn, fadeInUp, staggerContainer, staggerItem } from '../../../lib/animations';
import { useSocket } from '../../../hooks/useSocket';
import { useWalletContext } from '../../../hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FlashLoan {
  id: string;
  borrower: string;
  amount: number;
  fee: number;
  purpose: string;
  status: 'pending' | 'executed' | 'repaid' | 'defaulted';
  borrowedAt: string;
  repaidAt?: string;
  executionTimeMs?: number;
}

interface FlashLoanStats {
  totalLoansExecuted: number;
  totalVolumeLoaned: number;
  totalFeesCollected: number;
  averageLoanSize: number;
  successRate: number;
}

interface Availability {
  available: boolean;
  maxAmount: number;
  feeRate: number;
  poolUtilization: number;
}

export default function FlashLoansPage() {
  const { isConnected } = useSocket();
  const walletContext = useWalletContext();
  const wallet = walletContext?.wallet ?? null;
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [stats, setStats] = useState<FlashLoanStats | null>(null);
  const [history, setHistory] = useState<FlashLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [purpose, setPurpose] = useState('arbitrage');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const [availRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/api/defi/flash/available?amount=10000`),
        fetch(`${API_URL}/api/defi/flash/history?limit=20${agentId ? `&borrower=${agentId}` : ''}`),
      ]);

      if (availRes.ok) {
        const data = await availRes.json();
        // API returns { success, availability: { ... } }
        setAvailability(data.availability || data);
        if (data.stats) {
          setStats(data.stats);
        }
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.loans || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch flash loan data:', err);
      setError('Failed to fetch flash loan data');
      setLoading(false);
    }
  };

  const handleExecuteFlashLoan = async () => {
    if (!loanAmount || !wallet?.address || !agentId) {
      setError('Please connect wallet and enter an amount');
      return;
    }

    const amount = parseFloat(loanAmount);
    if (availability && amount > availability.maxAmount) {
      setError(`Maximum available: $${availability.maxAmount.toFixed(2)}`);
      return;
    }

    setExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_URL}/api/defi/flash/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower: agentId,
          borrowerAddress: wallet.address,
          amount,
          purpose,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(`Flash loan executed successfully! Fee: $${data.loan?.fee?.toFixed(4) || '0.00'}`);
        setLoanAmount('');
        fetchData();
      } else {
        setError(data.error || 'Flash loan execution failed');
      }
    } catch (err) {
      console.error('Flash loan execution failed:', err);
      setError('Flash loan execution failed');
    }

    setExecuting(false);
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null) return '$0.00';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'repaid':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'executed':
        return 'bg-blue-500/20 text-blue-400';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'defaulted':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-dark-500/20 text-dark-400';
    }
  };

  const purposes = [
    { value: 'arbitrage', label: 'Arbitrage', desc: 'Cross-exchange price differences' },
    { value: 'liquidation', label: 'Liquidation', desc: 'Protocol liquidation opportunities' },
    { value: 'collateral_swap', label: 'Collateral Swap', desc: 'Swap collateral without repaying' },
    { value: 'intent_execution', label: 'Multi-step Intent', desc: 'Complex intent orchestration' },
  ];

  // Show wallet connect prompt if not connected
  if (!wallet?.address) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <Header isConnected={isConnected} />
        <PageHeader
          title="Flash Loans"
          subtitle="Instant uncollateralized loans - repay in the same transaction"
          backHref="/defi"
          icon={<Zap className="w-6 h-6" />}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="max-w-md mx-auto text-center py-12"
          >
            <Zap className="w-16 h-16 text-yellow-500/50 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-dark-400 mb-4">
              Connect your wallet to execute flash loans.
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
        title="Flash Loans"
        subtitle="Instant uncollateralized loans - repay in the same transaction"
        backHref="/defi"
        icon={<Zap className="w-6 h-6" />}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Messages */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {success}
          </motion.div>
        )}

        {loading ? (
          <div className="text-center py-12 text-dark-400">Loading flash loan data...</div>
        ) : (
          <>
            {/* How It Works */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              className="mb-8 p-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5"
            >
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">How Flash Loans Work</h3>
                  <p className="text-dark-400 text-sm">
                    Flash loans allow you to borrow any amount without collateral, as long as you repay
                    within the same transaction. They're atomic - if repayment fails, the entire
                    transaction reverts. Perfect for arbitrage, liquidations, and multi-step operations.
                  </p>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-yellow-400">{((availability?.feeRate || 0.0005) * 100).toFixed(2)}% fee</span>
                    <span className="text-dark-500">•</span>
                    <span className="text-dark-400">No collateral required</span>
                    <span className="text-dark-500">•</span>
                    <span className="text-dark-400">Instant execution</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Stats */}
            {stats && (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
              >
                <motion.div
                  variants={staggerItem}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs">Total Loans</span>
                  </div>
                  <p className="text-xl font-bold text-white">{stats.totalLoansExecuted}</p>
                </motion.div>
                <motion.div
                  variants={staggerItem}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs">Total Volume</span>
                  </div>
                  <p className="text-xl font-bold text-white">{formatCurrency(stats.totalVolumeLoaned)}</p>
                </motion.div>
                <motion.div
                  variants={staggerItem}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs">Fees Collected</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">{formatCurrency(stats.totalFeesCollected)}</p>
                </motion.div>
                <motion.div
                  variants={staggerItem}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs">Avg Loan Size</span>
                  </div>
                  <p className="text-xl font-bold text-white">{formatCurrency(stats.averageLoanSize)}</p>
                </motion.div>
                <motion.div
                  variants={staggerItem}
                  className="p-4 rounded-xl border border-dark-700/50"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
                >
                  <div className="flex items-center gap-2 text-dark-400 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">Success Rate</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">{((stats.successRate ?? 0) * 100).toFixed(1)}%</p>
                </motion.div>
              </motion.div>
            )}

            {/* Execute Flash Loan */}
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="mb-8 p-6 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Zap className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Execute Flash Loan</h3>
                  <p className="text-sm text-dark-400">
                    Available: {availability ? formatCurrency(availability.maxAmount) : 'Loading...'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Loan Amount (USDC)</label>
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    placeholder="0.00"
                    max={availability?.maxAmount || 100000}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:border-yellow-500/50"
                  />
                  {loanAmount && (
                    <p className="text-xs text-dark-500 mt-1">
                      Fee: ${(parseFloat(loanAmount) * (availability?.feeRate || 0.0005)).toFixed(4)} ({((availability?.feeRate || 0.0005) * 100).toFixed(2)}%)
                    </p>
                  )}
                </div>

                {/* Purpose Selection */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Purpose</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-lg text-white focus:outline-none focus:border-yellow-500/50"
                  >
                    {purposes.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-dark-500 mt-1">
                    {purposes.find(p => p.value === purpose)?.desc}
                  </p>
                </div>
              </div>

              {/* Execution Flow Visualization */}
              {loanAmount && (
                <div className="mt-6 p-4 bg-dark-800/30 rounded-lg">
                  <p className="text-sm text-dark-400 mb-3">Execution Flow:</p>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex-1 p-3 bg-dark-700/50 rounded text-center">
                      <p className="text-yellow-400 font-semibold">Borrow</p>
                      <p className="text-white">${parseFloat(loanAmount).toFixed(2)}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-dark-500" />
                    <div className="flex-1 p-3 bg-dark-700/50 rounded text-center">
                      <p className="text-blue-400 font-semibold">Execute</p>
                      <p className="text-white">{purposes.find(p => p.value === purpose)?.label}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-dark-500" />
                    <div className="flex-1 p-3 bg-dark-700/50 rounded text-center">
                      <p className="text-emerald-400 font-semibold">Repay</p>
                      <p className="text-white">${(parseFloat(loanAmount) * (1 + (availability?.feeRate || 0.0005))).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleExecuteFlashLoan}
                disabled={!loanAmount || executing}
                className="mt-6 w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {executing ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Zap className="w-4 h-4" />
                    </motion.div>
                    Executing...
                  </span>
                ) : (
                  'Execute Flash Loan'
                )}
              </button>
            </motion.div>

            {/* Recent Flash Loans */}
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              className="p-6 rounded-xl border border-dark-700/50"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Recent Flash Loans</h3>
                <span className="text-sm text-dark-400">{history.length} loans</span>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-8 text-dark-400">
                  <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No flash loans executed yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((loan) => (
                    <motion.div
                      key={loan.id}
                      variants={staggerItem}
                      className="p-4 bg-dark-800/30 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{formatCurrency(loan.amount)}</p>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(loan.status)}`}>
                              {loan.status}
                            </span>
                          </div>
                          <p className="text-sm text-dark-400">{loan.purpose}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-dark-400">
                          Fee: <span className="text-emerald-400">${(loan.fee ?? 0).toFixed(4)}</span>
                        </p>
                        {loan.executionTimeMs && (
                          <p className="text-xs text-dark-500">
                            {formatTime(loan.executionTimeMs)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
