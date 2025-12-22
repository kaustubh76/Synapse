'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Wallet, ArrowUpRight, ArrowDownLeft, Copy, Check,
  TrendingUp, Shield, RefreshCw, ExternalLink
} from 'lucide-react'
import { cn, formatUSD, truncateAddress } from '@/lib/utils'

interface WalletStats {
  address: string
  balance: {
    total: string
    available: string
    locked: string
  }
  earnings: {
    total: string
    today: string
    thisWeek: string
  }
  spending: {
    total: string
    today: string
    thisWeek: string
  }
  transactionCount: number
  network: string
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

export function WalletDashboard({
  walletAddress,
  network = 'base-sepolia',
  onConnect
}: WalletDashboardProps) {
  const [stats, setStats] = useState<WalletStats | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'earnings' | 'spending'>('all')

  // Demo data for visualization
  useEffect(() => {
    if (walletAddress) {
      setIsLoading(true)
      // Simulate API call
      setTimeout(() => {
        setStats({
          address: walletAddress,
          balance: {
            total: '125.50',
            available: '120.00',
            locked: '5.50',
          },
          earnings: {
            total: '85.25',
            today: '12.50',
            thisWeek: '45.75',
          },
          spending: {
            total: '35.25',
            today: '2.50',
            thisWeek: '15.00',
          },
          transactionCount: 156,
          network,
        })
        setTransactions([
          {
            id: 'tx_1',
            type: 'earning',
            amount: '0.05',
            tool: 'deep_research',
            counterparty: '0x1234...5678',
            timestamp: Date.now() - 60000,
            status: 'completed',
            txHash: '0xabc...def',
          },
          {
            id: 'tx_2',
            type: 'spending',
            amount: '0.01',
            tool: 'weather_api',
            counterparty: '0x8765...4321',
            timestamp: Date.now() - 120000,
            status: 'completed',
            txHash: '0xdef...abc',
          },
          {
            id: 'tx_3',
            type: 'earning',
            amount: '0.10',
            tool: 'analysis',
            counterparty: '0xabcd...efgh',
            timestamp: Date.now() - 180000,
            status: 'completed',
          },
          {
            id: 'tx_4',
            type: 'spending',
            amount: '0.02',
            tool: 'crypto_price',
            counterparty: '0x9999...8888',
            timestamp: Date.now() - 240000,
            status: 'pending',
          },
        ])
        setIsLoading(false)
      }, 1000)
    }
  }, [walletAddress, network])

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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

  if (!walletAddress) {
    return (
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-8 text-center">
        <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 mb-6">
          Connect your wallet to view your x402 payment dashboard
        </p>
        <button
          onClick={onConnect}
          className="px-6 py-3 bg-synapse-600 hover:bg-synapse-500 text-white rounded-lg font-medium transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Wallet Header */}
      <div className="bg-gradient-to-r from-synapse-900 to-purple-900 rounded-xl p-6 border border-synapse-700">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-5 h-5 text-synapse-400" />
              <span className="text-sm text-synapse-300">Agent Wallet</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg text-white">
                {truncateAddress(walletAddress)}
              </span>
              <button
                onClick={copyAddress}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-white" />
                )}
              </button>
              <a
                href={`${explorerUrl}/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-white" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-sm text-white capitalize">{network}</span>
          </div>
        </div>

        {/* Balance Display */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-synapse-300 mb-1">Total Balance</div>
              <div className="text-3xl font-bold text-white">
                ${stats.balance.total}
              </div>
              <div className="text-sm text-synapse-400">USDC</div>
            </div>
            <div>
              <div className="text-sm text-synapse-300 mb-1">Available</div>
              <div className="text-2xl font-bold text-green-400">
                ${stats.balance.available}
              </div>
            </div>
            <div>
              <div className="text-sm text-synapse-300 mb-1">Locked</div>
              <div className="text-2xl font-bold text-yellow-400">
                ${stats.balance.locked}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Earnings Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 rounded-xl p-5 border border-gray-800"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <ArrowDownLeft className="w-5 h-5 text-green-400" />
                </div>
                <span className="font-medium text-white">Earnings</span>
              </div>
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Earned</span>
                <span className="text-white font-semibold">${stats.earnings.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Today</span>
                <span className="text-green-400 font-medium">+${stats.earnings.today}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">This Week</span>
                <span className="text-green-400 font-medium">+${stats.earnings.thisWeek}</span>
              </div>
            </div>
          </motion.div>

          {/* Spending Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-900/50 rounded-xl p-5 border border-gray-800"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <ArrowUpRight className="w-5 h-5 text-blue-400" />
                </div>
                <span className="font-medium text-white">Spending</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Spent</span>
                <span className="text-white font-semibold">${stats.spending.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Today</span>
                <span className="text-blue-400 font-medium">-${stats.spending.today}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">This Week</span>
                <span className="text-blue-400 font-medium">-${stats.spending.thisWeek}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Recent Transactions</h3>
            <div className="flex gap-1">
              {(['all', 'earnings', 'spending'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-sm transition-colors capitalize',
                    activeTab === tab
                      ? 'bg-synapse-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 text-gray-600 animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Loading transactions...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400">No transactions found</p>
            </div>
          ) : (
            filteredTransactions.map((tx, index) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      tx.type === 'earning' ? 'bg-green-500/20' : 'bg-blue-500/20'
                    )}>
                      {tx.type === 'earning' ? (
                        <ArrowDownLeft className="w-4 h-4 text-green-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{tx.tool}</span>
                        <span className={cn(
                          'px-2 py-0.5 rounded text-xs',
                          tx.status === 'completed' && 'bg-green-500/20 text-green-400',
                          tx.status === 'pending' && 'bg-yellow-500/20 text-yellow-400',
                          tx.status === 'failed' && 'bg-red-500/20 text-red-400'
                        )}>
                          {tx.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {tx.type === 'earning' ? 'From' : 'To'}: {tx.counterparty}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'font-semibold',
                      tx.type === 'earning' ? 'text-green-400' : 'text-blue-400'
                    )}>
                      {tx.type === 'earning' ? '+' : '-'}${tx.amount}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                {tx.txHash && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-gray-500">TX:</span>
                    <a
                      href={`${explorerUrl}/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-synapse-400 hover:text-synapse-300 flex items-center gap-1"
                    >
                      {tx.txHash}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
