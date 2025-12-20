'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Clock, Star, Shield, TrendingDown } from 'lucide-react'
import { cn, formatUSD, formatTime, getScoreColor, truncateAddress } from '@/lib/utils'

interface Bid {
  id: string
  providerAddress: string
  providerId: string
  bidAmount: number
  estimatedTime: number
  confidence: number
  reputationScore: number
  teeAttested: boolean
  calculatedScore: number
  rank: number
  status: string
}

interface BidVisualizationProps {
  bids: Bid[]
  maxBudget: number
  winnerId?: string
  isActive?: boolean
}

export function BidVisualization({ bids, maxBudget, winnerId, isActive }: BidVisualizationProps) {
  // Sort bids by score
  const sortedBids = [...bids].sort((a, b) => b.calculatedScore - a.calculatedScore)

  if (bids.length === 0) {
    return (
      <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-synapse-400" />
          Live Bids
          {isActive && (
            <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full animate-pulse">
              Waiting for bids...
            </span>
          )}
        </h3>
        <div className="text-center py-8 text-gray-500">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-4xl mb-2"
          >
            📡
          </motion.div>
          <p>Broadcasting intent to providers...</p>
          <p className="text-sm mt-1">Bids will appear here in real-time</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
    >
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <TrendingDown className="w-5 h-5 text-synapse-400" />
        Live Bids
        <span className="ml-2 px-2 py-0.5 bg-synapse-500/20 text-synapse-400 text-xs rounded-full">
          {bids.length} bids
        </span>
        {isActive && (
          <span className="ml-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
      </h3>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {sortedBids.map((bid, index) => {
            const isWinner = winnerId === bid.providerAddress || (index === 0 && !winnerId)
            const barWidth = (bid.calculatedScore / 100) * 100

            return (
              <motion.div
                key={bid.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'relative rounded-xl overflow-hidden border transition-all',
                  isWinner
                    ? 'border-yellow-500/50 bg-yellow-500/10'
                    : 'border-gray-700 bg-gray-800/50'
                )}
              >
                {/* Score bar background */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cn(
                    'absolute inset-y-0 left-0 opacity-20',
                    isWinner ? 'bg-yellow-500' : 'bg-synapse-500'
                  )}
                />

                <div className="relative p-4">
                  <div className="flex items-center justify-between">
                    {/* Provider Info */}
                    <div className="flex items-center gap-3">
                      {isWinner && (
                        <Trophy className="w-5 h-5 text-yellow-500" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">
                            {truncateAddress(bid.providerAddress)}
                          </span>
                          {bid.teeAttested && (
                            <span title="TEE Attested">
                              <Shield className="w-4 h-4 text-green-400" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                          <Star className="w-3 h-3 text-yellow-400" />
                          <span>{bid.reputationScore.toFixed(1)}</span>
                          <Clock className="w-3 h-3 ml-2" />
                          <span>{formatTime(bid.estimatedTime)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bid Amount & Score */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-synapse-400">
                        {formatUSD(bid.bidAmount)}
                      </div>
                      <div className={cn('text-sm', getScoreColor(bid.calculatedScore))}>
                        Score: {bid.calculatedScore}
                      </div>
                    </div>
                  </div>

                  {/* Winner Badge */}
                  {isWinner && winnerId && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute -top-1 -right-1 bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg"
                    >
                      WINNER
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Budget comparison */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Your max budget:</span>
          <span className="text-white font-semibold">{formatUSD(maxBudget)}</span>
        </div>
        {sortedBids.length > 0 && (
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Best bid (savings):</span>
            <span className="text-green-400 font-semibold">
              {formatUSD(sortedBids[0].bidAmount)}
              <span className="text-xs ml-1">
                (save {formatUSD(maxBudget - sortedBids[0].bidAmount)})
              </span>
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
