'use client'

import { ReactNode } from 'react'
import { WalletContext, useWallet } from '@/hooks/useWallet'

interface WalletProviderProps {
  children: ReactNode
}

export function WalletProvider({ children }: WalletProviderProps) {
  const wallet = useWallet()

  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  )
}
