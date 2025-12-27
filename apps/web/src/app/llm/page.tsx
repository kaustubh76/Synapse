'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Zap, DollarSign, Clock, Award, TrendingUp, Sparkles, Shield,
  Wifi, Home, CreditCard, Coins, Wallet, RefreshCw, ExternalLink, Check,
  Copy, AlertCircle, Trophy, Users, Timer, CheckCircle2, XCircle, Loader2,
  Target, Scale
} from 'lucide-react'
import Link from 'next/link'
import {
  API_URL,
  RPC_URL,
  USDC_ADDRESS,
  EIGENCLOUD_WALLET,
  LLM_SELECTION_PRICE,
  LLM_DEFAULT_MAX_BUDGET,
} from '@/lib/config'

interface LLMBid {
  id: string
  modelId: string
  provider: string
  response: string
  tokenCount: {
    input: number
    output: number
    total: number
  }
  cost: number
  latency: number
  qualityScore: number
  calculatedScore: number
  rank: number
  status: string
  reputationScore: number
  teeAttested: boolean
  // Credit-aware pricing
  originalCost?: number
  discountedCost?: number
  discountApplied?: number
}

interface LLMIntent {
  id: string
  status: string
  biddingDeadline: number
  maxBudget: number
  selectedModelId?: string
  paymentTxHash?: string
  prompt?: string
}

interface IntentResult {
  intent: LLMIntent
  bids: LLMBid[]
  comparison: {
    cheapest: string
    fastest: string
    highestQuality: string
    bestValue: string
    recommended: string
  }
  pricing: {
    selectionCost: string
    currency: string
    network: string
  }
  userCanSelect?: boolean
  creditInfo?: {
    agentId: string
    creditScore: number
    tier: string
    discount: number
    availableCredit: number
    savingsApplied: number
  }
}

interface WalletData {
  id: string
  address: string
  chain: string
  type: string
  linkedUser: string
}

interface WalletBalance {
  usdc: string
  eth: string
}

interface CreditProfile {
  creditScore: number
  creditTier: string
  unsecuredCreditLimit: number
  availableCredit: number
  tierDiscount: number
}

type ViewMode = 'input' | 'bidding' | 'selection'

export default function LLMPage() {
  const [prompt, setPrompt] = useState('')
  const [modelTier, setModelTier] = useState<'premium' | 'standard' | 'budget' | 'all'>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('input')

  // Intent-based state
  const [currentIntent, setCurrentIntent] = useState<IntentResult | null>(null)
  const [selectedBid, setSelectedBid] = useState<LLMBid | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionComplete, setSelectionComplete] = useState(false)
  const [lastPayment, setLastPayment] = useState<{txHash: string; amount: string} | null>(null)

  // Credit profile
  const [agentId, setAgentId] = useState<string>('')
  const [creditProfile, setCreditProfile] = useState<CreditProfile | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Wallet state
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null)
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch wallet balance from blockchain
  const fetchWalletBalance = useCallback(async (address: string) => {
    try {
      // Fetch ETH balance
      const ethResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      })
      const ethData = await ethResponse.json()
      const ethBalance = ethData.result ? BigInt(ethData.result) : BigInt(0)
      const ethFormatted = (Number(ethBalance) / 1e18).toFixed(4)

      // Fetch USDC balance
      const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase()
      const usdcResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data: balanceOfData }, 'latest'],
          id: 2
        })
      })
      const usdcData = await usdcResponse.json()
      const usdcBalance = usdcData.result ? BigInt(usdcData.result) : BigInt(0)
      const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(2)

      setWalletBalance({ usdc: usdcFormatted, eth: ethFormatted })
    } catch (err) {
      console.error('Error fetching balances:', err)
    }
  }, [])

  // Connect wallet - use hardcoded EigenCloud wallet
  const connectWallet = useCallback(async () => {
    setIsConnectingWallet(true)
    setWalletError(null)

    try {
      setWalletData(EIGENCLOUD_WALLET)
      setAgentId(EIGENCLOUD_WALLET.address)
      await fetchWalletBalance(EIGENCLOUD_WALLET.address)
      console.log('[LLM] EigenCloud wallet connected:', EIGENCLOUD_WALLET.address)
    } catch (error) {
      console.error('[LLM] Wallet connection error:', error)
      setWalletError(error instanceof Error ? error.message : 'Connection failed')
    } finally {
      setIsConnectingWallet(false)
    }
  }, [fetchWalletBalance])

  // Copy address to clipboard
  const copyAddress = () => {
    if (walletData?.address) {
      navigator.clipboard.writeText(walletData.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Initialize on client only - auto-connect EigenCloud wallet
  useEffect(() => {
    setIsClient(true)
    // Auto-connect with EigenCloud wallet on load
    setWalletData(EIGENCLOUD_WALLET)
    setAgentId(EIGENCLOUD_WALLET.address)
    fetchWalletBalance(EIGENCLOUD_WALLET.address)
    console.log('[LLM] Auto-connected EigenCloud wallet:', EIGENCLOUD_WALLET.address)
  }, [fetchWalletBalance])

  // Load credit profile
  const loadCreditProfile = useCallback(async (id: string) => {
    if (!id) return

    try {
      const response = await fetch(`${API_URL}/api/llm/credit/${id}`)
      const data = await response.json()
      if (data.success) {
        setCreditProfile(data.data)
      } else {
        // Create new profile
        const createResponse = await fetch(`${API_URL}/api/llm/credit/${id}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: walletData?.address || '0xDemo' + Math.random().toString(36).substring(7) })
        })
        const createData = await createResponse.json()
        if (createData.success) {
          setCreditProfile(createData.data)
        }
      }
    } catch (error) {
      console.error('Error loading credit profile:', error)
    }
  }, [walletData?.address])

  // Load credit profile when agentId is set
  useEffect(() => {
    if (agentId && walletData) {
      loadCreditProfile(agentId)
    }
  }, [agentId, walletData, loadCreditProfile])

  // Process USDC payment for selection
  const processPayment = async (amount: number): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    if (!walletData?.address) {
      return { success: false, error: 'No wallet connected' }
    }

    try {
      const balance = parseFloat(walletBalance?.usdc || '0')

      if (balance < amount) {
        return { success: false, error: `Insufficient balance: ${balance} USDC < ${amount} USDC` }
      }

      console.log(`[LLM] Processing payment: ${amount} USDC from ${walletData.address}`)

      // Simulate transaction processing delay
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Generate a mock transaction hash
      const mockTxHash = '0x' + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')

      console.log(`[LLM] Payment simulated - TX: ${mockTxHash}`)

      // Update balance display
      if (walletBalance) {
        const newBalance = (balance - amount).toFixed(2)
        setWalletBalance({ ...walletBalance, usdc: newBalance })
      }

      return { success: true, txHash: mockTxHash }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Payment failed' }
    }
  }

  // Create intent and start bidding
  const handleCreateIntent = async () => {
    if (!prompt.trim() || !walletData?.address) return

    setIsLoading(true)
    setViewMode('bidding')

    try {
      const response = await fetch(`${API_URL}/api/llm/intent/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelTier,
          maxTokens: 500,
          temperature: 0.7,
          maxBudget: LLM_DEFAULT_MAX_BUDGET,
          clientAddress: walletData.address,
          agentId: agentId || walletData.address, // Pass agentId for credit scoring
          biddingDuration: 30000,
        })
      })

      const data = await response.json()

      if (data.success) {
        setCurrentIntent(data.data)
        setViewMode('selection')
        console.log('[LLM] Intent created with', data.data.bids.length, 'bids')
      } else {
        console.error('Intent creation failed:', data.error)
        setViewMode('input')
      }
    } catch (error) {
      console.error('Error creating intent:', error)
      setViewMode('input')
    } finally {
      setIsLoading(false)
    }
  }

  // Select a model and process payment
  const handleSelectModel = async (bid: LLMBid) => {
    if (!currentIntent || !walletData?.address) return

    setSelectedBid(bid)
    setIsSelecting(true)

    try {
      // Process payment first
      const paymentResult = await processPayment(LLM_SELECTION_PRICE)

      if (!paymentResult.success) {
        alert(`Payment failed: ${paymentResult.error}`)
        setIsSelecting(false)
        return
      }

      // Record selection with payment
      const response = await fetch(`${API_URL}/api/llm/intent/${currentIntent.intent.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: bid.modelId,
          paymentTxHash: paymentResult.txHash,
          clientAddress: walletData.address,
        })
      })

      const data = await response.json()

      if (data.success) {
        setLastPayment({ txHash: paymentResult.txHash!, amount: LLM_SELECTION_PRICE.toString() })
        setSelectionComplete(true)
        console.log('[LLM] Model selected:', bid.modelId)
      } else {
        console.error('Selection failed:', data.error)
      }
    } catch (error) {
      console.error('Error selecting model:', error)
    } finally {
      setIsSelecting(false)
    }
  }

  // Reset for new query
  const handleNewQuery = () => {
    setPrompt('')
    setCurrentIntent(null)
    setSelectedBid(null)
    setSelectionComplete(false)
    setLastPayment(null)
    setViewMode('input')
  }

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      exceptional: 'text-purple-400',
      excellent: 'text-blue-400',
      good: 'text-green-400',
      fair: 'text-yellow-400',
      subprime: 'text-red-400',
    }
    return colors[tier] || 'text-gray-400'
  }

  const getBadgeForModel = (modelId: string, comparison: IntentResult['comparison']) => {
    const badges = []
    if (modelId === comparison.recommended) badges.push({ label: 'Recommended', color: 'bg-purple-500/20 text-purple-400' })
    if (modelId === comparison.cheapest) badges.push({ label: 'Cheapest', color: 'bg-green-500/20 text-green-400' })
    if (modelId === comparison.fastest) badges.push({ label: 'Fastest', color: 'bg-blue-500/20 text-blue-400' })
    if (modelId === comparison.highestQuality) badges.push({ label: 'Best Quality', color: 'bg-yellow-500/20 text-yellow-400' })
    if (modelId === comparison.bestValue) badges.push({ label: 'Best Value', color: 'bg-pink-500/20 text-pink-400' })
    return badges
  }

  // Show loading state until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Brain className="w-8 h-8 text-purple-400" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">SYNAPSE</h1>
                <p className="text-xs text-gray-500">Intent-Based LLM Marketplace</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              {/* Wallet Connection */}
              {walletData ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30">
                    <Shield className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-purple-300 hidden sm:inline">EigenCloud</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-sm font-mono text-white">
                      {walletData.address.slice(0, 6)}...{walletData.address.slice(-4)}
                    </span>
                    <button
                      onClick={copyAddress}
                      className="p-1 hover:bg-purple-500/20 rounded transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {walletBalance && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-500/30">
                      <DollarSign className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-bold text-green-400">{walletBalance.usdc} USDC</span>
                    </div>
                  )}
                  <button
                    onClick={() => fetchWalletBalance(walletData.address)}
                    className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                    title="Refresh balance"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-sm text-gray-400">Loading EigenCloud Wallet...</span>
                </div>
              )}
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-green-500/20 text-green-400">
                <Wifi className="w-4 h-4" />
                <span className="hidden sm:inline">Live</span>
              </div>
            </div>
          </div>
          {walletError && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {walletError}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Target className="w-10 h-10 text-purple-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              Intent-Based LLM Marketplace
            </h1>
          </div>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            LLMs compete for your prompt. View all responses, compare scores, and pay only when you select your preferred answer.
          </p>
        </motion.div>

        {/* Credit Profile */}
        {creditProfile && walletData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-purple-900/30 to-gray-900/50 rounded-2xl p-6 border border-purple-500/30 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Your Credit Profile</h3>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Credit Score</div>
                <div className={`text-2xl font-bold ${getTierColor(creditProfile.creditTier)}`}>
                  {creditProfile.creditScore}
                </div>
                <div className="text-xs text-gray-500 capitalize">{creditProfile.creditTier}</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Available</div>
                <div className="text-xl font-bold text-green-400">
                  ${creditProfile.availableCredit?.toFixed(2) ?? '0.00'}
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Discount</div>
                <div className="text-xl font-bold text-purple-400">
                  {((creditProfile.tierDiscount ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Selection Cost</div>
                <div className="text-xl font-bold text-blue-400">
                  ${LLM_SELECTION_PRICE} USDC
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* INPUT VIEW - Enter prompt */}
          {viewMode === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
            >
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-white">
                <Scale className="w-5 h-5 text-purple-400" />
                Create Intent - LLMs Compete for Your Prompt
              </h2>

              <div className="space-y-4">
                {/* EigenCloud Wallet Info */}
                {walletData && (
                  <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-purple-400" />
                    <div>
                      <span className="text-purple-400 font-medium">EigenCloud Wallet Connected</span>
                      <span className="text-gray-400 ml-2 font-mono text-sm">
                        {walletData.address.slice(0, 6)}...{walletData.address.slice(-4)}
                      </span>
                      {walletBalance && (
                        <span className="text-green-400 ml-3 font-bold">${walletBalance.usdc} USDC</span>
                      )}
                    </div>
                  </div>
                )}
                {!walletData && (
                  <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                    <span className="text-gray-400">Loading EigenCloud wallet...</span>
                  </div>
                )}

                {/* Model Tier Selection */}
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Model Tier</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['premium', 'standard', 'budget', 'all'] as const).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setModelTier(tier)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          modelTier === tier
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Input */}
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Your Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your prompt... LLMs will compete to give you the best answer"
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all min-h-[120px] resize-none"
                  />
                </div>

                {/* How it works */}
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
                  <h4 className="text-purple-400 font-semibold mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    How Intent-Based Selection Works
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
                    <div className="flex items-start gap-2">
                      <Users className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-white">1. LLMs Compete</div>
                        <div className="text-gray-400">Multiple models generate responses as competing bids</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Trophy className="w-5 h-5 text-yellow-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-white">2. You Review</div>
                        <div className="text-gray-400">Compare responses, quality scores, and costs</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Coins className="w-5 h-5 text-green-400 mt-0.5" />
                      <div>
                        <div className="font-medium text-white">3. Pay on Selection</div>
                        <div className="text-gray-400">x402 payment only when you choose your preferred answer</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleCreateIntent}
                  disabled={isLoading || !prompt.trim() || !walletData}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-lg transition-all ${
                    isLoading || !prompt.trim() || !walletData
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white shadow-lg shadow-purple-500/20'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      LLMs are competing for your prompt...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Start Competition (View All Responses)
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* BIDDING VIEW - Loading state */}
          {viewMode === 'bidding' && (
            <motion.div
              key="bidding"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-800 text-center"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-purple-500/30 rounded-full animate-spin border-t-purple-500" />
                  <Brain className="w-10 h-10 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <h3 className="text-2xl font-bold text-white">LLMs are Competing</h3>
                <p className="text-gray-400 max-w-md">
                  Multiple AI models are generating responses to your prompt.
                  They will compete based on quality, speed, and cost.
                </p>
                <div className="flex items-center gap-2 text-purple-400">
                  <Timer className="w-5 h-5" />
                  <span>Collecting bids...</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* SELECTION VIEW - Choose from competing bids */}
          {viewMode === 'selection' && currentIntent && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Credit Savings Banner */}
              {currentIntent.creditInfo && currentIntent.creditInfo.discount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-green-400 font-semibold flex items-center gap-2">
                        Credit Tier Discount Applied!
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${getTierColor(currentIntent.creditInfo.tier)} bg-gray-800`}>
                          {currentIntent.creditInfo.tier}
                        </span>
                      </div>
                      <div className="text-gray-400 text-sm">
                        Score: {currentIntent.creditInfo.creditScore} | {(currentIntent.creditInfo.discount * 100).toFixed(0)}% off all model costs
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-400">
                      ${currentIntent.creditInfo.savingsApplied.toFixed(6)}
                    </div>
                    <div className="text-xs text-gray-400">Total Savings</div>
                  </div>
                </motion.div>
              )}

              {/* Intent Info */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      {currentIntent.bids.length} Models Competed
                    </h3>
                    <p className="text-gray-400 text-sm mt-1">
                      Select your preferred response to complete with x402 payment
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium">
                      ${LLM_SELECTION_PRICE} USDC to Select
                    </div>
                    <button
                      onClick={handleNewQuery}
                      className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-700 transition-colors"
                    >
                      New Query
                    </button>
                  </div>
                </div>

                {/* Your Prompt */}
                <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                  <div className="text-xs text-gray-500 mb-1">Your Prompt</div>
                  <div className="text-white">{prompt}</div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
                    <DollarSign className="w-5 h-5 text-green-400 mx-auto mb-1" />
                    <div className="text-xs text-gray-400">Cheapest</div>
                    <div className="text-sm font-bold text-green-400 truncate">{currentIntent.comparison.cheapest}</div>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
                    <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <div className="text-xs text-gray-400">Fastest</div>
                    <div className="text-sm font-bold text-blue-400 truncate">{currentIntent.comparison.fastest}</div>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
                    <Award className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <div className="text-xs text-gray-400">Best Quality</div>
                    <div className="text-sm font-bold text-yellow-400 truncate">{currentIntent.comparison.highestQuality}</div>
                  </div>
                  <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-center">
                    <Sparkles className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                    <div className="text-xs text-gray-400">Recommended</div>
                    <div className="text-sm font-bold text-purple-400 truncate">{currentIntent.comparison.recommended}</div>
                  </div>
                </div>
              </div>

              {/* Selection Complete State */}
              {selectionComplete && selectedBid && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                    <div>
                      <h3 className="text-xl font-bold text-green-400">Selection Complete!</h3>
                      <p className="text-gray-400">You selected {selectedBid.modelId}</p>
                    </div>
                  </div>
                  {lastPayment && (
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Payment</span>
                        <span className="text-green-400 font-mono">${lastPayment.amount} USDC</span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-gray-400">Transaction</span>
                        <a
                          href={`https://sepolia.basescan.org/tx/${lastPayment.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-mono text-sm"
                        >
                          {lastPayment.txHash.slice(0, 10)}...{lastPayment.txHash.slice(-8)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Competing Bids */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  Competing Responses (Select One)
                </h3>

                {currentIntent.bids.map((bid, idx) => {
                  const badges = getBadgeForModel(bid.modelId, currentIntent.comparison)
                  const isSelected = selectedBid?.modelId === bid.modelId
                  const isWinner = selectionComplete && isSelected

                  return (
                    <motion.div
                      key={bid.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`bg-gray-900/50 rounded-2xl p-6 border transition-all ${
                        isWinner
                          ? 'border-green-500/50 shadow-lg shadow-green-500/20'
                          : isSelected
                            ? 'border-purple-500/50 shadow-lg shadow-purple-500/20'
                            : bid.rank === 1
                              ? 'border-purple-500/30'
                              : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            bid.rank === 1 ? 'bg-purple-500/20' : 'bg-gray-800'
                          }`}>
                            {bid.rank === 1 ? (
                              <Trophy className="w-5 h-5 text-purple-400" />
                            ) : (
                              <span className="text-gray-400 font-bold">#{bid.rank}</span>
                            )}
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                              {bid.modelId}
                              {isWinner && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                            </h4>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              {bid.provider}
                              {bid.teeAttested && (
                                <span className="flex items-center gap-1 text-purple-400">
                                  <Shield className="w-3 h-3" /> TEE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {badges.map((badge, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs ${badge.color}`}>
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-gray-800/50 rounded-lg">
                        <div>
                          <div className="text-xs text-gray-400">Score</div>
                          <div className="text-lg font-bold text-purple-400">{bid.calculatedScore}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Cost</div>
                          {bid.discountApplied && bid.discountApplied > 0 ? (
                            <div>
                              <div className="text-lg font-bold text-green-400">
                                ${(bid.discountedCost || bid.cost).toFixed(6)}
                              </div>
                              <div className="text-xs text-gray-500 line-through">
                                ${(bid.originalCost || bid.cost).toFixed(6)}
                              </div>
                              <div className="text-xs text-green-500">
                                {((bid.discountApplied || 0) * 100).toFixed(0)}% off
                              </div>
                            </div>
                          ) : (
                            <div className="text-lg font-bold text-green-400">${bid.cost.toFixed(6)}</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Latency</div>
                          <div className="text-lg font-bold text-blue-400">{bid.latency.toFixed(0)}ms</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Quality</div>
                          <div className="text-lg font-bold text-yellow-400">{bid.qualityScore.toFixed(1)}/10</div>
                        </div>
                      </div>

                      {/* Response */}
                      <div className="bg-gray-800/30 rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                        <div className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                          {bid.response}
                        </div>
                      </div>

                      {/* Select Button */}
                      {!selectionComplete && (
                        <button
                          onClick={() => handleSelectModel(bid)}
                          disabled={isSelecting}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                            isSelecting && isSelected
                              ? 'bg-purple-600/50 text-white'
                              : isSelecting
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : bid.rank === 1
                                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white shadow-lg shadow-purple-500/20'
                                  : 'bg-gray-800 text-white hover:bg-gray-700'
                          }`}
                        >
                          {isSelecting && isSelected ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Processing x402 Payment...
                            </>
                          ) : (
                            <>
                              <Coins className="w-4 h-4" />
                              Select & Pay ${LLM_SELECTION_PRICE} USDC
                            </>
                          )}
                        </button>
                      )}

                      {isWinner && (
                        <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500/20 text-green-400 font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          Selected - Payment Complete
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {viewMode === 'input' && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8 mt-8"
          >
            <Brain className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">
              Enter a prompt above to start the LLM competition
            </p>
          </motion.div>
        )}
      </main>
    </div>
  )
}
