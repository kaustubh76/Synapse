'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Users, Zap, TrendingUp, Wallet, Shield, Cpu, Brain, CreditCard, Layers, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { IntentForm } from '@/components/IntentForm'
import { BidVisualization } from '@/components/BidVisualization'
import { IntentResult } from '@/components/IntentResult'
import { StatusBadge } from '@/components/StatusBadge'
import { useSocket } from '@/hooks/useSocket'
import { createIntent, closeBidding, getProviderStats } from '@/lib/api'
import { formatUSD } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Map intent type prefixes to valid IntentCategory enum values
// Valid categories: 'data', 'compute', 'ai', 'search', 'transaction'
function inferCategory(type: string): 'data' | 'compute' | 'ai' | 'search' | 'transaction' {
  const prefix = type.split('.')[0].toLowerCase()
  const categoryMap: Record<string, 'data' | 'compute' | 'ai' | 'search' | 'transaction'> = {
    weather: 'data',
    crypto: 'data',
    news: 'data',
    price: 'data',
    stock: 'data',
    ai: 'ai',
    llm: 'ai',
    inference: 'ai',
    compute: 'compute',
    process: 'compute',
    search: 'search',
    query: 'search',
    transaction: 'transaction',
    transfer: 'transaction',
    payment: 'transaction',
  }
  return categoryMap[prefix] || 'data'
}

interface Intent {
  id: string
  type: string
  params: Record<string, any>
  maxBudget: number
  status: string
  assignedProvider?: string
  result?: any
}

interface EigenComputeResult {
  teeType: string
  enclaveId: string
  jobId: string
  inputHash: string
  outputHash: string
  verified: boolean
  measurements: {
    mrEnclave: string
    mrSigner: string
  }
}

interface PaymentResult {
  status: string
  amount: number
  currency: string
  txHash: string | null
  blockNumber: number | null
  explorerUrl: string | null
}

interface EnhancedResult {
  data: any
  providerId: string
  executionTime: number
  settledAmount: number
  settlementTx?: string
  eigencompute?: EigenComputeResult
  payment?: PaymentResult
  aiEnhanced?: boolean
}

interface Bid {
  id: string
  providerAddress: string
  providerId: string
  bidAmount: number
  estimatedTime: number
  confidence: number
  reputationScore: number
  teeAttested: boolean
  calculatedScore: number
  rank: number
  status: string
}

export default function Home() {
  const { isConnected, subscribe, subscribeToIntent } = useSocket()
  const [currentIntent, setCurrentIntent] = useState<Intent | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [stats, setStats] = useState({ online: 0, total: 0 })
  const [recentIntents, setRecentIntents] = useState<Intent[]>([])
  const [enhancedResult, setEnhancedResult] = useState<EnhancedResult | null>(null)

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [isConnectingWallet, setIsConnectingWallet] = useState(false)

  // Connect wallet via Crossmint
  const connectWallet = useCallback(async () => {
    setIsConnectingWallet(true)
    try {
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedUser: `synapse-user-${Date.now()}`,
          chain: 'base-sepolia',
        }),
      })
      const data = await response.json()
      if (data.success && data.wallet?.address) {
        setWalletAddress(data.wallet.address)
        console.log('[Wallet] Connected:', data.wallet.address)
      }
    } catch (error) {
      console.error('[Wallet] Connection error:', error)
      // Fallback to demo address
      setWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f3Ed7d')
    } finally {
      setIsConnectingWallet(false)
    }
  }, [])

  // Execute intent with EigenCloud after winner is selected
  const executeWithEigenCloud = useCallback(async (intent: Intent, winnerId: string) => {
    setIsExecuting(true)
    try {
      console.log('[EigenCloud] Executing intent:', intent.id)
      const response = await fetch('/api/intents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId: intent.id,
          intentType: intent.type,
          params: intent.params,
          maxBudget: intent.maxBudget,
          providerId: winnerId,
          payerAddress: walletAddress,
        }),
      })

      const data = await response.json()
      if (data.success) {
        console.log('[EigenCloud] Execution complete:', data)
        setEnhancedResult({
          data: data.result.data,
          providerId: data.result.providerId,
          executionTime: data.result.executionTime,
          settledAmount: data.result.settledAmount,
          settlementTx: data.result.settlementTx,
          eigencompute: data.eigencompute,
          payment: data.payment,
          aiEnhanced: data.execution?.aiEnhanced,
        })

        // Update current intent with result
        setCurrentIntent(prev => prev ? {
          ...prev,
          status: 'COMPLETED',
          result: {
            data: data.result.data,
            providerId: data.result.providerId,
            executionTime: data.result.executionTime,
            settledAmount: data.result.settledAmount,
            settlementTx: data.payment?.txHash,
          }
        } : null)
      }
    } catch (error) {
      console.error('[EigenCloud] Execution error:', error)
    } finally {
      setIsExecuting(false)
    }
  }, [walletAddress])

  // Load provider stats
  useEffect(() => {
    getProviderStats().then(res => {
      if (res.success) {
        setStats({ online: res.data.online, total: res.data.total })
      }
    }).catch(console.error)
  }, [])

  // Subscribe to WebSocket events
  useEffect(() => {
    // New bid received
    subscribe('bid_received', (message: any) => {
      console.log('Bid received:', message)
      if (message.payload?.allBids) {
        setBids(message.payload.allBids)
      } else if (message.payload?.bid) {
        setBids(prev => {
          const exists = prev.some(b => b.id === message.payload.bid.id)
          if (exists) return prev
          return [...prev, message.payload.bid]
        })
      }
    })

    // Winner selected - trigger EigenCloud execution
    subscribe('winner_selected', (message: any) => {
      console.log('Winner selected:', message)
      if (message.payload?.intent) {
        const updatedIntent = { ...message.payload.intent }
        setCurrentIntent(prev => prev ? { ...prev, ...updatedIntent } : null)

        // Trigger EigenCloud execution for the winning provider
        if (message.payload?.winner) {
          const winnerId = message.payload.winner.providerAddress || message.payload.winner.providerId
          executeWithEigenCloud(updatedIntent, winnerId)
        }
      }
      if (message.payload?.allBids) {
        setBids(message.payload.allBids)
      }
    })

    // Intent completed
    subscribe('intent_completed', (message: any) => {
      console.log('Intent completed:', message)
      if (message.payload?.intent) {
        setCurrentIntent(message.payload.intent)
        // Add to recent intents
        setRecentIntents(prev => [message.payload.intent, ...prev].slice(0, 5))
      }
    })

    // Intent updated
    subscribe('intent_created', (message: any) => {
      console.log('Intent update:', message)
      if (message.payload?.intent && message.payload.intent.id === currentIntent?.id) {
        setCurrentIntent(message.payload.intent)
      }
      if (message.payload?.bids) {
        setBids(message.payload.bids)
      }
    })

    // Payment settled
    subscribe('payment_settled', (message: any) => {
      console.log('Payment settled:', message)
      if (message.payload?.intent) {
        setCurrentIntent(message.payload.intent)
      }
    })
  }, [subscribe, currentIntent?.id, executeWithEigenCloud])

  // Handle intent submission
  const handleSubmitIntent = useCallback(async (data: {
    type: string
    params: Record<string, string>
    maxBudget: number
    biddingDuration: number
  }) => {
    setIsLoading(true)
    setBids([])
    setCurrentIntent(null)
    setEnhancedResult(null)

    try {
      const response = await createIntent({
        type: data.type,
        category: inferCategory(data.type),
        params: data.params,
        maxBudget: data.maxBudget,
        biddingDuration: data.biddingDuration,
      })

      if (response.success) {
        const intent = response.data
        setCurrentIntent(intent)
        subscribeToIntent(intent.id)

        // Auto-close bidding after duration (for demo)
        setTimeout(async () => {
          const closeResponse = await closeBidding(intent.id)
          if (closeResponse.success) {
            setCurrentIntent(closeResponse.data)
          }
        }, data.biddingDuration + 500)
      } else {
        console.error('Failed to create intent:', response.error)
      }
    } catch (error) {
      console.error('Error creating intent:', error)
    } finally {
      setIsLoading(false)
    }
  }, [subscribeToIntent])

  const showResult = (currentIntent?.status === 'COMPLETED' && currentIntent?.result) || enhancedResult
  const displayResult = enhancedResult || currentIntent?.result

  return (
    <div className="min-h-screen">
      <Header isConnected={isConnected} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">AI Agents Compete</span>
            <br />
            <span className="text-white">To Serve You</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Broadcast your intent, watch agents bid in real-time, and pay only the winner.
            Powered by x402 micropayments.
          </p>
        </motion.div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-synapse-400" />
            <div>
              <div className="text-2xl font-bold text-white">{stats.online}</div>
              <div className="text-xs text-gray-400">Providers Online</div>
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 flex items-center gap-3">
            <Activity className="w-8 h-8 text-neural-400" />
            <div>
              <div className="text-2xl font-bold text-white">{recentIntents.length}</div>
              <div className="text-xs text-gray-400">Intents This Session</div>
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-2xl font-bold text-white">~1.5s</div>
              <div className="text-xs text-gray-400">Avg Response Time</div>
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-400" />
            <div>
              <div className="text-2xl font-bold text-white">~40%</div>
              <div className="text-xs text-gray-400">Avg Savings</div>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Intent Form */}
          <div className="space-y-6">
            <IntentForm onSubmit={handleSubmitIntent} isLoading={isLoading} />

            {/* Current Intent Status */}
            {currentIntent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900/50 rounded-xl p-4 border border-gray-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Current Intent</span>
                  <StatusBadge status={currentIntent.status} />
                </div>
                <div className="font-mono text-sm text-gray-300 truncate">
                  {currentIntent.id}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  {currentIntent.type}: {JSON.stringify(currentIntent.params)}
                </div>
                <div className="text-sm text-synapse-400 mt-1">
                  Budget: {formatUSD(currentIntent.maxBudget)}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column - Bids & Result */}
          <div className="space-y-6">
            {/* Executing State */}
            {isExecuting && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-purple-900/30 to-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Cpu className="w-6 h-6 text-purple-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-400">Executing with EigenCloud</h3>
                    <p className="text-sm text-gray-400">Running AI inference in secure TEE enclave...</p>
                  </div>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-synapse-500"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3, ease: 'easeInOut' }}
                  />
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>TEE Verified</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    <span>deTERMinal AI</span>
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {showResult && displayResult ? (
                <IntentResult
                  key="result"
                  result={displayResult}
                  intentType={currentIntent?.type || ''}
                  maxBudget={currentIntent?.maxBudget || 0}
                  eigencompute={enhancedResult?.eigencompute}
                  payment={enhancedResult?.payment}
                />
              ) : (
                <BidVisualization
                  key="bids"
                  bids={bids}
                  maxBudget={currentIntent?.maxBudget || 0.02}
                  winnerId={currentIntent?.assignedProvider}
                  isActive={currentIntent?.status === 'OPEN'}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Feature Showcase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12"
        >
          <h2 className="text-xl font-semibold mb-6 text-gray-300 text-center">Explore Synapse Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {/* LLM Marketplace */}
            <Link href="/llm" className="group">
              <div className="bg-gradient-to-br from-purple-900/30 to-gray-900/50 rounded-2xl p-6 border border-purple-500/30 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                    LLM Marketplace
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  LLMs compete for your prompt. Compare responses, quality scores, and costs - pay only when you select.
                </p>
                <div className="flex items-center text-purple-400 text-sm font-medium">
                  Try it <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Credit Score */}
            <Link href="/credit" className="group">
              <div className="bg-gradient-to-br from-green-900/30 to-gray-900/50 rounded-2xl p-6 border border-green-500/30 hover:border-green-500/50 transition-all hover:shadow-lg hover:shadow-green-500/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-green-400 transition-colors">
                    Credit Score
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Build your agent credit score. Unlock discounts up to 20% off and higher credit limits.
                </p>
                <div className="flex items-center text-green-400 text-sm font-medium">
                  View Dashboard <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* MCP Tools */}
            <Link href="/mcp" className="group">
              <div className="bg-gradient-to-br from-blue-900/30 to-gray-900/50 rounded-2xl p-6 border border-blue-500/30 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                    MCP Tools
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Execute real tools (weather, crypto, news). Decompose complex intents into sub-tasks.
                </p>
                <div className="flex items-center text-blue-400 text-sm font-medium">
                  Explore <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>
        </motion.div>

        {/* Recent Intents */}
        {recentIntents.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Recent Intents</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {recentIntents.map((intent) => (
                <div
                  key={intent.id}
                  className="bg-gray-900/50 rounded-xl p-4 border border-gray-800"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{intent.type}</span>
                    <StatusBadge status={intent.status} />
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {JSON.stringify(intent.params)}
                  </div>
                  {intent.result && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-400">Cost: </span>
                      <span className="text-green-400">
                        {formatUSD(intent.result.settledAmount)}
                      </span>
                      <span className="text-gray-500 text-xs ml-2">
                        ({((intent.maxBudget - intent.result.settledAmount) / intent.maxBudget * 100).toFixed(0)}% saved)
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-800 text-center">
          <p className="text-gray-500 text-sm">
            Built for{' '}
            <a
              href="https://www.x402hackathon.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-synapse-400 hover:text-synapse-300 transition-colors"
            >
              x402 Hackathon
            </a>
            {' '}| Powered by Crossmint, Eigencloud, and thirdweb
          </p>
          <p className="text-gray-600 text-xs mt-2">
            Kaushtubh | LNMIIT | December 2025
          </p>
        </footer>
      </main>
    </div>
  )
}
