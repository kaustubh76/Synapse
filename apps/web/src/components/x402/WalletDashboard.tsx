'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet, ArrowUpRight, ArrowDownLeft, Copy, Check,
  TrendingUp, Shield, RefreshCw, ExternalLink, Send
} from 'lucide-react'
import { cn, truncateAddress } from '@/lib/utils'
import { EIGENCLOUD_WALLET, USDC_ADDRESS, RPC_URL } from '@/lib/config'

interface WalletBalance {
  native: {
    symbol: string
    balance: string
    balanceFormatted: string
    usdValue: string
  }
  usdc: {
    symbol: string
    balance: string
    balanceFormatted: string
    usdValue: string
    address: string
  }
}

interface Transaction {
  id: string
  type: 'earning' | 'spending'
  amount: string
  tool: string
  counterparty: string
  timestamp: number
  status: 'completed' | 'pending' | 'failed'
  txHash?: string
}

interface WalletDashboardProps {
  walletAddress?: string
  network?: 'base' | 'base-sepolia'
  onConnect?: () => void
}

// Wallet address from config

export function WalletDashboard({
  walletAddress,
  network = 'base-sepolia',
  onConnect
}: WalletDashboardProps) {
  const [balances, setBalances] = useState<WalletBalance | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'earnings' | 'spending'>('all')
  const [error, setError] = useState<string | null>(null)

  // Fetch real balances from blockchain
  const fetchBalances = useCallback(async (address: string) => {
    try {
      // Fetch ETH balance via RPC
      const ethResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      })
      const ethData = await ethResponse.json()
      const ethBalance = ethData.result ? BigInt(ethData.result) : BigInt(0)
      const ethFormatted = (Number(ethBalance) / 1e18).toFixed(4)

      // Fetch USDC balance via RPC (balanceOf call)
      const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase()
      const usdcResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data: balanceOfData }, 'latest'],
          id: 2
        })
      })
      const usdcData = await usdcResponse.json()
      const usdcBalance = usdcData.result ? BigInt(usdcData.result) : BigInt(0)
      const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(2)

      setBalances({
        native: {
          symbol: 'ETH',
          balance: ethBalance.toString(),
          balanceFormatted: ethFormatted,
          usdValue: (parseFloat(ethFormatted) * 2300).toFixed(2) // Approximate ETH price
        },
        usdc: {
          symbol: 'USDC',
          balance: usdcBalance.toString(),
          balanceFormatted: usdcFormatted,
          usdValue: usdcFormatted,
          address: USDC_ADDRESS
        }
      })
    } catch (err) {
      console.error('Error fetching balances:', err)
      setError('Failed to fetch balances')
    }
  }, [])

  // Fetch recent transactions from block explorer API
  const fetchTransactions = useCallback(async (address: string) => {
    try {
      // For testnet, we'll show real recent activity
      // In production, this would use an indexer or the BaseScan API
      const response = await fetch(
        `https://api-sepolia.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc`
      )
      const data = await response.json()

      if (data.status === '1' && data.result) {
        const txs: Transaction[] = data.result.slice(0, 5).map((tx: any, index: number) => ({
          id: tx.hash,
          type: tx.from.toLowerCase() === address.toLowerCase() ? 'spending' : 'earning',
          amount: (parseFloat(tx.value) / 1e18).toFixed(6),
          tool: 'ETH Transfer',
          counterparty: tx.from.toLowerCase() === address.toLowerCase()
            ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`
            : `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`,
          timestamp: parseInt(tx.timeStamp) * 1000,
          status: tx.txreceipt_status === '1' ? 'completed' : 'failed',
          txHash: tx.hash
        }))
        setTransactions(txs)
      } else {
        // If API fails or no results, show empty
        setTransactions([])
      }
    } catch (err) {
      console.error('Error fetching transactions:', err)
      setTransactions([])
    }
  }, [])

  useEffect(() => {
    const address = walletAddress || EIGENCLOUD_WALLET.address
    if (address) {
      setIsLoading(true)
      setError(null)

      Promise.all([
        fetchBalances(address),
        fetchTransactions(address)
      ]).finally(() => {
        setIsLoading(false)
      })
    }
  }, [walletAddress, fetchBalances, fetchTransactions])

  const copyAddress = () => {
    const address = walletAddress || EIGENCLOUD_WALLET.address
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const refreshData = () => {
    const address = walletAddress || EIGENCLOUD_WALLET.address
    if (address) {
      setIsLoading(true)
      Promise.all([
        fetchBalances(address),
        fetchTransactions(address)
      ]).finally(() => {
        setIsLoading(false)
      })
    }
  }

  const filteredTransactions = transactions.filter(tx => {
    if (activeTab === 'all') return true
    if (activeTab === 'earnings') return tx.type === 'earning'
    if (activeTab === 'spending') return tx.type === 'spending'
    return true
  })

  const explorerUrl = network === 'base'
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org'

  const displayAddress = walletAddress || EIGENCLOUD_WALLET.address

  if (!displayAddress && !walletAddress) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-6">
          <Wallet className="w-8 h-8 text-dark-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-dark-400 mb-8 max-w-md mx-auto">
          Connect your wallet to view your x402 payment dashboard and track your earnings
        </p>
        <button onClick={onConnect} className="btn-glow">
          Connect Wallet
        </button>
      </div>
    )
  }

  if (isLoading && !balances) {
    return (
      <div className="space-y-6">
        <div className="stat-card-accent p-8">
          <div className="skeleton-shimmer h-8 w-48 rounded-lg mb-4" />
          <div className="grid grid-cols-3 gap-8">
            <div className="skeleton-shimmer h-20 rounded-lg" />
            <div className="skeleton-shimmer h-20 rounded-lg" />
            <div className="skeleton-shimmer h-20 rounded-lg" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="skeleton-shimmer h-48 rounded-xl" />
          <div className="skeleton-shimmer h-48 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Wallet Header */}
      <div className="stat-card-accent p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-accent-400" />
              <span className="text-sm text-accent-300">EigenCloud Wallet</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg text-white">
                {truncateAddress(displayAddress)}
              </span>
              <button
                onClick={copyAddress}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-white" />
                )}
              </button>
              <a
                href={`${explorerUrl}/address/${displayAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-white" />
              </a>
              <button
                onClick={refreshData}
                disabled={isLoading}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RefreshCw className={cn("w-4 h-4 text-white", isLoading && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-white capitalize">{network}</span>
          </div>
        </div>

        {/* Balance Display */}
        <div className="grid grid-cols-3 gap-8">
          <div>
            <div className="text-sm text-accent-300/80 mb-1">USDC Balance</div>
            <div className="text-3xl font-bold text-white">
              ${balances?.usdc.balanceFormatted || '0.00'}
            </div>
            <div className="text-sm text-accent-400 mt-1">USDC</div>
          </div>
          <div>
            <div className="text-sm text-accent-300/80 mb-1">ETH Balance</div>
            <div className="text-2xl font-bold text-emerald-400">
              {balances?.native.balanceFormatted || '0.0000'}
            </div>
            <div className="text-sm text-dark-400 mt-1">ETH</div>
          </div>
          <div>
            <div className="text-sm text-accent-300/80 mb-1">USD Value</div>
            <div className="text-2xl font-bold text-amber-400">
              ${((parseFloat(balances?.usdc.balanceFormatted || '0') + parseFloat(balances?.native.usdValue || '0'))).toFixed(2)}
            </div>
            <div className="text-sm text-dark-400 mt-1">Total</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="font-medium text-white">Receive</span>
            </div>
          </div>
          <p className="text-dark-400 text-sm mb-3">
            Share your wallet address to receive payments
          </p>
          <button
            onClick={copyAddress}
            className="w-full btn-secondary text-sm py-2"
          >
            {copied ? 'Address Copied!' : 'Copy Address'}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent-500/20">
                <Send className="w-5 h-5 text-accent-400" />
              </div>
              <span className="font-medium text-white">Send</span>
            </div>
          </div>
          <p className="text-dark-400 text-sm mb-3">
            Transfer tokens to another address
          </p>
          <a
            href={`${explorerUrl}/address/${displayAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full btn-secondary text-sm py-2 flex items-center justify-center gap-2"
          >
            View on Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </motion.div>
      </div>

      {/* Recent Transactions */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-dark-700/50">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Recent Transactions</h3>
            <div className="flex gap-1 p-1 bg-dark-800/50 rounded-lg">
              {(['all', 'earnings', 'spending'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm transition-colors capitalize',
                    activeTab === tab
                      ? 'bg-accent-600/20 text-accent-400'
                      : 'text-dark-400 hover:text-white'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-dark-800/50">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 text-dark-500 animate-spin mx-auto mb-2" />
              <p className="text-dark-400">Loading transactions...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-dark-400">No transactions found</p>
              <a
                href={`${explorerUrl}/address/${displayAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-400 text-sm mt-2 inline-flex items-center gap-1 hover:underline"
              >
                View all on Explorer <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            filteredTransactions.map((tx, index) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 hover:bg-dark-800/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      tx.type === 'earning' ? 'bg-emerald-500/20' : 'bg-accent-500/20'
                    )}>
                      {tx.type === 'earning' ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-accent-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{tx.tool}</span>
                        <span className={cn(
                          'badge text-xs',
                          tx.status === 'completed' && 'badge-success',
                          tx.status === 'pending' && 'badge-warning',
                          tx.status === 'failed' && 'badge-error'
                        )}>
                          {tx.status}
                        </span>
                      </div>
                      <div className="text-sm text-dark-500">
                        {tx.type === 'earning' ? 'From' : 'To'}: {tx.counterparty}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'font-semibold',
                      tx.type === 'earning' ? 'text-emerald-400' : 'text-accent-400'
                    )}>
                      {tx.type === 'earning' ? '+' : '-'}{tx.amount} ETH
                    </div>
                    <div className="text-sm text-dark-500">
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {tx.txHash && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-dark-500">TX:</span>
                    <a
                      href={`${explorerUrl}/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-400 hover:text-accent-300 flex items-center gap-1 font-mono text-xs"
                    >
                      {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm text-center">{error}</div>
      )}
    </div>
  )
}
