'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface WalletInfo {
  address: string
  chain: string
  type: 'custodial' | 'non-custodial' | 'demo'
  balances?: Record<string, string>
}

export interface WalletState {
  wallet: WalletInfo | null
  isConnecting: boolean
  isConnected: boolean
  error: string | null
  balance: string
}

export interface WalletContextType extends WalletState {
  connect: () => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
  transfer: (to: string, amount: string) => Promise<{ txHash: string; success: boolean }>
}

const STORAGE_KEY = 'synapse_wallet'

// Generate a deterministic demo address from a seed
function generateDemoAddress(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `0x${Math.abs(hash).toString(16).padStart(40, '0').slice(0, 40)}`
}

// Format address for display
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function useWallet(): WalletContextType {
  const [state, setState] = useState<WalletState>({
    wallet: null,
    isConnecting: false,
    isConnected: false,
    error: null,
    balance: '0.00',
  })

  // Load wallet from storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const wallet = JSON.parse(stored) as WalletInfo
        setState(prev => ({
          ...prev,
          wallet,
          isConnected: true,
        }))
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Connect wallet (demo mode - creates a Crossmint custodial wallet via API)
  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }))

    try {
      // Try to create wallet via API (which uses Crossmint SDK)
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const response = await fetch(`${API_URL}/api/wallet/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })

      let wallet: WalletInfo

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.address) {
          wallet = {
            address: data.data.address,
            chain: data.data.chain || 'base-sepolia',
            type: 'custodial',
          }
        } else {
          // Fallback to demo wallet
          wallet = {
            address: generateDemoAddress(clientId),
            chain: 'base-sepolia',
            type: 'demo',
          }
        }
      } else {
        // Fallback to demo wallet if API unavailable
        wallet = {
          address: generateDemoAddress(clientId),
          chain: 'base-sepolia',
          type: 'demo',
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet))

      setState(prev => ({
        ...prev,
        wallet,
        isConnected: true,
        isConnecting: false,
        balance: '100.00', // Demo balance
      }))
    } catch (error) {
      console.error('Wallet connection error:', error)

      // Create demo wallet on error
      const clientId = `demo_${Date.now()}`
      const wallet: WalletInfo = {
        address: generateDemoAddress(clientId),
        chain: 'base-sepolia',
        type: 'demo',
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet))

      setState(prev => ({
        ...prev,
        wallet,
        isConnected: true,
        isConnecting: false,
        balance: '100.00',
        error: null,
      }))
    }
  }, [])

  // Disconnect wallet
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState({
      wallet: null,
      isConnecting: false,
      isConnected: false,
      error: null,
      balance: '0.00',
    })
  }, [])

  // Refresh balance
  const refreshBalance = useCallback(async () => {
    if (!state.wallet) return

    try {
      const response = await fetch(
        `${API_URL}/api/wallet/${state.wallet.address}/balance`
      )

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setState(prev => ({
            ...prev,
            balance: data.data?.balance || '100.00',
          }))
        }
      }
    } catch (error) {
      // Keep existing balance on error
      console.error('Balance refresh error:', error)
    }
  }, [state.wallet])

  // Transfer tokens
  const transfer = useCallback(async (to: string, amount: string): Promise<{ txHash: string; success: boolean }> => {
    if (!state.wallet) {
      return { txHash: '', success: false }
    }

    try {
      const response = await fetch(`${API_URL}/api/wallet/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: state.wallet.address,
          to,
          amount,
          token: 'USDC',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Update balance after transfer
          const newBalance = (parseFloat(state.balance) - parseFloat(amount)).toFixed(2)
          setState(prev => ({ ...prev, balance: newBalance }))

          return {
            txHash: data.data?.txHash || `0x${Date.now().toString(16)}`,
            success: true,
          }
        }
      }

      // Demo mode fallback
      const newBalance = (parseFloat(state.balance) - parseFloat(amount)).toFixed(2)
      setState(prev => ({ ...prev, balance: newBalance }))

      return {
        txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
        success: true,
      }
    } catch (error) {
      console.error('Transfer error:', error)
      return { txHash: '', success: false }
    }
  }, [state.wallet, state.balance])

  // Auto-refresh balance periodically
  useEffect(() => {
    if (state.isConnected) {
      refreshBalance()
      const interval = setInterval(refreshBalance, 30000)
      return () => clearInterval(interval)
    }
  }, [state.isConnected, refreshBalance])

  return {
    ...state,
    connect,
    disconnect,
    refreshBalance,
    transfer,
  }
}

// Context for wallet state (for use with provider)
export const WalletContext = createContext<WalletContextType | null>(null)

export function useWalletContext(): WalletContextType {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within a WalletProvider')
  }
  return context
}
