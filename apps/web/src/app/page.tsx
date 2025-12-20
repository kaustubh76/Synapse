'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Users, Zap, TrendingUp } from 'lucide-react'
import { Header } from '@/components/Header'
import { IntentForm } from '@/components/IntentForm'
import { BidVisualization } from '@/components/BidVisualization'
import { IntentResult } from '@/components/IntentResult'
import { StatusBadge } from '@/components/StatusBadge'
import { useSocket } from '@/hooks/useSocket'
import { createIntent, closeBidding, getProviderStats } from '@/lib/api'
import { formatUSD } from '@/lib/utils'

interface Intent {
  id: string
  type: string
  params: Record<string, any>
  maxBudget: number
  status: string
  assignedProvider?: string
  result?: any
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
  const [stats, setStats] = useState({ online: 0, total: 0 })
  const [recentIntents, setRecentIntents] = useState<Intent[]>([])

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

    // Winner selected
    subscribe('winner_selected', (message: any) => {
      console.log('Winner selected:', message)
      if (message.payload?.intent) {
        setCurrentIntent(prev => prev ? { ...prev, ...message.payload.intent } : null)
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
  }, [subscribe, currentIntent?.id])

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

    try {
      const response = await createIntent({
        type: data.type,
        category: data.type.split('.')[0] as any,
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

  const showResult = currentIntent?.status === 'COMPLETED' && currentIntent?.result

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
            <AnimatePresence mode="wait">
              {showResult ? (
                <IntentResult
                  key="result"
                  result={currentIntent.result}
                  intentType={currentIntent.type}
                  maxBudget={currentIntent.maxBudget}
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
