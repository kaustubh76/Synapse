'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Users, Activity, DollarSign, Clock, TrendingUp, Star,
  ArrowLeft, RefreshCw, Wifi, WifiOff, Shield, Zap, BarChart3
} from 'lucide-react'
import { cn, formatUSD, truncateAddress } from '@/lib/utils'
import { getProviders, getProviderStats } from '@/lib/api'
import { useSocket } from '@/hooks/useSocket'
import { LiveActivityFeed } from '@/components/LiveActivityFeed'
import { NetworkStats } from '@/components/NetworkStats'

interface Provider {
  id: string
  name: string
  address: string
  description: string
  capabilities: string[]
  reputationScore: number
  totalJobs: number
  successfulJobs: number
  totalEarnings: number
  avgResponseTime: number
  status: string
  teeAttested: boolean
}

interface Stats {
  total: number
  online: number
  offline: number
  avgReputation: number
  totalEarnings: number
  capabilityCounts: Record<string, number>
}

interface ActivityEvent {
  id: string
  type: 'intent_created' | 'bid_received' | 'winner_selected' | 'intent_completed' | 'intent_failed' | 'payment_settled' | 'failover_triggered' | 'provider_connected' | 'provider_disconnected'
  timestamp: number
  data: {
    intentId?: string
    intentType?: string
    providerId?: string
    providerName?: string
    bidAmount?: number
    amount?: number
    score?: number
    reason?: string
  }
}

export default function Dashboard() {
  const { isConnected, subscribe, emit } = useSocket()
  const [providers, setProviders] = useState<Provider[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCapability, setSelectedCapability] = useState<string | null>(null)
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([])
  const [networkStats, setNetworkStats] = useState({
    providersOnline: 0,
    providersTotal: 0,
    intentsPending: 0,
    intentsCompleted: 0,
    intentsFailed: 0,
    totalVolume: 0,
    avgResponseTime: 500,
    avgSavings: 35,
    successRate: 95,
  })

  const addActivityEvent = useCallback((event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    const newEvent: ActivityEvent = {
      ...event,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }
    setActivityEvents((prev) => [newEvent, ...prev].slice(0, 50))
  }, [])

  // Subscribe to real-time events
  useEffect(() => {
    // Intent created
    subscribe('intent_created', (message: any) => {
      addActivityEvent({
        type: 'intent_created',
        data: {
          intentId: message.payload?.intent?.id,
          intentType: message.payload?.intent?.type,
        },
      })
      setNetworkStats((prev) => ({ ...prev, intentsPending: prev.intentsPending + 1 }))
    })

    // Bid received
    subscribe('bid_received', (message: any) => {
      const bid = message.payload?.bid
      if (bid) {
        addActivityEvent({
          type: 'bid_received',
          data: {
            intentId: bid.intentId,
            providerId: bid.providerAddress,
            providerName: bid.providerId,
            bidAmount: bid.bidAmount,
            score: bid.calculatedScore,
          },
        })
      }
    })

    // Winner selected
    subscribe('winner_selected', (message: any) => {
      const winner = message.payload?.winner
      if (winner) {
        addActivityEvent({
          type: 'winner_selected',
          data: {
            intentId: message.payload?.intent?.id,
            providerId: winner.providerAddress,
            providerName: winner.providerId,
          },
        })
      }
    })

    // Intent completed
    subscribe('intent_completed', (message: any) => {
      const intent = message.payload?.intent
      if (intent) {
        addActivityEvent({
          type: 'intent_completed',
          data: {
            intentId: intent.id,
            intentType: intent.type,
          },
        })
        setNetworkStats((prev) => ({
          ...prev,
          intentsPending: Math.max(0, prev.intentsPending - 1),
          intentsCompleted: prev.intentsCompleted + 1,
          totalVolume: prev.totalVolume + (intent.result?.settledAmount || 0),
        }))
      }
    })

    // Intent failed
    subscribe('intent_failed', (message: any) => {
      const intent = message.payload?.intent
      if (intent) {
        addActivityEvent({
          type: 'intent_failed',
          data: {
            intentId: intent.id,
            intentType: intent.type,
            reason: message.payload?.reason,
          },
        })
        setNetworkStats((prev) => ({
          ...prev,
          intentsPending: Math.max(0, prev.intentsPending - 1),
          intentsFailed: prev.intentsFailed + 1,
        }))
      }
    })

    // Payment settled
    subscribe('payment_settled', (message: any) => {
      addActivityEvent({
        type: 'payment_settled',
        data: {
          intentId: message.payload?.intentId,
          providerId: message.payload?.provider,
          amount: message.payload?.amount,
        },
      })
    })

    // Failover triggered
    subscribe('failover_triggered', (message: any) => {
      addActivityEvent({
        type: 'failover_triggered',
        data: {
          intentId: message.payload?.intent?.id,
          providerId: message.payload?.newProvider,
        },
      })
    })

    // Provider updates
    subscribe('provider:registered', (message: any) => {
      addActivityEvent({
        type: 'provider_connected',
        data: {
          providerId: message.payload?.provider?.address,
          providerName: message.payload?.provider?.name,
        },
      })
      fetchData()
    })

    subscribe('provider:heartbeat', () => {
      // Silently update provider status
      fetchData()
    })
  }, [subscribe, addActivityEvent])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [providersRes, statsRes] = await Promise.all([
        getProviders(),
        getProviderStats()
      ])

      if (providersRes.success) {
        setProviders(providersRes.data)
      }
      if (statsRes.success) {
        setStats(statsRes.data)
        setNetworkStats((prev) => ({
          ...prev,
          providersOnline: statsRes.data.online,
          providersTotal: statsRes.data.total,
        }))
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const filteredProviders = selectedCapability
    ? providers.filter(p => p.capabilities.includes(selectedCapability))
    : providers

  const allCapabilities = [...new Set(providers.flatMap(p => p.capabilities))]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <h1 className="text-xl font-bold text-white">Network Dashboard</h1>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                Refresh
              </button>

              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
                isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              )}>
                {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {isConnected ? 'Live' : 'Offline'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Top Row - Stats and Activity Feed */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Network Stats */}
          <div className="lg:col-span-2">
            <NetworkStats stats={networkStats} isLive={isConnected} />
          </div>

          {/* Live Activity Feed */}
          <div className="lg:col-span-1">
            <LiveActivityFeed events={activityEvents} maxEvents={15} />
          </div>
        </div>

        {/* Capability Filter */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Filter by Capability</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCapability(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm transition-colors',
                selectedCapability === null
                  ? 'bg-synapse-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              All ({providers.length})
            </button>
            {allCapabilities.map(cap => (
              <button
                key={cap}
                onClick={() => setSelectedCapability(cap)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors',
                  selectedCapability === cap
                    ? 'bg-synapse-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                {cap} ({providers.filter(p => p.capabilities.includes(cap)).length})
              </button>
            ))}
          </div>
        </div>

        {/* Providers Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProviders.map((provider, index) => (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{provider.name}</h3>
                    {provider.teeAttested && (
                      <span title="TEE Attested">
                        <Shield className="w-4 h-4 text-green-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {truncateAddress(provider.address)}
                  </p>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  provider.status === 'ONLINE'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                )}>
                  {provider.status}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {provider.description}
              </p>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1 mb-4">
                {provider.capabilities.map(cap => (
                  <span
                    key={cap}
                    className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300"
                  >
                    {cap}
                  </span>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-yellow-400 mb-1">
                    <Star className="w-3 h-3" />
                    <span className="text-xs">Reputation</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {provider.reputationScore.toFixed(2)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-blue-400 mb-1">
                    <Activity className="w-3 h-3" />
                    <span className="text-xs">Jobs</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {provider.successfulJobs}/{provider.totalJobs}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-green-400 mb-1">
                    <DollarSign className="w-3 h-3" />
                    <span className="text-xs">Earned</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {formatUSD(provider.totalEarnings)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-purple-400 mb-1">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">Avg Time</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {provider.avgResponseTime > 0 ? `${Math.round(provider.avgResponseTime)}ms` : 'N/A'}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty State */}
        {filteredProviders.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-400">No providers found</h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedCapability
                ? `No providers with capability "${selectedCapability}"`
                : 'Start the API server and provider bots to see providers'}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && providers.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-synapse-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-400">Loading providers...</p>
          </div>
        )}
      </main>
    </div>
  )
}
