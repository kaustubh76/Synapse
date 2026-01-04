'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Brain, Wifi, WifiOff, Github, LayoutDashboard, Sparkles, Plug, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WalletButton } from '@/components/WalletButton'
import { useWalletContext } from '@/hooks/useWallet'

interface HeaderProps {
  isConnected: boolean
}

export function Header({ isConnected }: HeaderProps) {
  const wallet = useWalletContext()

  return (
    <header className="glass-dark border-b border-dark-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <Brain className="w-8 h-8 text-accent-400" />
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-accent-400/20 rounded-full blur-md"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">SYNAPSE</h1>
              <p className="text-xs text-dark-400">Intent Network</p>
            </div>
          </motion.div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Full Demo Link */}
            <Link
              href="/demo"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Zap className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Full Demo</span>
            </Link>

            {/* MCP Bilateral Link */}
            <Link
              href="/mcp"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Plug className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">MCP</span>
            </Link>

            {/* LLM Comparison Link */}
            <Link
              href="/llm"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-800/50 text-accent-400 hover:text-accent-300 hover:bg-accent-800 transition-colors border border-accent-500/30"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">LLM Compare</span>
            </Link>

            {/* Dashboard Link */}
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Dashboard</span>
            </Link>

            {/* Connection Status */}
            <div className={cn(
              'badge',
              isConnected ? 'badge-success' : 'badge-error'
            )}>
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 mr-1.5" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </div>

            {/* GitHub Link - hidden on mobile */}
            <a
              href="https://github.com/kaushtubh/synapse"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span className="text-sm">GitHub</span>
            </a>

            {/* Wallet Button */}
            <WalletButton
              wallet={wallet.wallet}
              balance={wallet.balance}
              isConnecting={wallet.isConnecting}
              isConnected={wallet.isConnected}
              onConnect={wallet.connect}
              onDisconnect={wallet.disconnect}
              onRefreshBalance={wallet.refreshBalance}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
