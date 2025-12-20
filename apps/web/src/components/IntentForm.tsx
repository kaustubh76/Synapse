'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Loader2, Zap, DollarSign, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IntentFormProps {
  onSubmit: (data: {
    type: string
    params: Record<string, string>
    maxBudget: number
    biddingDuration: number
  }) => void
  isLoading?: boolean
}

const INTENT_PRESETS = [
  {
    label: 'Weather',
    type: 'weather.current',
    icon: '🌤️',
    placeholder: 'Enter city name (e.g., New York)',
    paramKey: 'city',
    defaultBudget: 0.02,
  },
  {
    label: 'Crypto Price',
    type: 'crypto.price',
    icon: '💰',
    placeholder: 'Enter symbol (e.g., BTC, ETH)',
    paramKey: 'symbol',
    defaultBudget: 0.01,
  },
  {
    label: 'News',
    type: 'news.latest',
    icon: '📰',
    placeholder: 'Enter topic (e.g., crypto, ai, tech)',
    paramKey: 'topic',
    defaultBudget: 0.03,
  },
]

export function IntentForm({ onSubmit, isLoading }: IntentFormProps) {
  const [selectedPreset, setSelectedPreset] = useState(INTENT_PRESETS[0])
  const [inputValue, setInputValue] = useState('')
  const [maxBudget, setMaxBudget] = useState(0.02)
  const [biddingDuration, setBiddingDuration] = useState(5000)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return

    onSubmit({
      type: selectedPreset.type,
      params: { [selectedPreset.paramKey]: inputValue.trim() },
      maxBudget,
      biddingDuration,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
    >
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-synapse-400" />
        Create Intent
      </h2>

      {/* Intent Type Selection */}
      <div className="flex gap-2 mb-4">
        {INTENT_PRESETS.map((preset) => (
          <button
            key={preset.type}
            onClick={() => {
              setSelectedPreset(preset)
              setMaxBudget(preset.defaultBudget)
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
              selectedPreset.type === preset.type
                ? 'bg-synapse-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            <span>{preset.icon}</span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Intent Input Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main Input */}
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={selectedPreset.placeholder}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-synapse-500 focus:ring-1 focus:ring-synapse-500 transition-all"
            disabled={isLoading}
          />
        </div>

        {/* Budget and Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-400 mb-1 flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              Max Budget (USDC)
            </label>
            <input
              type="number"
              value={maxBudget}
              onChange={(e) => setMaxBudget(parseFloat(e.target.value) || 0)}
              step="0.001"
              min="0.001"
              max="1"
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-synapse-500 transition-all"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Bidding Time (sec)
            </label>
            <input
              type="number"
              value={biddingDuration / 1000}
              onChange={(e) => setBiddingDuration(parseFloat(e.target.value) * 1000 || 5000)}
              step="1"
              min="3"
              max="30"
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-synapse-500 transition-all"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all',
            isLoading || !inputValue.trim()
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-synapse-500 to-neural-500 text-white hover:opacity-90 active:scale-[0.98]'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Broadcasting Intent...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Broadcast Intent
            </>
          )}
        </button>
      </form>

      {/* Help Text */}
      <p className="text-xs text-gray-500 mt-4 text-center">
        Your intent will be broadcast to all providers. They&apos;ll compete to fulfill it at the best price.
      </p>
    </motion.div>
  )
}
