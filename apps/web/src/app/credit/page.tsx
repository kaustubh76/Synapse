'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, TrendingUp, Shield, Award, Zap, DollarSign,
  ChevronRight, ArrowUp, ArrowDown, Clock, CheckCircle2,
  AlertCircle, Loader2, Home, RefreshCw, Wallet, Target,
  Star, Lock, Unlock, Calculator, Sparkles
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, EIGENCLOUD_WALLET } from '@/lib/config'

interface CreditFactor {
  score: number
  rating: string
  weight: number
  description: string
}

interface DetailedCreditProfile {
  score: number
  tier: string
  tierConfig: {
    discount: number
    creditLimit: number
    escrowRequired: number
  }
  nextTier: {
    name: string
    pointsNeeded: number
    discount: number
    minScore: number
  } | null
  factors: {
    paymentHistory: CreditFactor
    creditUtilization: CreditFactor
    accountAge: CreditFactor
    creditMix: CreditFactor
    recentActivity: CreditFactor
  }
  balances: {
    currentBalance: number
    availableCredit: number
    dailySpend: number
    monthlySpend: number
    dailyLimit: number
    monthlyLimit: number
  }
  stats: {
    totalTransactions: number
    successfulPayments: number
    latePayments: number
    defaults: number
    accountAgeDays: number
  }
  collateral: {
    stakedAmount: number
    collateralRatio: number
  }
  lastUpdated: number
}

interface SimulationResult {
  currentScore: number
  projectedScore: number
  scoreDelta: number
  currentTier: string
  projectedTier: string
  tierChange: string | null
  projectedDiscount: number
  paymentAmount: number
  onTime: boolean
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  exceptional: { bg: 'from-purple-600 to-pink-600', text: 'text-purple-400', border: 'border-purple-500', glow: 'shadow-purple-500/50' },
  excellent: { bg: 'from-blue-600 to-cyan-600', text: 'text-blue-400', border: 'border-blue-500', glow: 'shadow-blue-500/50' },
  good: { bg: 'from-green-600 to-emerald-600', text: 'text-green-400', border: 'border-green-500', glow: 'shadow-green-500/50' },
  fair: { bg: 'from-yellow-600 to-orange-600', text: 'text-yellow-400', border: 'border-yellow-500', glow: 'shadow-yellow-500/50' },
  subprime: { bg: 'from-red-600 to-rose-600', text: 'text-red-400', border: 'border-red-500', glow: 'shadow-red-500/50' },
}

const TIER_ORDER = ['subprime', 'fair', 'good', 'excellent', 'exceptional']
const TIER_THRESHOLDS = [300, 580, 670, 740, 800, 850]

export default function CreditPage() {
  const [profile, setProfile] = useState<DetailedCreditProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('')

  // Payment simulation
  const [paymentAmount, setPaymentAmount] = useState<number>(10)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Discount calculator
  const [spendAmount, setSpendAmount] = useState<number>(100)

  // Initialize
  useEffect(() => {
    setAgentId(EIGENCLOUD_WALLET.address)
  }, [])

  // Load credit profile
  const loadProfile = useCallback(async () => {
    if (!agentId) return

    setIsLoading(true)
    setError(null)

    try {
      // First ensure profile exists
      await fetch(`${API_URL}/api/llm/credit/${agentId}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: agentId })
      })

      // Then get detailed profile
      const response = await fetch(`${API_URL}/api/llm/credit/${agentId}/detailed`)
      const data = await response.json()

      if (data.success) {
        setProfile(data.data)
      } else {
        setError(data.error?.message || 'Failed to load credit profile')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credit profile')
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (agentId) {
      loadProfile()
    }
  }, [agentId, loadProfile])

  // Simulate payment
  const simulatePayment = async (amount: number) => {
    if (!agentId || amount <= 0) return

    setIsSimulating(true)

    try {
      const response = await fetch(`${API_URL}/api/llm/credit/${agentId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, onTime: true })
      })

      const data = await response.json()

      if (data.success) {
        setSimulation(data.data)
      }
    } catch (err) {
      console.error('Simulation failed:', err)
    } finally {
      setIsSimulating(false)
    }
  }

  // Make payment
  const makePayment = async () => {
    if (!agentId || paymentAmount <= 0) return

    setIsPaying(true)
    setPaymentSuccess(false)

    try {
      const response = await fetch(`${API_URL}/api/llm/credit/${agentId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: paymentAmount, onTime: true })
      })

      const data = await response.json()

      if (data.success) {
        setPaymentSuccess(true)
        setSimulation(null)
        // Reload profile to see updated score
        setTimeout(() => {
          loadProfile()
          setPaymentSuccess(false)
        }, 2000)
      }
    } catch (err) {
      console.error('Payment failed:', err)
    } finally {
      setIsPaying(false)
    }
  }

  // Get tier color
  const getTierColors = (tier: string) => TIER_COLORS[tier] || TIER_COLORS.good

  // Calculate gauge rotation (300-850 maps to -90 to 90 degrees)
  const getGaugeRotation = (score: number) => {
    const normalized = (score - 300) / (850 - 300) // 0 to 1
    return -90 + (normalized * 180) // -90 to 90 degrees
  }

  // Calculate tier progress percentage
  const getTierProgress = (score: number, tier: string) => {
    const tierIndex = TIER_ORDER.indexOf(tier)
    const minScore = TIER_THRESHOLDS[tierIndex]
    const maxScore = TIER_THRESHOLDS[tierIndex + 1]
    return ((score - minScore) / (maxScore - minScore)) * 100
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading credit profile...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const tierColors = getTierColors(profile.tier)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <CreditCard className="w-8 h-8 text-purple-400" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Credit Score
                </h1>
                <p className="text-xs text-gray-500">Agent Economy Dashboard</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <button
                onClick={loadProfile}
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
              <Link
                href="/llm"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors text-sm"
              >
                <Zap className="w-4 h-4" />
                LLM Marketplace
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
              >
                <Home className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Score Gauge Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className={`bg-gradient-to-br ${tierColors.bg} p-1 rounded-3xl shadow-2xl ${tierColors.glow}`}>
            <div className="bg-gray-900 rounded-3xl p-8">
              <div className="flex flex-col lg:flex-row items-center gap-8">
                {/* Gauge */}
                <div className="relative w-64 h-40">
                  {/* Gauge background */}
                  <svg className="w-full h-full" viewBox="0 0 200 120">
                    {/* Background arc */}
                    <path
                      d="M 20 100 A 80 80 0 0 1 180 100"
                      fill="none"
                      stroke="#374151"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                    {/* Colored arc based on score */}
                    <path
                      d="M 20 100 A 80 80 0 0 1 180 100"
                      fill="none"
                      stroke="url(#gaugeGradient)"
                      strokeWidth="20"
                      strokeLinecap="round"
                      strokeDasharray={`${((profile.score - 300) / 550) * 251.2} 251.2`}
                    />
                    <defs>
                      <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="25%" stopColor="#f59e0b" />
                        <stop offset="50%" stopColor="#22c55e" />
                        <stop offset="75%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                    {/* Score text */}
                    <text x="100" y="85" textAnchor="middle" className="fill-white text-4xl font-bold">
                      {profile.score}
                    </text>
                    <text x="100" y="105" textAnchor="middle" className="fill-gray-400 text-sm uppercase font-semibold">
                      {profile.tier}
                    </text>
                  </svg>
                </div>

                {/* Stats Cards */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-green-400">
                      {(profile.tierConfig.discount * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Discount</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-blue-400">
                      ${profile.tierConfig.creditLimit.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Credit Limit</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-purple-400">
                      ${profile.balances.availableCredit.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Available</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                    {profile.nextTier ? (
                      <>
                        <div className="text-3xl font-bold text-yellow-400">
                          +{profile.nextTier.pointsNeeded}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">To {profile.nextTier.name}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-purple-400">
                          <Star className="w-8 h-8 mx-auto" />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Top Tier!</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tier Progression Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800 mb-8"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            Tier Progression
          </h3>

          <div className="relative">
            {/* Progress bar background */}
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${tierColors.bg} transition-all duration-1000`}
                style={{ width: `${((profile.score - 300) / 550) * 100}%` }}
              />
            </div>

            {/* Tier markers */}
            <div className="flex justify-between mt-2">
              {TIER_ORDER.map((tier, idx) => {
                const isActive = tier === profile.tier
                const isPast = TIER_ORDER.indexOf(profile.tier) > idx
                const threshold = TIER_THRESHOLDS[idx]

                return (
                  <div key={tier} className="flex flex-col items-center">
                    <div
                      className={`w-4 h-4 rounded-full -mt-5 border-2 transition-all ${
                        isActive
                          ? `${TIER_COLORS[tier].border} bg-gray-900 ring-4 ring-${tier === 'exceptional' ? 'purple' : tier === 'excellent' ? 'blue' : tier === 'good' ? 'green' : tier === 'fair' ? 'yellow' : 'red'}-500/30`
                          : isPast
                            ? `${TIER_COLORS[tier].border} ${TIER_COLORS[tier].text.replace('text-', 'bg-')}`
                            : 'border-gray-600 bg-gray-800'
                      }`}
                    />
                    <span className={`text-xs mt-2 capitalize ${isActive ? TIER_COLORS[tier].text : 'text-gray-500'}`}>
                      {tier}
                    </span>
                    <span className="text-xs text-gray-600">{threshold}</span>
                  </div>
                )
              })}
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 rounded-full -mt-5 border-2 border-gray-600 bg-gray-800" />
                <span className="text-xs mt-2 text-gray-500">Max</span>
                <span className="text-xs text-gray-600">850</span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Score Factors */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
          >
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Score Factors
            </h3>

            <div className="space-y-4">
              {Object.entries(profile.factors).map(([key, factor]) => {
                const factorNames: Record<string, string> = {
                  paymentHistory: 'Payment History',
                  creditUtilization: 'Credit Utilization',
                  accountAge: 'Account Age',
                  creditMix: 'Credit Mix',
                  recentActivity: 'Recent Activity'
                }

                const ratingColors: Record<string, string> = {
                  excellent: 'text-green-400',
                  good: 'text-blue-400',
                  fair: 'text-yellow-400',
                  poor: 'text-red-400'
                }

                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-300">{factorNames[key]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">({(factor.weight * 100).toFixed(0)}%)</span>
                        <span className={`text-sm font-semibold ${ratingColors[factor.rating]}`}>
                          {factor.score}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${factor.score}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                        className={`h-full rounded-full ${
                          factor.rating === 'excellent' ? 'bg-green-500' :
                          factor.rating === 'good' ? 'bg-blue-500' :
                          factor.rating === 'fair' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{factor.description}</p>
                  </div>
                )
              })}
            </div>
          </motion.div>

          {/* Payment Simulator */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
          >
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-400" />
              Make a Payment
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Payment Amount (USDC)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setPaymentAmount(val)
                      if (val > 0) simulatePayment(val)
                    }}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                    min="0"
                    step="1"
                  />
                  <div className="flex gap-1">
                    {[5, 10, 25, 50].map(amt => (
                      <button
                        key={amt}
                        onClick={() => {
                          setPaymentAmount(amt)
                          simulatePayment(amt)
                        }}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                          paymentAmount === amt
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Simulation Result */}
              <AnimatePresence>
                {simulation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gray-800/50 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-gray-400">Score Impact</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-white">{simulation.currentScore}</span>
                        <ArrowUp className="w-5 h-5 text-green-400" />
                        <span className="text-2xl font-bold text-green-400">{simulation.projectedScore}</span>
                        <span className="text-sm text-green-400">(+{simulation.scoreDelta})</span>
                      </div>
                    </div>

                    {simulation.tierChange && (
                      <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-2 p-3 bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-lg border border-purple-500/30"
                      >
                        <Sparkles className="w-5 h-5 text-purple-400" />
                        <span className="text-purple-300">
                          Tier Upgrade! <span className="font-bold capitalize">{simulation.currentTier}</span>
                          {' '}<ChevronRight className="w-4 h-4 inline" />{' '}
                          <span className="font-bold capitalize">{simulation.tierChange}</span>
                          {' '}({(simulation.projectedDiscount * 100).toFixed(0)}% discount!)
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={makePayment}
                disabled={isPaying || paymentAmount <= 0}
                className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold transition-all ${
                  paymentSuccess
                    ? 'bg-green-600 text-white'
                    : isPaying || paymentAmount <= 0
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white shadow-lg shadow-green-500/20'
                }`}
              >
                {paymentSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Payment Complete!
                  </>
                ) : isPaying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-5 h-5" />
                    Pay ${paymentAmount} USDC
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Discount Calculator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-400" />
            Discount Calculator
          </h3>

          <div className="mb-4">
            <label className="text-sm text-gray-400 block mb-2">If you spend on LLM calls...</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="10"
                max="1000"
                value={spendAmount}
                onChange={(e) => setSpendAmount(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="bg-gray-800 px-4 py-2 rounded-lg min-w-[100px] text-center">
                <span className="text-xl font-bold text-white">${spendAmount}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {TIER_ORDER.map((tier) => {
              const tierConfig = {
                exceptional: { discount: 0.20, min: 800 },
                excellent: { discount: 0.15, min: 740 },
                good: { discount: 0.10, min: 670 },
                fair: { discount: 0, min: 580 },
                subprime: { discount: -0.10, min: 300 }
              }[tier]!

              const isCurrentTier = tier === profile.tier
              const savings = spendAmount * tierConfig.discount
              const finalCost = spendAmount - savings
              const colors = TIER_COLORS[tier]

              return (
                <div
                  key={tier}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    isCurrentTier
                      ? `${colors.border} bg-gray-800/50`
                      : 'border-gray-700 bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-semibold capitalize ${isCurrentTier ? colors.text : 'text-gray-400'}`}>
                      {tier}
                    </span>
                    {isCurrentTier && (
                      <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">You</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">
                    ${finalCost.toFixed(2)}
                  </div>
                  {tierConfig.discount > 0 ? (
                    <div className="flex items-center gap-1 text-green-400 text-sm">
                      <ArrowDown className="w-3 h-3" />
                      Save ${savings.toFixed(2)} ({(tierConfig.discount * 100).toFixed(0)}% off)
                    </div>
                  ) : tierConfig.discount < 0 ? (
                    <div className="flex items-center gap-1 text-red-400 text-sm">
                      <ArrowUp className="w-3 h-3" />
                      +${Math.abs(savings).toFixed(2)} premium
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm">Standard rate</div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* Account Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Account Statistics
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{profile.stats.totalTransactions}</div>
              <div className="text-xs text-gray-400 mt-1">Total Transactions</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{profile.stats.successfulPayments}</div>
              <div className="text-xs text-gray-400 mt-1">On-Time Payments</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{profile.stats.latePayments}</div>
              <div className="text-xs text-gray-400 mt-1">Late Payments</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{profile.stats.defaults}</div>
              <div className="text-xs text-gray-400 mt-1">Defaults</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{profile.stats.accountAgeDays}</div>
              <div className="text-xs text-gray-400 mt-1">Account Age (days)</div>
            </div>
            <div className="bg-gray-800/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">${profile.collateral.stakedAmount}</div>
              <div className="text-xs text-gray-400 mt-1">Staked Collateral</div>
            </div>
          </div>
        </motion.div>

        {/* Tips to Improve */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-8 bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-2xl p-6 border border-purple-500/30"
        >
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            How to Improve Your Score
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Clock, text: 'Make on-time payments consistently', color: 'text-green-400' },
              { icon: Target, text: 'Keep credit utilization below 30%', color: 'text-blue-400' },
              { icon: TrendingUp, text: 'Maintain regular platform activity', color: 'text-purple-400' },
              { icon: DollarSign, text: 'Diversify transaction types', color: 'text-yellow-400' },
              { icon: Lock, text: 'Add collateral to boost credit limit', color: 'text-pink-400' },
              { icon: Shield, text: 'Avoid late payments and defaults', color: 'text-cyan-400' },
            ].map((tip, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-3">
                <tip.icon className={`w-5 h-5 ${tip.color}`} />
                <span className="text-sm text-gray-300">{tip.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  )
}
