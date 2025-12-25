'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Zap, DollarSign, Clock, Award, TrendingUp, Sparkles, Shield } from 'lucide-react'
import { Header } from '@/components/Header'

interface LLMModel {
  modelId: string
  provider: string
  response: string
  tokenCount: {
    input: number
    output: number
    total: number
  }
  cost: number
  latency: number
  qualityScore: number
}

interface ComparisonResult {
  intentId: string
  results: LLMModel[]
  comparison: {
    cheapest: string
    fastest: string
    highestQuality: string
    bestValue: string
    recommended: string
  }
  totalCost: number
  avgLatency: number
}

export default function LLMPage() {
  const [prompt, setPrompt] = useState('')
  const [modelTier, setModelTier] = useState<'premium' | 'balanced' | 'budget' | 'all'>('balanced')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [agentId, setAgentId] = useState('demo_agent_' + Date.now())
  const [creditProfile, setCreditProfile] = useState<any>(null)

  // Load credit profile
  const loadCreditProfile = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/llm/credit/${agentId}`)
      const data = await response.json()
      if (data.success) {
        setCreditProfile(data.data)
      } else {
        // Create new profile
        const createResponse = await fetch(`http://localhost:3001/api/llm/credit/${agentId}/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: '0xDemo' + Math.random().toString(36).substring(7) })
        })
        const createData = await createResponse.json()
        if (createData.success) {
          setCreditProfile(createData.data)
        }
      }
    } catch (error) {
      console.error('Error loading credit profile:', error)
    }
  }

  // Submit comparison request
  const handleCompare = async () => {
    if (!prompt.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch('http://localhost:3001/api/llm/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelTier,
          compareBy: ['cost', 'quality', 'latency'],
          agentId,
          maxTokens: 500,
        })
      })

      const data = await response.json()
      if (data.success) {
        setResult(data.data)
        // Reload credit profile to see updated usage
        await loadCreditProfile()
      } else {
        console.error('Comparison failed:', data.error)
        alert('Comparison failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error comparing models:', error)
      alert('Error: ' + error)
    } finally {
      setIsLoading(false)
    }
  }

  // Initialize credit profile on mount
  useState(() => {
    loadCreditProfile()
  })

  const getTierColor = (tier: string) => {
    const colors: Record<string, string> = {
      exceptional: 'text-purple-400',
      excellent: 'text-blue-400',
      good: 'text-green-400',
      fair: 'text-yellow-400',
      subprime: 'text-red-400',
    }
    return colors[tier] || 'text-gray-400'
  }

  return (
    <div className="min-h-screen">
      <Header isConnected={true} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Brain className="w-12 h-12 text-synapse-400" />
            <h1 className="text-4xl md:text-5xl font-bold gradient-text">
              Multi-LLM Comparison
            </h1>
          </div>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            Query 3-5 LLMs in parallel. Get ranked results by cost, quality, and speed.
            Build your credit score and unlock automatic discounts.
          </p>
        </motion.div>

        {/* Credit Profile */}
        {creditProfile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-synapse-900/30 to-gray-900/50 rounded-2xl p-6 border border-synapse-500/30 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-synapse-400" />
                <h3 className="text-lg font-semibold">Your Credit Profile</h3>
              </div>
              <div className="text-xs text-gray-500 font-mono">{agentId}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Credit Score</div>
                <div className={`text-2xl font-bold ${getTierColor(creditProfile.creditTier)}`}>
                  {creditProfile.creditScore}
                </div>
                <div className="text-xs text-gray-500 capitalize">{creditProfile.creditTier}</div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Credit Limit</div>
                <div className="text-xl font-bold text-white">
                  ${creditProfile.unsecuredCreditLimit.toFixed(0)}
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Available</div>
                <div className="text-xl font-bold text-green-400">
                  ${creditProfile.availableCredit.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Discount</div>
                <div className="text-xl font-bold text-purple-400">
                  {(creditProfile.tierDiscount * 100).toFixed(0)}%
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">Usage</div>
                <div className="text-xl font-bold text-blue-400">
                  ${(creditProfile.unsecuredCreditLimit - creditProfile.availableCredit).toFixed(2)}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Comparison Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800 mb-8"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-synapse-400" />
            Enter Your Prompt
          </h2>

          <div className="space-y-4">
            {/* Model Tier Selection */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Model Tier</label>
              <div className="grid grid-cols-4 gap-2">
                {(['premium', 'balanced', 'budget', 'all'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setModelTier(tier)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      modelTier === tier
                        ? 'bg-synapse-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your prompt here... (e.g., 'Explain quantum computing in simple terms')"
                className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-synapse-500 focus:ring-1 focus:ring-synapse-500 transition-all min-h-[120px]"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleCompare}
              disabled={isLoading || !prompt.trim()}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                isLoading || !prompt.trim()
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-synapse-500 to-neural-500 hover:from-synapse-400 hover:to-neural-400 text-white shadow-lg shadow-synapse-500/20'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Comparing Models...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Compare LLMs
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Results */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
                <DollarSign className="w-5 h-5 text-green-400 mb-2" />
                <div className="text-xs text-gray-400 mb-1">Cheapest</div>
                <div className="text-sm font-bold text-green-400">{result.comparison.cheapest}</div>
              </div>
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <Clock className="w-5 h-5 text-blue-400 mb-2" />
                <div className="text-xs text-gray-400 mb-1">Fastest</div>
                <div className="text-sm font-bold text-blue-400">{result.comparison.fastest}</div>
              </div>
              <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-4">
                <Award className="w-5 h-5 text-purple-400 mb-2" />
                <div className="text-xs text-gray-400 mb-1">Best Quality</div>
                <div className="text-sm font-bold text-purple-400">{result.comparison.highestQuality}</div>
              </div>
              <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
                <TrendingUp className="w-5 h-5 text-yellow-400 mb-2" />
                <div className="text-xs text-gray-400 mb-1">Best Value</div>
                <div className="text-sm font-bold text-yellow-400">{result.comparison.bestValue}</div>
              </div>
              <div className="bg-synapse-900/20 border border-synapse-500/30 rounded-xl p-4">
                <Sparkles className="w-5 h-5 text-synapse-400 mb-2" />
                <div className="text-xs text-gray-400 mb-1">Recommended</div>
                <div className="text-sm font-bold text-synapse-400">{result.comparison.recommended}</div>
              </div>
            </div>

            {/* Model Results */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Model Responses</h3>
              {result.results.map((model, idx) => {
                const isRecommended = model.modelId === result.comparison.recommended
                const isCheapest = model.modelId === result.comparison.cheapest
                const isFastest = model.modelId === result.comparison.fastest
                const isHighestQuality = model.modelId === result.comparison.highestQuality

                return (
                  <motion.div
                    key={model.modelId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`bg-gray-900/50 rounded-2xl p-6 border ${
                      isRecommended
                        ? 'border-synapse-500/50 shadow-lg shadow-synapse-500/20'
                        : 'border-gray-800'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-lg font-bold text-white">{model.modelId}</h4>
                          {isRecommended && (
                            <span className="px-2 py-0.5 bg-synapse-500/20 text-synapse-400 text-xs rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{model.provider}</div>
                      </div>
                      <div className="flex gap-2">
                        {isCheapest && (
                          <div className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                            💰 Cheapest
                          </div>
                        )}
                        {isFastest && (
                          <div className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                            ⚡ Fastest
                          </div>
                        )}
                        {isHighestQuality && (
                          <div className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                            ⭐ Best Quality
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-gray-800/50 rounded-lg">
                      <div>
                        <div className="text-xs text-gray-400">Cost</div>
                        <div className="text-sm font-bold text-green-400">
                          ${model.cost.toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Latency</div>
                        <div className="text-sm font-bold text-blue-400">
                          {model.latency.toFixed(0)}ms
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Quality</div>
                        <div className="text-sm font-bold text-purple-400">
                          {model.qualityScore.toFixed(1)}/10
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Tokens</div>
                        <div className="text-sm font-bold text-yellow-400">
                          {model.tokenCount.total}
                        </div>
                      </div>
                    </div>

                    {/* Response */}
                    <div className="bg-gray-800/30 rounded-lg p-4">
                      <div className="text-sm text-gray-300 whitespace-pre-wrap">
                        {model.response}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Total Stats */}
            <div className="bg-gradient-to-br from-synapse-900/30 to-gray-900/50 rounded-xl p-6 border border-synapse-500/30">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Total Cost</div>
                  <div className="text-2xl font-bold text-white">
                    ${result.totalCost.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">Avg Latency</div>
                  <div className="text-2xl font-bold text-white">
                    {result.avgLatency.toFixed(0)}ms
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {!result && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Brain className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">
              Enter a prompt above to compare LLM responses
            </p>
          </motion.div>
        )}
      </main>
    </div>
  )
}
