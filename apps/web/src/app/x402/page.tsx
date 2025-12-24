'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Wallet, BarChart3, TrendingUp, Grid,
  RefreshCw, Wifi, WifiOff, Zap, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSocket } from '@/hooks/useSocket'

import {
  WalletDashboard,
  AgentEconomyStats,
  EarningsDashboard,
  ToolRegistryBrowser,
  ToolExecutionModal
} from '@/components/x402'

type TabType = 'economy' | 'wallet' | 'earnings' | 'tools'

interface RegisteredTool {
  id: string
  name: string
  description: string
  category: string
  pricing: {
    basePrice: string
    currency: string
    model: string
  }
  provider: {
    address: string
    name: string
    verified: boolean
    reputation: number
  }
  stats: any
  tags: string[]
  schema: any
  status: string
  createdAt: number
}

interface WalletData {
  id: string
  address: string
  chain: string
  type: string
  linkedUser: string
}

export default function X402Page() {
  const { isConnected } = useSocket()
  const [activeTab, setActiveTab] = useState<TabType>('economy')
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | undefined>(undefined)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [selectedTool, setSelectedTool] = useState<RegisteredTool | null>(null)
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false)

  const handleCallTool = useCallback((tool: RegisteredTool) => {
    setSelectedTool(tool)
    setIsExecutionModalOpen(true)
  }, [])

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    setConnectionError(null)

    try {
      // Create or get wallet via Crossmint API
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          linkedUser: `synapse-agent-${Date.now()}`,
          chain: 'base-sepolia',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create wallet')
      }

      if (data.success && data.wallet) {
        setWalletData(data.wallet)
        setWalletAddress(data.wallet.address)
        console.log('[x402] Wallet connected:', data.wallet)
      } else {
        throw new Error('Invalid wallet response')
      }
    } catch (error) {
      console.error('[x402] Wallet connection error:', error)
      setConnectionError(error instanceof Error ? error.message : 'Connection failed')

      // Fallback to demo mode if API fails
      const demoAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f3Ed7d'
      setWalletAddress(demoAddress)
      setWalletData({
        id: 'demo-wallet',
        address: demoAddress,
        chain: 'base-sepolia',
        type: 'demo',
        linkedUser: 'demo-agent',
      })
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
    { id: 'economy', label: 'Economy', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'wallet', label: 'Wallet', icon: <Wallet className="w-4 h-4" /> },
    { id: 'earnings', label: 'Earnings', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'tools', label: 'Tool Registry', icon: <Grid className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-dark-950 bg-mesh">
      {/* Ambient glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 glass-dark border-b border-dark-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors group"
              >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div className="divider-vertical" />
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-accent-400" />
                  <h1 className="text-xl font-bold text-white">x402 Protocol</h1>
                </div>
                <p className="text-xs text-dark-500 mt-0.5">Agent Economy Infrastructure</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {connectionError && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-xs">
                  <AlertCircle className="w-3 h-3" />
                  <span>Demo Mode</span>
                </div>
              )}
              {walletAddress ? (
                <div className="flex items-center gap-2 px-4 py-2 glass rounded-lg">
                  <div className={cn(
                    "status-dot live-indicator",
                    walletData?.type === 'demo' ? 'status-dot-warning' : 'status-dot-online'
                  )} />
                  <span className="text-sm text-white font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="btn-glow flex items-center gap-2 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  {isConnecting ? 'Creating Wallet...' : 'Connect Wallet'}
                </button>
              )}

              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-dark-800/50 text-dark-400 border border-dark-700/50'
              )}>
                {isConnected ? (
                  <>
                    <span className="status-dot status-dot-online live-indicator" />
                    <span>Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4" />
                    <span>Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto pb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all',
                  'rounded-t-lg whitespace-nowrap',
                  activeTab === tab.id
                    ? 'text-accent-400'
                    : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/30'
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500"
                    style={{ borderRadius: '2px 2px 0 0' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        {/* Gradient border at bottom */}
        <div className="divider-glow" />
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {activeTab === 'economy' && (
              <AgentEconomyStats />
            )}

            {activeTab === 'wallet' && (
              <WalletDashboard
                walletAddress={walletAddress}
                network="base-sepolia"
                onConnect={handleConnect}
              />
            )}

            {activeTab === 'earnings' && (
              <EarningsDashboard
                providerId={walletAddress}
                onWithdraw={() => console.log('Withdraw clicked')}
              />
            )}

            {activeTab === 'tools' && (
              <ToolRegistryBrowser
                onToolSelect={(tool) => console.log('Selected tool:', tool)}
                onCallTool={handleCallTool}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 glass-dark border-t border-dark-800/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-dark-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="status-dot status-dot-online" />
                <span>Base Sepolia</span>
              </div>
              <div className="divider-vertical" />
              <span>Protocol v1.0.0</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/anthropics/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent-400 transition-colors"
              >
                Protocol Spec
              </a>
              <a
                href="https://sepolia.basescan.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent-400 transition-colors"
              >
                Block Explorer
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Tool Execution Modal */}
      <ToolExecutionModal
        isOpen={isExecutionModalOpen}
        onClose={() => setIsExecutionModalOpen(false)}
        tool={selectedTool}
        walletAddress={walletAddress}
      />
    </div>
  )
}
