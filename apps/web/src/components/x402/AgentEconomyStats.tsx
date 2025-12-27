'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Users, DollarSign, Zap, Activity,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3, ExternalLink, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CROSSMINT_TREASURY,
  EIGENCLOUD_WALLET,
  USDC_ADDRESS,
  TRANSFER_EVENT_SIGNATURE,
  RPC_URL
} from '@/lib/config'

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

interface Transaction {
  hash: string
  from: string
  to: string
  value: string
  timeStamp: string
  blockNumber: string
  isError: string
  methodId: string
}

// Wallet and contract addresses are imported from config

export function AgentEconomyStats() {
  const [stats, setStats] = useState<EconomyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h')
  const [error, setError] = useState<string | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

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
      const balanceOfData = '0x70a08231000000000000000000000000' + EIGENCLOUD_WALLET.address.slice(2).toLowerCase()
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

      // Fetch USDC token transfers using Alchemy's alchemy_getAssetTransfers API
      // Get transfers FROM our wallet
      const transfersFromResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            fromAddress: EIGENCLOUD_WALLET.address,
            contractAddresses: [USDC_ADDRESS],
            category: ['erc20'],
            withMetadata: true,
            maxCount: '0x14' // 20 transfers
          }],
          id: 4
        })
      })
      const transfersFromData = await transfersFromResponse.json()

      // Get transfers TO our wallet
      const transfersToResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: EIGENCLOUD_WALLET.address,
            contractAddresses: [USDC_ADDRESS],
            category: ['erc20'],
            withMetadata: true,
            maxCount: '0x14' // 20 transfers
          }],
          id: 5
        })
      })
      const transfersToData = await transfersToResponse.json()

      // Combine transfers
      const allTransfers = [
        ...(transfersFromData.result?.transfers || []),
        ...(transfersToData.result?.transfers || [])
      ]

      // Parse into our transaction format
      const tokenTransfers = allTransfers.map((transfer: any) => {
        // Convert value to USDC units (6 decimals)
        const valueInUnits = transfer.value ? Math.round(transfer.value * 1e6).toString() : '0'

        return {
          hash: transfer.hash,
          from: transfer.from,
          to: transfer.to,
          value: valueInUnits,
          timeStamp: transfer.metadata?.blockTimestamp
            ? Math.floor(new Date(transfer.metadata.blockTimestamp).getTime() / 1000).toString()
            : '0',
          blockNumber: parseInt(transfer.blockNum, 16).toString(),
          isError: '0',
          methodId: ''
        }
      })

      // Sort by block number descending
      tokenTransfers.sort((a: any, b: any) => parseInt(b.blockNumber) - parseInt(a.blockNumber))

      // Remove duplicates (same tx might appear in both from/to queries)
      const seenHashes = new Set<string>()
      const uniqueTransfers = tokenTransfers.filter((tx: any) => {
        if (seenHashes.has(tx.hash)) return false
        seenHashes.add(tx.hash)
        return true
      })

      const txCount = uniqueTransfers.length
      const uniqueAddresses = new Set([
        ...uniqueTransfers.map((tx: any) => tx.from.toLowerCase()),
        ...uniqueTransfers.map((tx: any) => tx.to.toLowerCase())
      ]).size

      // Store token transfers for display (use uniqueTransfers to avoid duplicates)
      setRecentTransactions(uniqueTransfers.slice(0, 10))

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

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const networkStats = await fetchNetworkStats()
      setStats(networkStats)
    } catch (err) {
      setError('Failed to refresh')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Format timestamp to relative time
  const formatTime = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Format USDC value (6 decimals)
  const formatUSDC = (value: string) => {
    const amount = parseFloat(value) / 1e6
    return amount.toFixed(amount < 0.01 ? 4 : 2)
  }

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
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            Refresh
          </button>
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
                {EIGENCLOUD_WALLET.address.slice(0, 10)}...{EIGENCLOUD_WALLET.address.slice(-8)}
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

      {/* Recent USDC Transactions */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-accent-400" />
            <h3 className="font-semibold text-white">Recent USDC Transactions</h3>
          </div>
          <span className="text-xs text-dark-400">x402 Payment Protocol</span>
        </div>

        {recentTransactions.length > 0 ? (
          <div className="space-y-3">
            {recentTransactions.map((tx: any, index: number) => {
              const isOutgoing = tx.from.toLowerCase() === EIGENCLOUD_WALLET.address.toLowerCase()
              const isTreasury = tx.to.toLowerCase() === CROSSMINT_TREASURY.toLowerCase()

              return (
                <motion.div
                  key={tx.hash}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    isTreasury
                      ? "bg-gradient-to-r from-emerald-600/10 to-blue-600/10 border-emerald-600/20"
                      : "bg-dark-800/50 border-dark-700/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isOutgoing ? "bg-red-500/20" : "bg-emerald-500/20"
                    )}>
                      {isOutgoing ? (
                        <ArrowUpRight className="w-4 h-4 text-red-400" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-semibold",
                          isOutgoing ? "text-red-400" : "text-emerald-400"
                        )}>
                          {isOutgoing ? '-' : '+'}${formatUSDC(tx.value)} USDC
                        </span>
                        {isTreasury && (
                          <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                            Crossmint Treasury
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-dark-400 flex items-center gap-2 mt-0.5">
                        <span>{isOutgoing ? 'To:' : 'From:'}</span>
                        <span className="font-mono">
                          {(isOutgoing ? tx.to : tx.from).slice(0, 8)}...{(isOutgoing ? tx.to : tx.from).slice(-6)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-dark-300">{formatTime(tx.timeStamp)}</div>
                      <div className="text-xs text-dark-500">Block #{parseInt(tx.blockNumber).toLocaleString()}</div>
                    </div>
                    <a
                      href={`${explorerUrl}/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-accent-400" />
                    </a>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-dark-400">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No USDC transactions yet</p>
            <p className="text-sm mt-1">Execute a tool to see payments here</p>
          </div>
        )}

        {recentTransactions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-dark-700/40 flex items-center justify-between">
            <span className="text-xs text-dark-400">
              Showing {recentTransactions.length} recent transactions
            </span>
            <a
              href={`${explorerUrl}/token/${USDC_ADDRESS}?a=${EIGENCLOUD_WALLET.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400 text-sm flex items-center gap-1 hover:underline"
            >
              View All <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm text-center">{error}</div>
      )}
    </div>
  )
}
