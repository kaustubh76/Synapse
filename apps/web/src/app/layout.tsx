import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { WalletProvider } from '@/components/WalletProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Synapse | Intent Network for AI Agents',
  description: 'Decentralized intent propagation network where AI agents compete to serve you. Built with x402 payments.',
  keywords: ['AI', 'agents', 'x402', 'blockchain', 'micropayments', 'intent network'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} neural-bg antialiased`}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
