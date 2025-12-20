'use client'

import { motion } from 'framer-motion'
import { CheckCircle, Clock, DollarSign, Zap, ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { cn, formatUSD, formatTime, truncateAddress } from '@/lib/utils'

interface IntentResultProps {
  result: {
    data: any
    providerId: string
    executionTime: number
    settledAmount: number
    settlementTx?: string
  }
  intentType: string
  maxBudget: number
}

export function IntentResult({ result, intentType, maxBudget }: IntentResultProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const savings = maxBudget - result.settledAmount
  const savingsPercent = ((savings / maxBudget) * 100).toFixed(0)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-gradient-to-br from-emerald-900/30 to-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-emerald-500/30"
    >
      {/* Success Header */}
      <div className="flex items-center gap-3 mb-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5 }}
        >
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-emerald-400">Intent Fulfilled!</h3>
          <p className="text-sm text-gray-400">Delivered by {truncateAddress(result.providerId)}</p>
        </div>
      </div>

      {/* Result Data */}
      <div className="bg-gray-900/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Result Data</span>
          <button
            onClick={() => copyToClipboard(JSON.stringify(result.data, null, 2))}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Render result based on intent type */}
        {intentType.startsWith('weather') && result.data && (
          <div className="text-center py-4">
            <div className="text-5xl mb-2">
              {result.data.condition === 'Sunny' && '☀️'}
              {result.data.condition === 'Cloudy' && '☁️'}
              {result.data.condition === 'Rainy' && '🌧️'}
              {result.data.condition === 'Clear' && '🌙'}
              {!['Sunny', 'Cloudy', 'Rainy', 'Clear'].includes(result.data.condition) && '🌤️'}
            </div>
            <div className="text-3xl font-bold text-white">{result.data.temperature}°F</div>
            <div className="text-gray-400">{result.data.condition}</div>
            <div className="text-sm text-gray-500 mt-1">
              Humidity: {result.data.humidity}% | {result.data.city}
            </div>
          </div>
        )}

        {intentType.startsWith('crypto') && result.data && (
          <div className="text-center py-4">
            <div className="text-2xl font-mono text-synapse-400 mb-1">
              {result.data.symbol}
            </div>
            <div className="text-4xl font-bold text-white">
              ${typeof result.data.price === 'number' ? result.data.price.toLocaleString() : result.data.price}
            </div>
            <div className={cn(
              'text-lg mt-1',
              result.data.change24h >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {result.data.change24h >= 0 ? '+' : ''}{result.data.change24h}%
            </div>
            {result.data.marketCap && (
              <div className="text-sm text-gray-500 mt-1">
                Market Cap: {result.data.marketCap}
              </div>
            )}
          </div>
        )}

        {intentType.startsWith('news') && result.data?.articles && (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {result.data.articles.slice(0, 3).map((article: any, i: number) => (
              <div key={i} className="border-b border-gray-700 pb-2 last:border-0">
                <h4 className="font-medium text-white text-sm">{article.title}</h4>
                <p className="text-xs text-gray-400 mt-1">{article.source}</p>
              </div>
            ))}
            {result.data.articles.length > 3 && (
              <p className="text-xs text-gray-500">
                +{result.data.articles.length - 3} more articles
              </p>
            )}
          </div>
        )}

        {/* Fallback for unknown types */}
        {!intentType.startsWith('weather') &&
         !intentType.startsWith('crypto') &&
         !intentType.startsWith('news') && (
          <pre className="text-sm text-gray-300 overflow-x-auto">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <Clock className="w-4 h-4 text-synapse-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{formatTime(result.executionTime)}</div>
          <div className="text-xs text-gray-400">Execution Time</div>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-white">{formatUSD(result.settledAmount)}</div>
          <div className="text-xs text-gray-400">Cost (USDC)</div>
        </div>

        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <Zap className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <div className="text-lg font-bold text-green-400">{savingsPercent}%</div>
          <div className="text-xs text-gray-400">Saved</div>
        </div>
      </div>

      {/* Transaction Hash */}
      {result.settlementTx && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">x402 Payment</span>
            <a
              href={`https://basescan.org/tx/${result.settlementTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-synapse-400 hover:text-synapse-300 transition-colors"
            >
              {truncateAddress(result.settlementTx, 8)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </motion.div>
  )
}
