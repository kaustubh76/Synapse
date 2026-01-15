'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, ChevronDown, Copy, ExternalLink, LogOut, RefreshCw, Check, AlertTriangle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatAddress, DemoModeReason } from '@/hooks/useWallet'

interface WalletButtonProps {
  wallet: {
    address: string
    chain: string
    type: 'custodial' | 'non-custodial' | 'demo'
  } | null
  balance: string
  isConnecting: boolean
  isConnected: boolean
  isDemoMode?: boolean
  demoModeReason?: DemoModeReason
  lastConnectionError?: string | null
  onConnect: () => void
  onDisconnect: () => void
  onRefreshBalance: () => void
  onRetryRealWallet?: () => void
}

// Get human-readable reason for demo mode
function getDemoModeMessage(reason: DemoModeReason): string {
  switch (reason) {
    case 'api_unavailable':
      return 'Wallet API is unavailable'
    case 'api_error':
      return 'Wallet API returned an error'
    case 'network_error':
      return 'Network connection failed'
    case 'invalid_response':
      return 'Invalid wallet data received'
    default:
      return 'Using simulated transactions'
  }
}

export function WalletButton({
  wallet,
  balance,
  isConnecting,
  isConnected,
  isDemoMode = false,
  demoModeReason = null,
  lastConnectionError = null,
  onConnect,
  onDisconnect,
  onRefreshBalance,
  onRetryRealWallet,
}: WalletButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    if (onRetryRealWallet) {
      setIsRetrying(true)
      await onRetryRealWallet()
      setIsRetrying(false)
    }
  }

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
          'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium transition-all',
          'bg-gradient-to-r from-synapse-500 to-neural-500',
          'hover:from-synapse-400 hover:to-neural-400',
          'text-white shadow-lg shadow-synapse-500/20 text-sm sm:text-base',
          isConnecting && 'opacity-70 cursor-wait'
        )}
      >
        {isConnecting ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            <span className="hidden xs:inline">Connecting...</span>
          </>
        ) : (
          <>
            <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Connect</span>
            <span className="hidden sm:inline"> Wallet</span>
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
          'flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all',
          'bg-gray-800/80 border hover:border-gray-600',
          'text-white',
          isDemoMode ? 'border-yellow-500/50' : 'border-gray-700'
        )}
      >
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className={cn(
            'w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center flex-shrink-0',
            isDemoMode
              ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
              : 'bg-gradient-to-br from-synapse-400 to-neural-500'
          )}>
            {isDemoMode ? (
              <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
            ) : (
              <Wallet className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
            )}
          </div>
          <div className="text-left hidden xs:block">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="text-xs sm:text-sm font-medium">{formatAddress(wallet?.address || '')}</span>
              {isDemoMode && (
                <span className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-yellow-500/20 text-yellow-400 rounded">
                  Demo
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-400">
              {isDemoMode ? 'Simulated' : `$${balance} USDC`}
            </div>
          </div>
        </div>
        <ChevronDown className={cn(
          'w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 transition-transform',
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

                {/* Demo Notice with Retry Option */}
                {isDemoMode && (
                  <div className="px-4 py-3 bg-yellow-500/10 border-t border-yellow-500/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-yellow-400">
                          Demo Mode Active
                        </div>
                        <div className="text-xs text-yellow-400/70 mt-0.5">
                          {getDemoModeMessage(demoModeReason)}
                        </div>
                        {lastConnectionError && (
                          <div className="text-[10px] text-yellow-400/50 mt-1 font-mono">
                            {lastConnectionError.slice(0, 80)}
                          </div>
                        )}
                        {onRetryRealWallet && (
                          <button
                            onClick={handleRetry}
                            disabled={isRetrying}
                            className={cn(
                              'mt-2 flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded',
                              'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
                              'transition-colors',
                              isRetrying && 'opacity-50 cursor-wait'
                            )}
                          >
                            <RotateCcw className={cn('w-3 h-3', isRetrying && 'animate-spin')} />
                            {isRetrying ? 'Connecting...' : 'Try Real Wallet'}
                          </button>
                        )}
                      </div>
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
