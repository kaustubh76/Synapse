'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, CheckCircle, Clock, AlertCircle, ArrowRight, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubIntent {
  id: string
  type: string
  params: Record<string, any>
  budget: number
  status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed'
  result?: any
  dependencies: string[]
}

interface DecompositionPlan {
  id: string
  subIntents: SubIntent[]
  executionOrder: string[][]
  totalBudget: number
  status: 'planned' | 'executing' | 'completed' | 'failed'
}

interface Props {
  plan: DecompositionPlan | null
  onClose?: () => void
}

const statusIcons = {
  pending: Clock,
  ready: Zap,
  executing: Clock,
  completed: CheckCircle,
  failed: AlertCircle
}

const statusColors = {
  pending: 'text-gray-400 bg-gray-800',
  ready: 'text-yellow-400 bg-yellow-900/30',
  executing: 'text-blue-400 bg-blue-900/30 animate-pulse',
  completed: 'text-green-400 bg-green-900/30',
  failed: 'text-red-400 bg-red-900/30'
}

export function DecompositionView({ plan, onClose }: Props) {
  if (!plan) return null

  const completedCount = plan.subIntents.filter(s => s.status === 'completed').length
  const progress = (completedCount / plan.subIntents.length) * 100

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-neural-500/20">
            <GitBranch className="w-5 h-5 text-neural-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Intent Decomposition</h3>
            <p className="text-xs text-gray-400">
              Complex intent broken into {plan.subIntents.length} sub-tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-2 py-1 rounded text-xs font-medium',
            plan.status === 'completed' ? 'bg-green-900/30 text-green-400' :
            plan.status === 'failed' ? 'bg-red-900/30 text-red-400' :
            'bg-blue-900/30 text-blue-400'
          )}>
            {plan.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Progress</span>
          <span>{completedCount}/{plan.subIntents.length} completed</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-gradient-to-r from-synapse-500 to-neural-500"
          />
        </div>
      </div>

      {/* Execution Flow */}
      <div className="space-y-3">
        {plan.executionOrder.map((batch, batchIndex) => (
          <div key={batchIndex} className="relative">
            {/* Batch label */}
            {batchIndex > 0 && (
              <div className="flex items-center justify-center my-2">
                <ArrowRight className="w-4 h-4 text-gray-600" />
              </div>
            )}

            {/* Sub-intents in this batch (parallel) */}
            <div className={cn(
              'grid gap-2',
              batch.length === 1 ? 'grid-cols-1' :
              batch.length === 2 ? 'grid-cols-2' :
              'grid-cols-3'
            )}>
              {batch.map(subIntentId => {
                const subIntent = plan.subIntents.find(s => s.id === subIntentId)
                if (!subIntent) return null

                const StatusIcon = statusIcons[subIntent.status]

                return (
                  <motion.div
                    key={subIntent.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: batchIndex * 0.1 }}
                    className={cn(
                      'p-3 rounded-lg border transition-all duration-300',
                      subIntent.status === 'executing' ? 'border-blue-500/50' :
                      subIntent.status === 'completed' ? 'border-green-500/30' :
                      subIntent.status === 'failed' ? 'border-red-500/30' :
                      'border-gray-700',
                      'bg-gray-800/50'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('p-1 rounded', statusColors[subIntent.status])}>
                        <StatusIcon className="w-3 h-3" />
                      </span>
                      <span className="text-xs font-mono text-gray-300 truncate">
                        {subIntent.type}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 truncate">
                      {JSON.stringify(subIntent.params)}
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-synapse-400">
                        ${subIntent.budget.toFixed(4)}
                      </span>
                      {subIntent.status === 'completed' && subIntent.result && (
                        <CheckCircle className="w-3 h-3 text-green-400" />
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
        <div className="text-sm text-gray-400">
          Total Budget: <span className="text-synapse-400 font-medium">${plan.totalBudget.toFixed(4)}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </motion.div>
  )
}
