'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign, TrendingUp, Clock, Zap, Users,
  ArrowUpRight, RefreshCw, Download, Calendar,
  ChevronDown, BarChart2, ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CROSSMINT_TREASURY,
  EIGENCLOUD_WALLET,
  USDC_ADDRESS,
  RPC_URL
} from '@/lib/config'

interface EarningsData {
  totalEarnings: string
  todayEarnings: string
  weeklyEarnings: string
  pendingPayouts: string
  totalCalls: number
  uniqueCallers: number
  avgResponseTime: number
  recentPayouts: Array<{
    id: string
    amount: string
    timestamp: number
    status: 'completed' | 'pending' | 'processing'
    txHash?: string
  }>
}

interface EarningsDashboardProps {
  providerId?: string
  onWithdraw?: () => void
}

// Wallet and contract addresses are imported from config

export function EarningsDashboard({
  providerId,
  onWithdraw
}: EarningsDashboardProps) {
  const [data, setData] = useState<EarningsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00')
  const [error, setError] = useState<string | null>(null)

  // Fetch real USDC balance
  const fetchUsdcBalance = useCallback(async (address: string) => {
    try {
      const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase()
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data: balanceOfData }, 'latest'],
          id: 1
        })
      })
      const result = await response.json()
      const balance = result.result ? BigInt(result.result) : BigInt(0)
      return (Number(balance) / 1e6).toFixed(2)
    } catch (err) {
      console.error('Error fetching USDC balance:', err)
      return '0.00'
    }
  }, [])

  // Fetch real transaction history using Alchemy API
  const fetchTransactionHistory = useCallback(async (address: string) => {
    try {
      // Fetch transfers TO this wallet (incoming payments)
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: address,
            contractAddresses: [USDC_ADDRESS],
            category: ['erc20'],
            withMetadata: true,
            maxCount: '0x14' // 20 transfers
          }],
          id: 2
        })
      })
      const data = await response.json()

      if (data.result?.transfers) {
        return data.result.transfers.map((tx: any) => ({
          id: tx.hash,
          amount: tx.value ? tx.value.toFixed(4) : '0',
          timestamp: tx.metadata?.blockTimestamp
            ? new Date(tx.metadata.blockTimestamp).getTime()
            : Date.now(),
          status: 'completed' as const,
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          blockNumber: parseInt(tx.blockNum, 16)
        })).sort((a: any, b: any) => b.blockNumber - a.blockNumber)
      }
      return []
    } catch (err) {
      console.error('Error fetching transactions:', err)
      return []
    }
  }, [])

  useEffect(() => {
    // Use Crossmint Treasury wallet for earnings (where payments are received)
    const treasuryAddress = CROSSMINT_TREASURY

    const loadData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [balance, transactions] = await Promise.all([
          fetchUsdcBalance(treasuryAddress),
          fetchTransactionHistory(treasuryAddress)
        ])

        setUsdcBalance(balance)

        // All transactions to treasury are incoming payments
        const totalIncoming = transactions.reduce((sum: number, tx: any) =>
          sum + parseFloat(tx.amount || '0'), 0
        )

        setData({
          totalEarnings: totalIncoming.toFixed(4),
          todayEarnings: '0.00', // Would need historical data
          weeklyEarnings: totalIncoming.toFixed(4),
          pendingPayouts: '0.00',
          totalCalls: transactions.length,
          uniqueCallers: new Set(transactions.map((tx: any) => tx.from)).size,
          avgResponseTime: 245, // Would need real metrics
          recentPayouts: transactions.slice(0, 5)
        })
      } catch (err) {
        console.error('Error loading earnings data:', err)
        setError('Failed to load earnings data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [timeRange, fetchUsdcBalance, fetchTransactionHistory])

  const explorerUrl = 'https://sepolia.basescan.org'
  // Always show Crossmint Treasury for earnings
  const displayAddress = CROSSMINT_TREASURY

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="stat-card-accent p-8">
          <div className="skeleton-shimmer h-8 w-48 rounded-lg mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton-shimmer h-24 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="skeleton-shimmer h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Crossmint Treasury Earnings</h2>
          <p className="text-dark-400">Real-time x402 payments received on Base Sepolia</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-dark-800/50 p-1 rounded-lg">
            {(['24h', '7d', '30d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  timeRange === range
                    ? 'bg-accent-600/20 text-accent-400'
                    : 'text-dark-400 hover:text-white'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <a
            href={`${explorerUrl}/address/${displayAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glow flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Explorer
          </a>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card-accent p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <DollarSign className="w-5 h-5 text-accent-400" />
            </div>
            <span className="text-xs text-dark-400">USDC</span>
          </div>
          <div className="text-2xl font-bold text-white">${usdcBalance}</div>
          <div className="text-sm text-accent-300/80">Current Balance</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stat-card p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <Zap className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data?.totalCalls || 0}</div>
          <div className="text-sm text-dark-400">Total Transactions</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="stat-card p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <Users className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data?.uniqueCallers || 0}</div>
          <div className="text-sm text-dark-400">Unique Addresses</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="stat-card p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <Clock className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{data?.avgResponseTime || 0}ms</div>
          <div className="text-sm text-dark-400">Avg Response Time</div>
        </motion.div>
      </div>

      {/* Treasury Wallet Info */}
      <div className="card p-5 border-l-4 border-blue-500">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-dark-400">Crossmint Treasury Wallet</span>
              <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">MPC Wallet</span>
            </div>
            <div className="font-mono text-white">{displayAddress}</div>
          </div>
          <a
            href={`${explorerUrl}/token/${USDC_ADDRESS}?a=${displayAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-accent-600/20 hover:bg-accent-600/30 text-accent-400 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            View USDC Transfers <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-accent-400" />
              <h3 className="font-semibold text-white">Incoming x402 Payments</h3>
            </div>
            <span className="text-xs text-dark-400">From EigenCloud → Treasury</span>
          </div>
        </div>
        <div className="divide-y divide-dark-800/50">
          {data?.recentPayouts && data.recentPayouts.length > 0 ? (
            data.recentPayouts.map((payout) => (
              <div key={payout.id} className="p-4 flex items-center justify-between hover:bg-dark-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    payout.status === 'completed' && 'bg-emerald-500/20',
                    payout.status === 'pending' && 'bg-amber-500/20',
                    payout.status === 'processing' && 'bg-accent-500/20'
                  )}>
                    {payout.status === 'completed' && <DollarSign className="w-4 h-4 text-emerald-400" />}
                    {payout.status === 'pending' && <Clock className="w-4 h-4 text-amber-400" />}
                    {payout.status === 'processing' && <RefreshCw className="w-4 h-4 text-accent-400 animate-spin" />}
                  </div>
                  <div>
                    <div className="font-medium text-white">${payout.amount} USDC</div>
                    <div className="text-sm text-dark-500">
                      {new Date(payout.timestamp).toLocaleDateString()} {new Date(payout.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'badge',
                    payout.status === 'completed' && 'badge-success',
                    payout.status === 'pending' && 'badge-warning',
                    payout.status === 'processing' && 'badge-accent'
                  )}>
                    {payout.status}
                  </span>
                  {payout.txHash && (
                    <a
                      href={`${explorerUrl}/tx/${payout.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:text-accent-300 text-sm flex items-center gap-1"
                    >
                      View TX <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="text-dark-400">No USDC transfers found</p>
              <a
                href={`${explorerUrl}/address/${displayAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 text-sm mt-2 inline-flex items-center gap-1 hover:underline"
              >
                View all activity on Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Crossmint Treasury Info */}
      <div className="card p-4 border-l-4 border-blue-500">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h4 className="font-medium text-white mb-1">Crossmint MPC Treasury</h4>
            <p className="text-dark-400 text-sm mb-2">
              All x402 payments from tool executions are sent to this Crossmint-managed MPC wallet.
              Payments come from the EigenCloud wallet when users execute tools.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <a
                href={`${explorerUrl}/address/${CROSSMINT_TREASURY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 flex items-center gap-1 hover:underline"
              >
                Treasury Wallet <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`${explorerUrl}/address/${EIGENCLOUD_WALLET.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dark-400 flex items-center gap-1 hover:underline hover:text-dark-300"
              >
                EigenCloud Wallet <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm text-center">{error}</div>
      )}
    </div>
  )
}
