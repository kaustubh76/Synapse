'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type TransactionState = 'pending' | 'confirming' | 'confirmed' | 'failed'

export interface TransactionInfo {
  hash: string
  state: TransactionState
  blockNumber?: number
  gasUsed?: string
  timestamp?: number
  description?: string
  explorerUrl?: string
}

interface TransactionStatusProps {
  transaction: TransactionInfo
  className?: string
  compact?: boolean
}

// Get status config
function getStatusConfig(state: TransactionState) {
  switch (state) {
    case 'pending':
      return {
        icon: Clock,
        label: 'Pending',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-400/10',
        borderColor: 'border-yellow-400/30',
      }
    case 'confirming':
      return {
        icon: Loader2,
        label: 'Confirming',
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/10',
        borderColor: 'border-blue-400/30',
        animate: true,
      }
    case 'confirmed':
      return {
        icon: CheckCircle,
        label: 'Confirmed',
        color: 'text-green-400',
        bgColor: 'bg-green-400/10',
        borderColor: 'border-green-400/30',
      }
    case 'failed':
      return {
        icon: XCircle,
        label: 'Failed',
        color: 'text-red-400',
        bgColor: 'bg-red-400/10',
        borderColor: 'border-red-400/30',
      }
  }
}

// Format transaction hash for display
function formatHash(hash: string): string {
  if (!hash || hash.length < 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

// Get BaseScan URL
function getExplorerUrl(hash: string, network: string = 'base-sepolia'): string {
  const baseUrls: Record<string, string> = {
    'base-sepolia': 'https://sepolia.basescan.org/tx/',
    'base': 'https://basescan.org/tx/',
    'ethereum': 'https://etherscan.io/tx/',
    'sepolia': 'https://sepolia.etherscan.io/tx/',
  }
  return `${baseUrls[network] || baseUrls['base-sepolia']}${hash}`
}

export function TransactionStatus({
  transaction,
  className,
  compact = false,
}: TransactionStatusProps) {
  const [copied, setCopied] = useState(false)
  const config = getStatusConfig(transaction.state)
  const Icon = config.icon

  const copyHash = async () => {
    await navigator.clipboard.writeText(transaction.hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const explorerUrl = transaction.explorerUrl || getExplorerUrl(transaction.hash)

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <Icon
          className={cn(
            'w-4 h-4',
            config.color,
            config.animate && 'animate-spin'
          )}
        />
        <span className={cn('text-sm', config.color)}>{config.label}</span>
        {transaction.hash && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              'w-5 h-5',
              config.color,
              config.animate && 'animate-spin'
            )}
          />
          <span className={cn('font-medium', config.color)}>{config.label}</span>
        </div>
        {transaction.timestamp && (
          <span className="text-xs text-gray-500">
            {new Date(transaction.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Description */}
      {transaction.description && (
        <p className="text-sm text-gray-400 mb-3">{transaction.description}</p>
      )}

      {/* Transaction Hash */}
      {transaction.hash && (
        <div className="flex items-center gap-2 bg-gray-800/50 rounded-lg p-2 mb-3">
          <code className="flex-1 text-xs font-mono text-gray-300 truncate">
            {formatHash(transaction.hash)}
          </code>
          <button
            onClick={copyHash}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Copy transaction hash"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-gray-400" />
            )}
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="View on Explorer"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        </div>
      )}

      {/* Additional Info */}
      {(transaction.blockNumber || transaction.gasUsed) && (
        <div className="flex gap-4 text-xs text-gray-500">
          {transaction.blockNumber && (
            <span>Block: #{transaction.blockNumber.toLocaleString()}</span>
          )}
          {transaction.gasUsed && <span>Gas: {transaction.gasUsed}</span>}
        </div>
      )}
    </div>
  )
}

// Progress steps visualization for multi-step transactions
export function TransactionProgress({
  steps,
  currentStep,
  className,
}: {
  steps: string[]
  currentStep: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isPending = index > currentStep

        return (
          <div key={step} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  isCompleted && 'bg-green-500 text-white',
                  isCurrent && 'bg-blue-500 text-white',
                  isPending && 'bg-gray-700 text-gray-400'
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  'mt-1 text-xs',
                  isCompleted && 'text-green-400',
                  isCurrent && 'text-blue-400',
                  isPending && 'text-gray-500'
                )}
              >
                {step}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  index < currentStep ? 'bg-green-500' : 'bg-gray-700'
                )}
              >
                {isCurrent && (
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatType: 'reverse',
                    }}
                    className="h-full bg-blue-500"
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Inline transaction link
export function TransactionLink({
  hash,
  network = 'base-sepolia',
  label,
  className,
}: {
  hash: string
  network?: string
  label?: string
  className?: string
}) {
  const url = getExplorerUrl(hash, network)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors',
        className
      )}
    >
      {label || formatHash(hash)}
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}
