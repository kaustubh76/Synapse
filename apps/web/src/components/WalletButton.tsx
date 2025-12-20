'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, ChevronDown, Copy, ExternalLink, LogOut, RefreshCw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAddress } from '@/hooks/useWallet'

interface WalletButtonProps {
  wallet: {
    address: string
    chain: string
    type: 'custodial' | 'non-custodial' | 'demo'
  } | null
  balance: string
  isConnecting: boolean
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
  onRefreshBalance: () => void
}

export function WalletButton({
  wallet,
  balance,
  isConnecting,
  isConnected,
  onConnect,
  onDisconnect,
  onRefreshBalance,
}: WalletButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isConnected) {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onConnect}
        disabled={isConnecting}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all',
          'bg-gradient-to-r from-synapse-500 to-neural-500',
          'hover:from-synapse-400 hover:to-neural-400',
          'text-white shadow-lg shadow-synapse-500/20',
          isConnecting && 'opacity-70 cursor-wait'
        )}
      >
        {isConnecting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </>
        )}
      </motion.button>
    )
  }

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-3 px-4 py-2 rounded-xl transition-all',
          'bg-gray-800/80 border border-gray-700 hover:border-gray-600',
          'text-white'
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-synapse-400 to-neural-500 flex items-center justify-center">
            <Wallet className="w-3 h-3 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium">{formatAddress(wallet?.address || '')}</div>
            <div className="text-xs text-gray-400">${balance} USDC</div>
          </div>
        </div>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 top-full mt-2 w-72 z-20"
            >
              <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
                {/* Wallet Info */}
                <div className="p-4 border-b border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">
                      {wallet?.type === 'demo' ? 'Demo Wallet' : 'Crossmint Wallet'}
                    </span>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      'bg-green-500/20 text-green-400'
                    )}>
                      {wallet?.chain}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                    <code className="text-sm text-gray-300 font-mono">
                      {formatAddress(wallet?.address || '')}
                    </code>
                    <button
                      onClick={copyAddress}
                      className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Copy address"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div className="p-4 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Balance</div>
                      <div className="text-2xl font-bold text-white">${balance}</div>
                      <div className="text-xs text-gray-500">USDC on Base Sepolia</div>
                    </div>
                    <button
                      onClick={onRefreshBalance}
                      className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Refresh balance"
                    >
                      <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-2">
                  {wallet?.type !== 'demo' && (
                    <a
                      href={`https://sepolia.basescan.org/address/${wallet?.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on Explorer
                    </a>
                  )}
                  <button
                    onClick={() => {
                      onDisconnect()
                      setIsOpen(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>

                {/* Demo Notice */}
                {wallet?.type === 'demo' && (
                  <div className="px-4 py-3 bg-yellow-500/10 border-t border-yellow-500/20">
                    <div className="text-xs text-yellow-400">
                      This is a demo wallet. Transactions are simulated.
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
