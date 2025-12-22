'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Users, DollarSign, Zap, Activity,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3
} from 'lucide-react'
import { cn, formatUSD } from '@/lib/utils'

interface EconomyStats {
  totalVolume: string
  totalVolume24h: string
  volumeChange: number
  activeAgents: number
  agentChange: number
  toolsCalled: number
  toolsChange: number
  avgTransactionValue: string
  avgResponseTime: number
  successRate: number
  topTools: Array<{
    name: string
    calls: number
    volume: string
    avgPrice: string
  }>
  topEarners: Array<{
    address: string
    name: string
    earnings: string
    tools: number
  }>
}

export function AgentEconomyStats() {
  const [stats, setStats] = useState<EconomyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')

  useEffect(() => {
    // Simulated API call - replace with real API
    setIsLoading(true)
    setTimeout(() => {
      setStats({
        totalVolume: '1,250,000.00',
        totalVolume24h: '45,678.90',
        volumeChange: 12.5,
        activeAgents: 1247,
        agentChange: 8.3,
        toolsCalled: 156789,
        toolsChange: 15.2,
        avgTransactionValue: '0.029',
        avgResponseTime: 245,
        successRate: 98.5,
        topTools: [
          { name: 'deep_research', calls: 45678, volume: '12,500.00', avgPrice: '0.05' },
          { name: 'crypto_price', calls: 34567, volume: '8,250.00', avgPrice: '0.01' },
          { name: 'weather_api', calls: 23456, volume: '5,125.00', avgPrice: '0.005' },
          { name: 'analysis', calls: 12345, volume: '3,750.00', avgPrice: '0.02' },
          { name: 'news_search', calls: 9876, volume: '2,125.00', avgPrice: '0.01' },
        ],
        topEarners: [
          { address: '0x1234...5678', name: 'Research Agent', earnings: '5,250.00', tools: 5 },
          { address: '0x8765...4321', name: 'Data Provider', earnings: '3,125.00', tools: 3 },
          { address: '0xabcd...efgh', name: 'Analytics Bot', earnings: '2,890.00', tools: 4 },
          { address: '0x9999...8888', name: 'Weather Service', earnings: '1,750.00', tools: 2 },
        ],
      })
      setIsLoading(false)
    }, 1000)
  }, [timeRange])

  if (isLoading) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Agent Economy</h2>
          <p className="text-gray-400">Real-time x402 payment protocol metrics</p>
        </div>
        <div className="flex gap-2">
          {(['24h', '7d', '30d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                timeRange === range
                  ? 'bg-synapse-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-900/50 to-green-950/50 rounded-xl p-5 border border-green-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <span className={cn(
              'flex items-center gap-1 text-sm',
              stats.volumeChange >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {stats.volumeChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(stats.volumeChange)}%
            </span>
          </div>
          <div className="text-2xl font-bold text-white">${stats.totalVolume24h}</div>
          <div className="text-sm text-gray-400">Volume (24h)</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-900/50 to-blue-950/50 rounded-xl p-5 border border-blue-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <span className={cn(
              'flex items-center gap-1 text-sm',
              stats.agentChange >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {stats.agentChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(stats.agentChange)}%
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.activeAgents.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Active Agents</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-900/50 to-purple-950/50 rounded-xl p-5 border border-purple-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <span className={cn(
              'flex items-center gap-1 text-sm',
              stats.toolsChange >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {stats.toolsChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {Math.abs(stats.toolsChange)}%
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.toolsCalled.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Tool Calls</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-yellow-900/50 to-yellow-950/50 rounded-xl p-5 border border-yellow-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Activity className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.successRate}%</div>
          <div className="text-sm text-gray-400">Success Rate</div>
        </motion.div>
      </div>

      {/* Secondary Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400">Avg Transaction</span>
          </div>
          <div className="text-xl font-bold text-white">${stats.avgTransactionValue} USDC</div>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400">Avg Response Time</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.avgResponseTime}ms</div>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400">Total Volume (All Time)</span>
          </div>
          <div className="text-xl font-bold text-white">${stats.totalVolume}</div>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Tools */}
        <div className="bg-gray-900/50 rounded-xl border border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-synapse-400" />
              <h3 className="font-semibold text-white">Top Tools</h3>
            </div>
          </div>
          <div className="divide-y divide-gray-800">
            {stats.topTools.map((tool, index) => (
              <div key={tool.name} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-synapse-600 flex items-center justify-center text-sm text-white font-medium">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-medium text-white">{tool.name}</div>
                    <div className="text-sm text-gray-400">{tool.calls.toLocaleString()} calls</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-green-400">${tool.volume}</div>
                  <div className="text-sm text-gray-400">avg ${tool.avgPrice}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Earners */}
        <div className="bg-gray-900/50 rounded-xl border border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold text-white">Top Earners</h3>
            </div>
          </div>
          <div className="divide-y divide-gray-800">
            {stats.topEarners.map((earner, index) => (
              <div key={earner.address} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-sm text-white font-medium">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-medium text-white">{earner.name}</div>
                    <div className="text-sm text-gray-400 font-mono">{earner.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-green-400">${earner.earnings}</div>
                  <div className="text-sm text-gray-400">{earner.tools} tools</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
