'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface WalletInfo {
  address: string
  chain: string
  type: 'custodial' | 'non-custodial' | 'demo'
  walletId?: string // Crossmint wallet ID for API calls
  balances?: Record<string, string>
}

// Reason why we're using demo mode
export type DemoModeReason =
  | 'api_unavailable'
  | 'api_error'
  | 'network_error'
  | 'invalid_response'
  | null

export interface WalletState {
  wallet: WalletInfo | null
  isConnecting: boolean
  isConnected: boolean
  error: string | null
  balance: string
  // New: track demo mode status
  isDemoMode: boolean
  demoModeReason: DemoModeReason
  // New: last error for user feedback
  lastConnectionError: string | null
}

export interface WalletContextType extends WalletState {
  connect: () => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
  transfer: (to: string, amount: string) => Promise<{ txHash: string; success: boolean }>
  // New: retry real wallet connection
  retryRealWallet: () => Promise<void>
  // New: clear error
  clearError: () => void
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

// Demo balance - clearly marked as simulated
const DEMO_INITIAL_BALANCE = '0.00' // Start at 0, not fake $100

export function useWallet(): WalletContextType {
  const [state, setState] = useState<WalletState>({
    wallet: null,
    isConnecting: false,
    isConnected: false,
    error: null,
    balance: '0.00',
    isDemoMode: false,
    demoModeReason: null,
    lastConnectionError: null,
  })

  // Load wallet from storage on mount (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const wallet = JSON.parse(stored) as WalletInfo
        const isDemoMode = wallet.type === 'demo'
        setState(prev => ({
          ...prev,
          wallet,
          isConnected: true,
          isDemoMode,
          // Restore balance appropriately
          balance: isDemoMode ? DEMO_INITIAL_BALANCE : prev.balance,
        }))
      }
    } catch (e) {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [])

  // Helper to create demo wallet with reason tracking
  const createDemoWallet = useCallback((reason: DemoModeReason, errorMessage?: string) => {
    const clientId = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
      balance: DEMO_INITIAL_BALANCE,
      isDemoMode: true,
      demoModeReason: reason,
      lastConnectionError: errorMessage || null,
      error: null,
    }))

    return wallet
  }, [])

  // Connect wallet (creates a Crossmint MPC wallet via API)
  const connect = useCallback(async () => {
    setState(prev => ({
      ...prev,
      isConnecting: true,
      error: null,
      lastConnectionError: null,
    }))

    try {
      // Create wallet via API (which uses Crossmint SDK)
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const response = await fetch(`${API_URL}/api/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedUser: clientId }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.wallet?.address) {
          // Successfully created real wallet
          const wallet: WalletInfo = {
            address: data.wallet.address,
            chain: data.wallet.chain || 'base-sepolia',
            type: 'custodial',
            walletId: data.wallet.id,
          }

          localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet))

          setState(prev => ({
            ...prev,
            wallet,
            isConnected: true,
            isConnecting: false,
            balance: '0.00',
            isDemoMode: false,
            demoModeReason: null,
            lastConnectionError: null,
          }))
          return
        } else {
          // API responded but with invalid data
          console.warn('Invalid wallet response, falling back to demo mode')
          createDemoWallet('invalid_response', 'Wallet API returned invalid data')
          return
        }
      } else {
        // API error response
        const errorText = await response.text().catch(() => 'Unknown error')
        console.warn(`Wallet API error (${response.status}), falling back to demo mode`)
        createDemoWallet('api_error', `API error: ${response.status} - ${errorText.slice(0, 100)}`)
        return
      }
    } catch (error) {
      // Network error or other failure
      console.error('Wallet connection error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      createDemoWallet('network_error', errorMessage)
    }
  }, [createDemoWallet])

  // Disconnect wallet
  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setState({
      wallet: null,
      isConnecting: false,
      isConnected: false,
      error: null,
      balance: '0.00',
      isDemoMode: false,
      demoModeReason: null,
      lastConnectionError: null,
    })
  }, [])

  // Retry connecting with a real wallet (for users who want to retry after demo fallback)
  const retryRealWallet = useCallback(async () => {
    // First disconnect the demo wallet
    localStorage.removeItem(STORAGE_KEY)
    setState({
      wallet: null,
      isConnecting: false,
      isConnected: false,
      error: null,
      balance: '0.00',
      isDemoMode: false,
      demoModeReason: null,
      lastConnectionError: null,
    })
    // Then try to connect again
    await connect()
  }, [connect])

  // Clear error message
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, lastConnectionError: null, error: null }))
  }, [])

  // Refresh balance
  const refreshBalance = useCallback(async () => {
    if (!state.wallet) return

    // For demo wallets, just keep the existing balance
    if (state.wallet.type === 'demo' || !state.wallet.walletId) {
      return
    }

    try {
      const response = await fetch(
        `${API_URL}/api/wallet/balance?walletId=${state.wallet.walletId}`
      )

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.balances) {
          // Get USDC balance as primary balance
          const usdcBalance = data.balances.usdc?.balanceFormatted || '0.00'
          setState(prev => ({
            ...prev,
            balance: usdcBalance,
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

    // For demo wallets, simulate transfer
    if (state.wallet.type === 'demo' || !state.wallet.walletId) {
      const newBalance = (parseFloat(state.balance) - parseFloat(amount)).toFixed(2)
      setState(prev => ({ ...prev, balance: newBalance }))
      return {
        txHash: `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
        success: true,
      }
    }

    try {
      const response = await fetch(`${API_URL}/api/wallet/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: state.wallet.walletId,
          to,
          amount,
          token: 'USDC',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Refresh balance after transfer
          await refreshBalance()

          return {
            txHash: data.transaction?.txHash || `0x${Date.now().toString(16)}`,
            success: true,
          }
        }
      }

      // Fallback for failed API call
      return { txHash: '', success: false }
    } catch (error) {
      console.error('Transfer error:', error)
      return { txHash: '', success: false }
    }
  }, [state.wallet, state.balance, refreshBalance])

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
    retryRealWallet,
    clearError,
  }
}

// Default context value for SSR safety
const defaultContextValue: WalletContextType = {
  wallet: null,
  isConnecting: false,
  isConnected: false,
  error: null,
  balance: '0.00',
  isDemoMode: false,
  demoModeReason: null,
  lastConnectionError: null,
  connect: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
  transfer: async () => ({ txHash: '', success: false }),
  retryRealWallet: async () => {},
  clearError: () => {},
}

// Context for wallet state (for use with provider)
export const WalletContext = createContext<WalletContextType>(defaultContextValue)

export function useWalletContext(): WalletContextType {
  return useContext(WalletContext)
}
