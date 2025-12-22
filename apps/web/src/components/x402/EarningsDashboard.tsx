'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign, TrendingUp, Clock, Zap, Users,
  ArrowUpRight, RefreshCw, Download, Calendar,
  ChevronDown, BarChart2, PieChart
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolEarnings {
  toolId: string
  toolName: string
  calls: number
  earnings: string
  avgPrice: string
  trend: number
}

interface EarningsData {
  totalEarnings: string
  todayEarnings: string
  weeklyEarnings: string
  monthlyEarnings: string
  pendingPayouts: string
  totalCalls: number
  uniqueCallers: number
  avgResponseTime: number
  toolEarnings: ToolEarnings[]
  recentPayouts: Array<{
    id: string
    amount: string
    timestamp: number
    status: 'completed' | 'pending' | 'processing'
    txHash?: string
  }>
  earningsHistory: Array<{
    date: string
    amount: number
  }>
}

interface EarningsDashboardProps {
  providerId?: string
  onWithdraw?: () => void
}

export function EarningsDashboard({
  providerId,
  onWithdraw
}: EarningsDashboardProps) {
  const [data, setData] = useState<EarningsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const [selectedChart, setSelectedChart] = useState<'line' | 'bar'>('line')

  useEffect(() => {
    if (providerId) {
      setIsLoading(true)
      // Simulate API call
      setTimeout(() => {
        setData({
          totalEarnings: '1,250.75',
          todayEarnings: '45.25',
          weeklyEarnings: '312.50',
          monthlyEarnings: '1,125.00',
          pendingPayouts: '125.50',
          totalCalls: 45678,
          uniqueCallers: 1234,
          avgResponseTime: 245,
          toolEarnings: [
            { toolId: 'tool_1', toolName: 'deep_research', calls: 15678, earnings: '475.25', avgPrice: '0.05', trend: 12.5 },
            { toolId: 'tool_2', toolName: 'data_analysis', calls: 12345, earnings: '325.50', avgPrice: '0.02', trend: 8.3 },
            { toolId: 'tool_3', toolName: 'report_gen', calls: 8765, earnings: '215.75', avgPrice: '0.10', trend: -2.1 },
            { toolId: 'tool_4', toolName: 'quick_search', calls: 5432, earnings: '125.00', avgPrice: '0.005', trend: 15.7 },
            { toolId: 'tool_5', toolName: 'image_analysis', calls: 3458, earnings: '109.25', avgPrice: '0.03', trend: 5.2 },
          ],
          recentPayouts: [
            { id: 'payout_1', amount: '50.00', timestamp: Date.now() - 86400000, status: 'completed', txHash: '0xabc...123' },
            { id: 'payout_2', amount: '75.50', timestamp: Date.now() - 172800000, status: 'completed', txHash: '0xdef...456' },
            { id: 'payout_3', amount: '125.50', timestamp: Date.now(), status: 'pending' },
          ],
          earningsHistory: [
            { date: '12/15', amount: 42.5 },
            { date: '12/16', amount: 38.2 },
            { date: '12/17', amount: 55.8 },
            { date: '12/18', amount: 48.3 },
            { date: '12/19', amount: 62.1 },
            { date: '12/20', amount: 45.7 },
            { date: '12/21', amount: 52.4 },
          ],
        })
        setIsLoading(false)
      }, 1000)
    }
  }, [providerId, timeRange])

  if (!providerId) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8 text-center">
        <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Provider Dashboard</h3>
        <p className="text-gray-400 mb-6">
          Connect your wallet to view your earnings dashboard
        </p>
      </div>
    )
  }

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
          <div className="h-64 bg-gray-800 rounded" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const maxEarning = Math.max(...data.earningsHistory.map(e => e.amount))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Provider Earnings</h2>
          <p className="text-gray-400">Track your tool monetization revenue</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
            {(['24h', '7d', '30d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                  timeRange === range
                    ? 'bg-synapse-600 text-white'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <button
            onClick={onWithdraw}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Withdraw
          </button>
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
            <span className="flex items-center gap-1 text-sm text-green-400">
              <ArrowUpRight className="w-4 h-4" />
              12.5%
            </span>
          </div>
          <div className="text-2xl font-bold text-white">${data.totalEarnings}</div>
          <div className="text-sm text-gray-400">Total Earnings</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-900/50 to-blue-950/50 rounded-xl p-5 border border-blue-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data.totalCalls.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Tool Calls</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-900/50 to-purple-950/50 rounded-xl p-5 border border-purple-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data.uniqueCallers.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Unique Callers</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-yellow-900/50 to-yellow-950/50 rounded-xl p-5 border border-yellow-800/50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data.avgResponseTime}ms</div>
          <div className="text-sm text-gray-400">Avg Response Time</div>
        </motion.div>
      </div>

      {/* Earnings Breakdown */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Today</div>
          <div className="text-xl font-bold text-green-400">+${data.todayEarnings}</div>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">This Week</div>
          <div className="text-xl font-bold text-green-400">+${data.weeklyEarnings}</div>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400 mb-1">Pending Payout</div>
              <div className="text-xl font-bold text-yellow-400">${data.pendingPayouts}</div>
            </div>
            <button
              onClick={onWithdraw}
              className="px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded-lg text-sm transition-colors"
            >
              Claim
            </button>
          </div>
        </div>
      </div>

      {/* Earnings Chart */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white">Earnings History</h3>
          <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setSelectedChart('line')}
              className={cn(
                'p-1.5 rounded transition-colors',
                selectedChart === 'line' ? 'bg-gray-700 text-white' : 'text-gray-400'
              )}
            >
              <TrendingUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedChart('bar')}
              className={cn(
                'p-1.5 rounded transition-colors',
                selectedChart === 'bar' ? 'bg-gray-700 text-white' : 'text-gray-400'
              )}
            >
              <BarChart2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Simple Chart Visualization */}
        <div className="h-48 flex items-end gap-2">
          {data.earningsHistory.map((entry, index) => (
            <motion.div
              key={entry.date}
              initial={{ height: 0 }}
              animate={{ height: `${(entry.amount / maxEarning) * 100}%` }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className="flex-1 relative group"
            >
              <div
                className={cn(
                  'w-full rounded-t transition-colors',
                  selectedChart === 'bar'
                    ? 'bg-synapse-600 hover:bg-synapse-500'
                    : 'bg-gradient-to-t from-synapse-600 to-synapse-400'
                )}
                style={{ height: '100%' }}
              />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 px-2 py-1 rounded text-xs text-white whitespace-nowrap">
                ${entry.amount.toFixed(2)}
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                {entry.date}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tool Performance */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-synapse-400" />
            <h3 className="font-semibold text-white">Tool Performance</h3>
          </div>
        </div>
        <div className="divide-y divide-gray-800">
          {data.toolEarnings.map((tool, index) => (
            <motion.div
              key={tool.toolId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-synapse-600/20 flex items-center justify-center text-synapse-400 font-mono text-sm">
                    {index + 1}
                  </span>
                  <div>
                    <div className="font-medium text-white">{tool.toolName}</div>
                    <div className="text-sm text-gray-400">
                      {tool.calls.toLocaleString()} calls • avg ${tool.avgPrice}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-green-400">${tool.earnings}</div>
                  <div className={cn(
                    'text-sm flex items-center gap-1',
                    tool.trend >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {tool.trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {Math.abs(tool.trend)}%
                  </div>
                </div>
              </div>
              {/* Progress bar showing contribution */}
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(parseFloat(tool.earnings.replace(',', '')) / parseFloat(data.totalEarnings.replace(',', ''))) * 100}%` }}
                  transition={{ delay: index * 0.05 + 0.2 }}
                  className="h-full bg-synapse-600 rounded-full"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Payouts */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-green-400" />
            <h3 className="font-semibold text-white">Recent Payouts</h3>
          </div>
        </div>
        <div className="divide-y divide-gray-800">
          {data.recentPayouts.map((payout) => (
            <div key={payout.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  payout.status === 'completed' && 'bg-green-500/20',
                  payout.status === 'pending' && 'bg-yellow-500/20',
                  payout.status === 'processing' && 'bg-blue-500/20'
                )}>
                  {payout.status === 'completed' && <DollarSign className="w-4 h-4 text-green-400" />}
                  {payout.status === 'pending' && <Clock className="w-4 h-4 text-yellow-400" />}
                  {payout.status === 'processing' && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
                </div>
                <div>
                  <div className="font-medium text-white">${payout.amount} USDC</div>
                  <div className="text-sm text-gray-400">
                    {new Date(payout.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'px-2 py-1 rounded text-xs capitalize',
                  payout.status === 'completed' && 'bg-green-500/20 text-green-400',
                  payout.status === 'pending' && 'bg-yellow-500/20 text-yellow-400',
                  payout.status === 'processing' && 'bg-blue-500/20 text-blue-400'
                )}>
                  {payout.status}
                </span>
                {payout.txHash && (
                  <a
                    href={`https://basescan.org/tx/${payout.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-synapse-400 hover:text-synapse-300 text-sm"
                  >
                    View TX
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
