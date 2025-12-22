'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Star, Zap, DollarSign, Shield,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  ExternalLink, Copy, Check, TrendingUp, Users
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolPricing {
  basePrice: string
  currency: string
  model: 'per-call' | 'per-token' | 'subscription'
}

interface ToolProvider {
  address: string
  name: string
  verified: boolean
  reputation: number
  totalEarnings: string
}

interface RegisteredTool {
  id: string
  name: string
  description: string
  category: string
  pricing: ToolPricing
  provider: ToolProvider
  stats: {
    totalCalls: number
    successRate: number
    avgResponseTime: number
    uniqueUsers: number
  }
  tags: string[]
  schema: {
    input: Record<string, unknown>
    output: Record<string, unknown>
  }
  status: 'active' | 'paused' | 'deprecated'
  createdAt: number
}

interface ToolRegistryBrowserProps {
  onToolSelect?: (tool: RegisteredTool) => void
  onCallTool?: (tool: RegisteredTool) => void
}

const CATEGORIES = [
  'All',
  'Research',
  'Analytics',
  'Data',
  'AI/ML',
  'Finance',
  'Weather',
  'News',
  'Social',
  'Utility'
]

export function ToolRegistryBrowser({
  onToolSelect,
  onCallTool
}: ToolRegistryBrowserProps) {
  const [tools, setTools] = useState<RegisteredTool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortBy, setSortBy] = useState<'popular' | 'price' | 'rating' | 'newest'>('popular')
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setTools([
        {
          id: 'tool_deep_research',
          name: 'deep_research',
          description: 'Comprehensive research tool that searches multiple sources and synthesizes findings into detailed reports.',
          category: 'Research',
          pricing: { basePrice: '0.05', currency: 'USDC', model: 'per-call' },
          provider: {
            address: '0x1234...5678',
            name: 'ResearchBot Labs',
            verified: true,
            reputation: 4.9,
            totalEarnings: '12,500.00'
          },
          stats: {
            totalCalls: 45678,
            successRate: 99.2,
            avgResponseTime: 1250,
            uniqueUsers: 1234
          },
          tags: ['research', 'synthesis', 'multi-source', 'reports'],
          schema: {
            input: { query: 'string', depth: 'number', sources: 'string[]' },
            output: { report: 'string', citations: 'object[]', confidence: 'number' }
          },
          status: 'active',
          createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000
        },
        {
          id: 'tool_crypto_price',
          name: 'crypto_price',
          description: 'Real-time cryptocurrency price data from multiple exchanges with historical charts.',
          category: 'Finance',
          pricing: { basePrice: '0.01', currency: 'USDC', model: 'per-call' },
          provider: {
            address: '0x8765...4321',
            name: 'CryptoData Inc',
            verified: true,
            reputation: 4.7,
            totalEarnings: '8,250.00'
          },
          stats: {
            totalCalls: 89123,
            successRate: 99.8,
            avgResponseTime: 120,
            uniqueUsers: 2567
          },
          tags: ['crypto', 'prices', 'realtime', 'charts'],
          schema: {
            input: { symbol: 'string', currency: 'string' },
            output: { price: 'number', change24h: 'number', volume: 'number' }
          },
          status: 'active',
          createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000
        },
        {
          id: 'tool_weather_api',
          name: 'weather_api',
          description: 'Global weather data with forecasts, historical data, and severe weather alerts.',
          category: 'Weather',
          pricing: { basePrice: '0.005', currency: 'USDC', model: 'per-call' },
          provider: {
            address: '0xabcd...efgh',
            name: 'WeatherNet',
            verified: true,
            reputation: 4.8,
            totalEarnings: '5,125.00'
          },
          stats: {
            totalCalls: 156789,
            successRate: 99.5,
            avgResponseTime: 85,
            uniqueUsers: 4321
          },
          tags: ['weather', 'forecast', 'alerts', 'global'],
          schema: {
            input: { location: 'string', days: 'number' },
            output: { current: 'object', forecast: 'object[]', alerts: 'object[]' }
          },
          status: 'active',
          createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000
        },
        {
          id: 'tool_sentiment_analysis',
          name: 'sentiment_analysis',
          description: 'Advanced NLP-powered sentiment analysis for text, social media, and reviews.',
          category: 'AI/ML',
          pricing: { basePrice: '0.02', currency: 'USDC', model: 'per-call' },
          provider: {
            address: '0x9999...8888',
            name: 'NLP Masters',
            verified: false,
            reputation: 4.5,
            totalEarnings: '3,750.00'
          },
          stats: {
            totalCalls: 23456,
            successRate: 98.7,
            avgResponseTime: 350,
            uniqueUsers: 876
          },
          tags: ['nlp', 'sentiment', 'analysis', 'ai'],
          schema: {
            input: { text: 'string', language: 'string' },
            output: { sentiment: 'string', score: 'number', aspects: 'object[]' }
          },
          status: 'active',
          createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000
        },
        {
          id: 'tool_news_aggregator',
          name: 'news_aggregator',
          description: 'Aggregates news from 500+ sources with AI-powered summarization and categorization.',
          category: 'News',
          pricing: { basePrice: '0.015', currency: 'USDC', model: 'per-call' },
          provider: {
            address: '0x7777...6666',
            name: 'NewsFlow',
            verified: true,
            reputation: 4.6,
            totalEarnings: '2,890.00'
          },
          stats: {
            totalCalls: 34567,
            successRate: 99.1,
            avgResponseTime: 450,
            uniqueUsers: 1543
          },
          tags: ['news', 'aggregation', 'ai', 'summary'],
          schema: {
            input: { topics: 'string[]', timeframe: 'string', limit: 'number' },
            output: { articles: 'object[]', summary: 'string', trending: 'string[]' }
          },
          status: 'active',
          createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000
        },
      ])
      setIsLoading(false)
    }, 1000)
  }, [])

  const filteredTools = tools
    .filter(tool => {
      if (selectedCategory !== 'All' && tool.category !== selectedCategory) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          tool.name.toLowerCase().includes(query) ||
          tool.description.toLowerCase().includes(query) ||
          tool.tags.some(tag => tag.toLowerCase().includes(query))
        )
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.stats.totalCalls - a.stats.totalCalls
        case 'price':
          return parseFloat(a.pricing.basePrice) - parseFloat(b.pricing.basePrice)
        case 'rating':
          return b.provider.reputation - a.provider.reputation
        case 'newest':
          return b.createdAt - a.createdAt
        default:
          return 0
      }
    })

  const copyToolId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Tool Registry</h2>
          <p className="text-gray-400">Browse and discover monetized AI tools</p>
        </div>
        <div className="text-sm text-gray-400">
          {filteredTools.length} tools available
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search tools by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-synapse-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:outline-none focus:border-synapse-500"
          >
            <option value="popular">Most Popular</option>
            <option value="price">Lowest Price</option>
            <option value="rating">Highest Rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              selectedCategory === category
                ? 'bg-synapse-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Tools Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900/50 rounded-xl border border-gray-800 p-6 animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-1/2 mb-4" />
              <div className="h-4 bg-gray-800 rounded w-full mb-2" />
              <div className="h-4 bg-gray-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTools.map((tool, index) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden"
            >
              {/* Tool Header */}
              <div
                className="p-5 cursor-pointer hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-white text-lg">{tool.name}</h3>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs',
                        tool.status === 'active' && 'bg-green-500/20 text-green-400',
                        tool.status === 'paused' && 'bg-yellow-500/20 text-yellow-400',
                        tool.status === 'deprecated' && 'bg-red-500/20 text-red-400'
                      )}>
                        {tool.status}
                      </span>
                      {tool.provider.verified && (
                        <span className="flex items-center gap-1 text-xs text-blue-400">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mb-3">{tool.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {tool.tags.slice(0, 4).map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="text-xl font-bold text-green-400">
                      ${tool.pricing.basePrice}
                    </div>
                    <div className="text-xs text-gray-500">{tool.pricing.model}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCallTool?.(tool)
                      }}
                      className="px-4 py-1.5 bg-synapse-600 hover:bg-synapse-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Use Tool
                    </button>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-1 text-gray-400">
                    <Zap className="w-4 h-4" />
                    {tool.stats.totalCalls.toLocaleString()} calls
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {tool.provider.reputation}
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Clock className="w-4 h-4" />
                    {tool.stats.avgResponseTime}ms
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Users className="w-4 h-4" />
                    {tool.stats.uniqueUsers.toLocaleString()} users
                  </div>
                  <div className="ml-auto">
                    {expandedTool === tool.id ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedTool === tool.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-800"
                  >
                    <div className="p-5 grid md:grid-cols-2 gap-6">
                      {/* Provider Info */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-3">Provider</h4>
                        <div className="bg-gray-800/50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-white">{tool.provider.name}</span>
                            {tool.provider.verified && (
                              <Shield className="w-4 h-4 text-blue-400" />
                            )}
                          </div>
                          <div className="text-sm text-gray-400 font-mono mb-2">
                            {tool.provider.address}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1 text-yellow-400">
                              <Star className="w-4 h-4" />
                              {tool.provider.reputation}
                            </span>
                            <span className="text-green-400">
                              ${tool.provider.totalEarnings} earned
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-3">Performance</h4>
                        <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Success Rate</span>
                            <span className="text-green-400">{tool.stats.successRate}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Avg Response</span>
                            <span className="text-white">{tool.stats.avgResponseTime}ms</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Total Calls</span>
                            <span className="text-white">{tool.stats.totalCalls.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Schema */}
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-medium text-gray-400 mb-3">Schema</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <div className="text-xs text-gray-500 mb-2">Input</div>
                            <pre className="text-sm text-gray-300 font-mono">
                              {JSON.stringify(tool.schema.input, null, 2)}
                            </pre>
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <div className="text-xs text-gray-500 mb-2">Output</div>
                            <pre className="text-sm text-gray-300 font-mono">
                              {JSON.stringify(tool.schema.output, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="md:col-span-2 flex items-center gap-3">
                        <button
                          onClick={() => copyToolId(tool.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                        >
                          {copiedId === tool.id ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          Copy Tool ID
                        </button>
                        <button
                          onClick={() => onToolSelect?.(tool)}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Details
                        </button>
                        <button
                          onClick={() => onCallTool?.(tool)}
                          className="flex items-center gap-2 px-4 py-2 bg-synapse-600 hover:bg-synapse-500 text-white rounded-lg text-sm font-medium transition-colors ml-auto"
                        >
                          <Zap className="w-4 h-4" />
                          Call Tool
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredTools.length === 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-12 text-center">
          <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Tools Found</h3>
          <p className="text-gray-400">
            Try adjusting your search or filters to find what you're looking for.
          </p>
        </div>
      )}
    </div>
  )
}
