'use client'

import { ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ErrorBoundary>
  )
}
