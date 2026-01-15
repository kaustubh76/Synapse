'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Brain, Wifi, WifiOff, Github, LayoutDashboard, Sparkles, Plug, Zap, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WalletButton } from '@/components/WalletButton'
import { MobileNav } from '@/components/MobileNav'
import { useWalletContext } from '@/hooks/useWallet'

interface HeaderProps {
  isConnected: boolean
}

export function Header({ isConnected }: HeaderProps) {
  const walletContext = useWalletContext()

  // Provide safe defaults if context is undefined
  const wallet = walletContext ?? {
    wallet: null,
    balance: '0.00',
    isConnecting: false,
    isConnected: false,
    isDemoMode: false,
    demoModeReason: null,
    lastConnectionError: null,
    connect: async () => {},
    disconnect: () => {},
    refreshBalance: async () => {},
    retryRealWallet: async () => {},
  }

  return (
    <header className="glass-dark border-b border-dark-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 sm:gap-3"
            >
              <div className="relative">
                <Brain className="w-6 h-6 sm:w-8 sm:h-8 text-accent-400" />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-accent-400/20 rounded-full blur-md"
                />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold gradient-text">SYNAPSE</h1>
                <p className="text-[10px] sm:text-xs text-dark-400 hidden xs:block">Intent Network</p>
              </div>
            </motion.div>
          </Link>

          {/* Desktop Navigation - Hidden on mobile */}
          <div className="hidden md:flex items-center gap-2 lg:gap-4">
            {/* Full Demo Link */}
            <Link
              href="/demo"
              className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Zap className="w-4 h-4" />
              <span className="text-sm hidden lg:inline">Full Demo</span>
            </Link>

            {/* MCP Bilateral Link */}
            <Link
              href="/mcp"
              className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Plug className="w-4 h-4" />
              <span className="text-sm hidden lg:inline">MCP</span>
            </Link>

            {/* LLM Comparison Link */}
            <Link
              href="/llm"
              className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm hidden lg:inline">LLM Compare</span>
            </Link>

            {/* DeFi Link */}
            <Link
              href="/defi"
              className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600/50 to-cyan-600/50 text-emerald-400 hover:text-emerald-300 hover:from-emerald-600/70 hover:to-cyan-600/70 transition-colors border border-emerald-500/30"
            >
              <Coins className="w-4 h-4" />
              <span className="text-sm hidden lg:inline">DeFi</span>
            </Link>

            {/* Dashboard Link */}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm hidden lg:inline">Dashboard</span>
            </Link>
          </div>

          {/* Right side - Always visible */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Connection Status - Compact on mobile */}
            <div className={cn(
              'badge text-xs sm:text-sm',
              isConnected ? 'badge-success' : 'badge-error'
            )}>
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>

            {/* GitHub Link - hidden on mobile and tablet */}
            <a
              href="https://github.com/kaushtubh/synapse"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span className="text-sm">GitHub</span>
            </a>

            {/* Wallet Button - Responsive */}
            <WalletButton
              wallet={wallet.wallet}
              balance={wallet.balance}
              isConnecting={wallet.isConnecting}
              isConnected={wallet.isConnected}
              isDemoMode={wallet.isDemoMode}
              demoModeReason={wallet.demoModeReason}
              lastConnectionError={wallet.lastConnectionError}
              onConnect={wallet.connect}
              onDisconnect={wallet.disconnect}
              onRefreshBalance={wallet.refreshBalance}
              onRetryRealWallet={wallet.retryRealWallet}
            />

            {/* Mobile Navigation Toggle */}
            <MobileNav isConnected={isConnected} />
          </div>
        </div>
      </div>
    </header>
  )
}
