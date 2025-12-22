'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Wallet, BarChart3, TrendingUp, Grid,
  RefreshCw, Settings, Wifi, WifiOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSocket } from '@/hooks/useSocket'

import {
  WalletDashboard,
  AgentEconomyStats,
  EarningsDashboard,
  ToolRegistryBrowser
} from '@/components/x402'

type TabType = 'economy' | 'wallet' | 'earnings' | 'tools'

export default function X402Page() {
  const { isConnected } = useSocket()
  const [activeTab, setActiveTab] = useState<TabType>('economy')
  const [walletAddress, setWalletAddress] = useState<string | undefined>(undefined)
  const [isConnecting, setIsConnecting] = useState(false)

  const handleConnect = async () => {
    setIsConnecting(true)
    // Simulate wallet connection - in production, use wagmi/viem
    await new Promise(resolve => setTimeout(resolve, 1500))
    setWalletAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f3Ed7d')
    setIsConnecting(false)
  }

  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
    { id: 'economy', label: 'Economy', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'wallet', label: 'Wallet', icon: <Wallet className="w-4 h-4" /> },
    { id: 'earnings', label: 'Earnings', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'tools', label: 'Tool Registry', icon: <Grid className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Dashboard
              </Link>
              <div className="h-6 w-px bg-gray-700" />
              <div>
                <h1 className="text-xl font-bold text-white">x402 Payment Protocol</h1>
                <p className="text-xs text-gray-500">Agent Economy Infrastructure</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {walletAddress ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg">
                  <div className="w-2 h-2 bg-green-400 rounded-full" />
                  <span className="text-sm text-white font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-4 py-2 bg-synapse-600 hover:bg-synapse-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isConnecting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              )}

              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
                isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              )}>
                {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {isConnected ? 'Live' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-t-lg text-sm font-medium transition-colors relative',
                  activeTab === tab.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-synapse-500"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
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
              onCallTool={(tool) => console.log('Call tool:', tool)}
            />
          )}
        </motion.div>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-4">
              <span>Network: Base Sepolia</span>
              <span>•</span>
              <span>Protocol Version: 1.0.0</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/anthropics/x402"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                x402 Protocol Spec
              </a>
              <a
                href="https://basescan.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Block Explorer
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
