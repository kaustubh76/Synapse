'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, ArrowRight, CheckCircle, Wallet, Receipt } from 'lucide-react'
import { cn, formatUSD } from '@/lib/utils'

interface PaymentFlowProps {
  status: 'idle' | 'initiating' | 'signing' | 'confirming' | 'completed'
  amount?: number
  txHash?: string
  provider?: string
  onClose?: () => void
}

const steps = [
  { id: 'initiating', label: 'Creating Payment', icon: Wallet },
  { id: 'signing', label: 'Signing Transaction', icon: CreditCard },
  { id: 'confirming', label: 'Confirming', icon: Receipt },
  { id: 'completed', label: 'Payment Complete', icon: CheckCircle }
]

export function PaymentFlow({ status, amount, txHash, provider, onClose }: PaymentFlowProps) {
  if (status === 'idle') return null

  const currentStepIndex = steps.findIndex(s => s.id === status)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed bottom-4 right-4 w-80 bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-gray-700 shadow-2xl overflow-hidden z-50"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-synapse-600 to-neural-600 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <CreditCard className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white text-sm">x402 Payment</span>
            </div>
            {amount !== undefined && (
              <span className="font-bold text-white">{formatUSD(amount)}</span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="p-4">
          <div className="space-y-3">
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex
              const isCompleted = index < currentStepIndex
              const isPending = index > currentStepIndex
              const Icon = step.icon

              return (
                <motion.div
                  key={step.id}
                  initial={false}
                  animate={{
                    opacity: isPending ? 0.5 : 1,
                    scale: isActive ? 1.02 : 1
                  }}
                  className="flex items-center gap-3"
                >
                  {/* Icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                    isCompleted ? 'bg-green-500/20 text-green-400' :
                    isActive ? 'bg-synapse-500/20 text-synapse-400' :
                    'bg-gray-800 text-gray-500'
                  )}>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex-1">
                    <span className={cn(
                      'text-sm',
                      isCompleted ? 'text-green-400' :
                      isActive ? 'text-white' :
                      'text-gray-500'
                    )}>
                      {step.label}
                    </span>
                    {isActive && status !== 'completed' && (
                      <motion.div
                        className="h-0.5 bg-synapse-500 rounded mt-1"
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </div>

                  {/* Status */}
                  {isActive && status !== 'completed' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-synapse-400 border-t-transparent rounded-full"
                    />
                  )}
                </motion.div>
              )
            })}
          </div>

          {/* Transaction Details */}
          {status === 'completed' && txHash && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 pt-4 border-t border-gray-800"
            >
              <div className="text-xs text-gray-400 space-y-2">
                <div className="flex justify-between">
                  <span>Transaction Hash:</span>
                  <a
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-synapse-400 hover:underline font-mono"
                  >
                    {txHash.slice(0, 10)}...
                  </a>
                </div>
                {provider && (
                  <div className="flex justify-between">
                    <span>Provider:</span>
                    <span className="font-mono text-gray-300">{provider.slice(0, 12)}...</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Network:</span>
                  <span className="text-gray-300">Base Sepolia</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full mt-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Close
              </button>
            </motion.div>
          )}
        </div>

        {/* x402 Badge */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-2 py-2 bg-gray-800/50 rounded-lg">
            <span className="text-xs text-gray-500">Powered by</span>
            <span className="font-mono text-synapse-400 text-sm font-semibold">x402</span>
            <span className="text-xs text-gray-500">protocol</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
