'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Zap, CheckCircle, XCircle, Clock, DollarSign,
  ArrowRight, AlertTriangle, Shield, TrendingUp
} from 'lucide-react'
import { cn, formatUSD, truncateAddress } from '@/lib/utils'

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

interface LiveActivityFeedProps {
  events: ActivityEvent[]
  maxEvents?: number
}

const eventConfig: Record<string, { icon: typeof Activity; color: string; bgColor: string; label: string }> = {
  intent_created: { icon: Zap, color: 'text-synapse-400', bgColor: 'bg-synapse-400/20', label: 'Intent Created' },
  bid_received: { icon: DollarSign, color: 'text-blue-400', bgColor: 'bg-blue-400/20', label: 'Bid Received' },
  winner_selected: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-400/20', label: 'Winner Selected' },
  intent_completed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-400/20', label: 'Completed' },
  intent_failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/20', label: 'Failed' },
  payment_settled: { icon: DollarSign, color: 'text-green-400', bgColor: 'bg-green-400/20', label: 'Payment Settled' },
  failover_triggered: { icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-400/20', label: 'Failover' },
  provider_connected: { icon: Activity, color: 'text-green-400', bgColor: 'bg-green-400/20', label: 'Provider Online' },
  provider_disconnected: { icon: Activity, color: 'text-gray-400', bgColor: 'bg-gray-400/20', label: 'Provider Offline' },
}

export function LiveActivityFeed({ events, maxEvents = 20 }: LiveActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAutoScroll, setIsAutoScroll] = useState(true)

  useEffect(() => {
    if (isAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [events, isAutoScroll])

  const displayEvents = events.slice(0, maxEvents)

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-synapse-400" />
          <h3 className="font-medium text-white">Live Activity</h3>
          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 rounded-full text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        </div>
        <span className="text-xs text-gray-500">{events.length} events</span>
      </div>

      <div
        ref={containerRef}
        className="h-[400px] overflow-y-auto p-2 space-y-2"
        onScroll={(e) => {
          const target = e.target as HTMLDivElement
          setIsAutoScroll(target.scrollTop < 10)
        }}
      >
        <AnimatePresence initial={false}>
          {displayEvents.map((event) => {
            const config = eventConfig[event.type] || eventConfig.intent_created
            const Icon = config.icon

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'p-3 rounded-lg border transition-colors',
                  'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('p-1.5 rounded-lg', config.bgColor)}>
                    <Icon className={cn('w-4 h-4', config.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium', config.color)}>
                        {config.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-gray-400">
                      {renderEventDetails(event)}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {displayEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Activity className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Waiting for activity...</p>
          </div>
        )}
      </div>
    </div>
  )
}

function renderEventDetails(event: ActivityEvent): React.ReactNode {
  const { data } = event

  switch (event.type) {
    case 'intent_created':
      return (
        <span>
          <span className="text-white">{data.intentType}</span>
          {data.intentId && (
            <span className="text-gray-500 ml-1">({truncateAddress(data.intentId)})</span>
          )}
        </span>
      )

    case 'bid_received':
      return (
        <span className="flex items-center gap-1">
          <span className="text-white">{data.providerName || truncateAddress(data.providerId || '')}</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-green-400">{formatUSD(data.bidAmount || 0)}</span>
          {data.score && (
            <span className="text-gray-500 ml-1">(Score: {data.score})</span>
          )}
        </span>
      )

    case 'winner_selected':
      return (
        <span>
          <span className="text-white">{data.providerName || truncateAddress(data.providerId || '')}</span>
          <span className="text-gray-500 ml-1">won bid</span>
        </span>
      )

    case 'intent_completed':
      return (
        <span className="flex items-center gap-1">
          <span className="text-white">{data.intentType}</span>
          <CheckCircle className="w-3 h-3 text-green-400" />
        </span>
      )

    case 'intent_failed':
      return (
        <span>
          <span className="text-white">{data.intentType}</span>
          {data.reason && <span className="text-red-400 ml-1">- {data.reason}</span>}
        </span>
      )

    case 'payment_settled':
      return (
        <span>
          <span className="text-green-400">{formatUSD(data.amount || 0)}</span>
          <span className="text-gray-500 ml-1">to {truncateAddress(data.providerId || '')}</span>
        </span>
      )

    case 'failover_triggered':
      return (
        <span>
          <span className="text-yellow-400">Switching provider</span>
          {data.providerId && (
            <span className="text-gray-500 ml-1">to {truncateAddress(data.providerId)}</span>
          )}
        </span>
      )

    case 'provider_connected':
    case 'provider_disconnected':
      return (
        <span className="text-white">{data.providerName || truncateAddress(data.providerId || '')}</span>
      )

    default:
      return JSON.stringify(data)
  }
}

function formatTimestamp(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 1000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return new Date(timestamp).toLocaleTimeString()
}
