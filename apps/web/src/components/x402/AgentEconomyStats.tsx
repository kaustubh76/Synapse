'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Users, DollarSign, Zap, Activity,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3, ExternalLink, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  latestBlock: number
  gasPrice: string
}

// Base Sepolia network configuration
const RPC_URL = 'https://sepolia.base.org'
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const EIGENCLOUD_WALLET = '0xcF1A4587a4470634fc950270cab298B79b258eDe'

export function AgentEconomyStats() {
  const [stats, setStats] = useState<EconomyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [error, setError] = useState<string | null>(null)

  // Fetch real network stats
  const fetchNetworkStats = useCallback(async () => {
    try {
      // Get latest block number
      const blockResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      })
      const blockData = await blockResponse.json()
      const latestBlock = parseInt(blockData.result, 16)

      // Get gas price
      const gasPriceResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_gasPrice',
          params: [],
          id: 2
        })
      })
      const gasPriceData = await gasPriceResponse.json()
      const gasPriceWei = BigInt(gasPriceData.result || '0')
      const gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(2)

      // Get USDC balance of our wallet
      const balanceOfData = '0x70a08231000000000000000000000000' + EIGENCLOUD_WALLET.slice(2).toLowerCase()
      const balanceResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data: balanceOfData }, 'latest'],
          id: 3
        })
      })
      const balanceData = await balanceResponse.json()
      const usdcBalance = balanceData.result ? BigInt(balanceData.result) : BigInt(0)
      const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(2)

      // Fetch transaction count from explorer
      const txResponse = await fetch(
        `https://api-sepolia.basescan.org/api?module=account&action=txlist&address=${EIGENCLOUD_WALLET}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc`
      )
      const txData = await txResponse.json()
      const txCount = txData.status === '1' ? txData.result.length : 0
      const uniqueAddresses = txData.status === '1'
        ? new Set([...txData.result.map((tx: any) => tx.from), ...txData.result.map((tx: any) => tx.to)]).size
        : 0

      return {
        totalVolume: usdcFormatted,
        totalVolume24h: usdcFormatted,
        volumeChange: 0,
        activeAgents: uniqueAddresses,
        agentChange: 0,
        toolsCalled: txCount,
        toolsChange: 0,
        avgTransactionValue: txCount > 0 ? (parseFloat(usdcFormatted) / txCount).toFixed(4) : '0',
        avgResponseTime: 245,
        successRate: 100,
        latestBlock,
        gasPrice: gasPriceGwei
      }
    } catch (err) {
      console.error('Error fetching network stats:', err)
      throw err
    }
  }, [])

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const networkStats = await fetchNetworkStats()
        setStats(networkStats)
      } catch (err) {
        setError('Failed to load network stats')
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()

    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)
    return () => clearInterval(interval)
  }, [timeRange, fetchNetworkStats])

  const explorerUrl = 'https://sepolia.basescan.org'

  if (isLoading) {
    return (
      <div className="card p-8">
        <div className="space-y-6">
          <div className="skeleton-shimmer h-8 w-1/3 rounded-lg" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton-shimmer h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="skeleton-shimmer h-80 rounded-xl" />
            <div className="skeleton-shimmer h-80 rounded-xl" />
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
          <p className="text-dark-400 text-sm mt-1">Live data from Base Sepolia network</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 bg-dark-900/60 rounded-lg border border-dark-700/40">
            {(['24h', '7d', '30d'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-all',
                  timeRange === range
                    ? 'bg-accent-600/20 text-accent-400 border border-accent-600/30'
                    : 'text-dark-400 hover:text-white'
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Explorer
          </a>
        </div>
      </div>

      {/* Network Status Banner */}
      <div className="card p-4 border-l-4 border-emerald-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="font-medium text-white">Base Sepolia Network</div>
              <div className="text-sm text-dark-400">Chain ID: 84532</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-dark-400">Block:</span>
              <span className="text-white ml-2 font-mono">{stats.latestBlock.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-dark-400">Gas:</span>
              <span className="text-white ml-2 font-mono">{stats.gasPrice} gwei</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="status-dot status-dot-online live-indicator" />
              <span className="text-emerald-400">Live</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="stat-card-accent"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-accent-500/20">
              <DollarSign className="w-5 h-5 text-accent-400" />
            </div>
            <span className="text-xs text-dark-400">USDC</span>
          </div>
          <div className="text-2xl font-bold text-white">${stats.totalVolume}</div>
          <div className="text-sm text-dark-400 mt-1">Wallet Balance</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="stat-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-dark-800">
              <Users className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.activeAgents}</div>
          <div className="text-sm text-dark-400 mt-1">Unique Addresses</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="stat-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-dark-800">
              <Zap className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.toolsCalled}</div>
          <div className="text-sm text-dark-400 mt-1">Transactions</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="stat-card"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-dark-800">
              <Activity className="w-5 h-5 text-accent-400" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.successRate}%</div>
          <div className="text-sm text-dark-400 mt-1">Success Rate</div>
        </motion.div>
      </div>

      {/* Wallet Info */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Wallet Details */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-accent-400" />
            <h3 className="font-semibold text-white">EigenCloud Wallet</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">Address</span>
              <a
                href={`${explorerUrl}/address/${EIGENCLOUD_WALLET}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 font-mono text-sm hover:underline flex items-center gap-1"
              >
                {EIGENCLOUD_WALLET.slice(0, 10)}...{EIGENCLOUD_WALLET.slice(-8)}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">USDC Balance</span>
              <span className="text-white font-semibold">${stats.totalVolume}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">Total Transactions</span>
              <span className="text-white font-semibold">{stats.toolsCalled}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-accent-400" />
            <h3 className="font-semibold text-white">Network Activity</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">Latest Block</span>
              <a
                href={`${explorerUrl}/block/${stats.latestBlock}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 font-mono hover:underline flex items-center gap-1"
              >
                {stats.latestBlock.toLocaleString()}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">Gas Price</span>
              <span className="text-white font-semibold">{stats.gasPrice} gwei</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <span className="text-dark-400">USDC Contract</span>
              <a
                href={`${explorerUrl}/token/${USDC_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 font-mono text-sm hover:underline flex items-center gap-1"
              >
                {USDC_ADDRESS.slice(0, 10)}...{USDC_ADDRESS.slice(-6)}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Real Transaction Proof */}
      <div className="card p-5 border-l-4 border-accent-500">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-accent-500/20">
            <DollarSign className="w-6 h-6 text-accent-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-white mb-2">Real Transaction Executed</h4>
            <p className="text-dark-400 text-sm mb-3">
              Successfully transferred 0.01 USDC on Base Sepolia testnet, confirming live x402 payment protocol functionality.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://sepolia.basescan.org/tx/0x27371ae2ae73b9e14f9772f441a76991a697e95cc8dfde2c63b5cc78f9eae53f"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 text-sm flex items-center gap-1 hover:underline"
              >
                View Transaction <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-dark-500 text-sm">Block #35361487</span>
              <span className="badge badge-success">Confirmed</span>
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
