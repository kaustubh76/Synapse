'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, Users, Zap, DollarSign, Clock, TrendingUp,
  CheckCircle, XCircle, Target, BarChart3
} from 'lucide-react'
import { cn, formatUSD } from '@/lib/utils'

interface NetworkStatsProps {
  stats: {
    providersOnline: number
    providersTotal: number
    intentsPending: number
    intentsCompleted: number
    intentsFailed: number
    totalVolume: number
    avgResponseTime: number
    avgSavings: number
    successRate: number
  }
  isLive?: boolean
}

export function NetworkStats({ stats, isLive = true }: NetworkStatsProps) {
  const [animatedStats, setAnimatedStats] = useState(stats)

  useEffect(() => {
    // Animate number changes
    setAnimatedStats(stats)
  }, [stats])

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-synapse-400" />
          <h3 className="font-medium text-white">Network Statistics</h3>
        </div>
        {isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 rounded-full text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Real-time
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Provider Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Providers Online"
            value={animatedStats.providersOnline}
            subtext={`of ${animatedStats.providersTotal}`}
            color="text-green-400"
            bgColor="bg-green-400/10"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Active Intents"
            value={animatedStats.intentsPending}
            color="text-synapse-400"
            bgColor="bg-synapse-400/10"
          />
        </div>

        {/* Intent Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard
            icon={<CheckCircle className="w-5 h-5" />}
            label="Completed"
            value={animatedStats.intentsCompleted}
            color="text-emerald-400"
            bgColor="bg-emerald-400/10"
            small
          />
          <StatCard
            icon={<XCircle className="w-5 h-5" />}
            label="Failed"
            value={animatedStats.intentsFailed}
            color="text-red-400"
            bgColor="bg-red-400/10"
            small
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="Success Rate"
            value={`${animatedStats.successRate.toFixed(1)}%`}
            color="text-blue-400"
            bgColor="bg-blue-400/10"
            small
          />
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="Total Volume"
            value={formatUSD(animatedStats.totalVolume)}
            color="text-green-400"
            bgColor="bg-green-400/10"
            small
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Avg Response"
            value={`${animatedStats.avgResponseTime}ms`}
            color="text-purple-400"
            bgColor="bg-purple-400/10"
            small
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Avg Savings"
            value={`${animatedStats.avgSavings.toFixed(0)}%`}
            color="text-yellow-400"
            bgColor="bg-yellow-400/10"
            small
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
  bgColor,
  small = false,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
  color: string
  bgColor: string
  small?: boolean
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        'rounded-lg p-3 transition-colors',
        bgColor,
        'hover:opacity-90'
      )}
    >
      <div className={cn('mb-1', color)}>{icon}</div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('font-bold text-white', small ? 'text-lg' : 'text-2xl')}
      >
        {value}
      </motion.div>
      <div className="text-xs text-gray-400 flex items-center gap-1">
        {label}
        {subtext && <span className="text-gray-500">({subtext})</span>}
      </div>
    </motion.div>
  )
}
