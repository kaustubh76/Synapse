'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Star, Zap, DollarSign, Shield,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  ExternalLink, Copy, Check, TrendingUp, Users, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EIGENCLOUD_WALLET } from '@/lib/config'

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
  status: 'active' | 'coming_soon' | 'beta'
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

// Available x402 tools (these would be registered on-chain in production)
const AVAILABLE_TOOLS: RegisteredTool[] = [
  {
    id: 'tool_deep_research',
    name: 'deep_research',
    description: 'Comprehensive research tool powered by Synapse AI. Searches multiple sources and synthesizes findings.',
    category: 'Research',
    pricing: { basePrice: '0.05', currency: 'USDC', model: 'per-call' },
    provider: {
      address: EIGENCLOUD_WALLET.address,
      name: 'Synapse AI',
      verified: true,
      reputation: 5.0
    },
    stats: {
      totalCalls: 0,
      successRate: 100,
      avgResponseTime: 1250,
      uniqueUsers: 0
    },
    tags: ['research', 'synthesis', 'multi-source', 'ai'],
    schema: {
      input: { query: 'string', depth: 'number', sources: 'string[]' },
      output: { report: 'string', citations: 'object[]', confidence: 'number' }
    },
    status: 'active',
    createdAt: Date.now()
  },
  {
    id: 'tool_code_analysis',
    name: 'code_analysis',
    description: 'AI-powered code review and analysis. Identifies bugs, security issues, and optimization opportunities.',
    category: 'Analytics',
    pricing: { basePrice: '0.02', currency: 'USDC', model: 'per-call' },
    provider: {
      address: EIGENCLOUD_WALLET.address,
      name: 'Synapse AI',
      verified: true,
      reputation: 5.0
    },
    stats: {
      totalCalls: 0,
      successRate: 100,
      avgResponseTime: 850,
      uniqueUsers: 0
    },
    tags: ['code', 'analysis', 'security', 'ai'],
    schema: {
      input: { code: 'string', language: 'string' },
      output: { issues: 'object[]', suggestions: 'string[]', score: 'number' }
    },
    status: 'active',
    createdAt: Date.now()
  },
  {
    id: 'tool_data_extraction',
    name: 'data_extraction',
    description: 'Extract structured data from unstructured text, documents, and web pages.',
    category: 'Data',
    pricing: { basePrice: '0.01', currency: 'USDC', model: 'per-call' },
    provider: {
      address: EIGENCLOUD_WALLET.address,
      name: 'Synapse AI',
      verified: true,
      reputation: 5.0
    },
    stats: {
      totalCalls: 0,
      successRate: 100,
      avgResponseTime: 450,
      uniqueUsers: 0
    },
    tags: ['extraction', 'parsing', 'nlp', 'data'],
    schema: {
      input: { content: 'string', schema: 'object' },
      output: { data: 'object', confidence: 'number' }
    },
    status: 'active',
    createdAt: Date.now()
  },
  {
    id: 'tool_sentiment_analysis',
    name: 'sentiment_analysis',
    description: 'Advanced NLP-powered sentiment analysis for text, social media, and reviews.',
    category: 'AI/ML',
    pricing: { basePrice: '0.005', currency: 'USDC', model: 'per-call' },
    provider: {
      address: EIGENCLOUD_WALLET.address,
      name: 'Synapse AI',
      verified: true,
      reputation: 5.0
    },
    stats: {
      totalCalls: 0,
      successRate: 100,
      avgResponseTime: 200,
      uniqueUsers: 0
    },
    tags: ['nlp', 'sentiment', 'analysis', 'ai'],
    schema: {
      input: { text: 'string', language: 'string' },
      output: { sentiment: 'string', score: 'number', aspects: 'object[]' }
    },
    status: 'active',
    createdAt: Date.now()
  },
  {
    id: 'tool_summarization',
    name: 'summarization',
    description: 'AI-powered text summarization. Condense long documents into concise summaries.',
    category: 'AI/ML',
    pricing: { basePrice: '0.01', currency: 'USDC', model: 'per-call' },
    provider: {
      address: EIGENCLOUD_WALLET.address,
      name: 'Synapse AI',
      verified: true,
      reputation: 5.0
    },
    stats: {
      totalCalls: 0,
      successRate: 100,
      avgResponseTime: 600,
      uniqueUsers: 0
    },
    tags: ['summarization', 'nlp', 'text', 'ai'],
    schema: {
      input: { text: 'string', maxLength: 'number' },
      output: { summary: 'string', keyPoints: 'string[]' }
    },
    status: 'active',
    createdAt: Date.now()
  }
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
    // Load available tools
    setTimeout(() => {
      setTools(AVAILABLE_TOOLS)
      setIsLoading(false)
    }, 500)
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

  const explorerUrl = 'https://sepolia.basescan.org'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Tool Registry</h2>
          <p className="text-dark-400">Available x402 monetized AI tools</p>
        </div>
        <div className="text-sm text-dark-400">
          {filteredTools.length} tools available
        </div>
      </div>

      {/* Network Info */}
      <div className="card p-4 border-l-4 border-accent-500">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-500/20">
            <Zap className="w-5 h-5 text-accent-400" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-white">x402 Payment Protocol</div>
            <p className="text-sm text-dark-400">
              All tools accept USDC payments on Base Sepolia (Chain ID: 84532)
            </p>
          </div>
          <a
            href={`${explorerUrl}/address/${EIGENCLOUD_WALLET}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Provider Wallet
          </a>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
          <input
            type="text"
            placeholder="Search tools by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="input w-auto"
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
                ? 'bg-accent-600/20 text-accent-400 border border-accent-600/30'
                : 'bg-dark-800/50 text-dark-400 hover:bg-dark-700/50 hover:text-white'
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
            <div key={i} className="card p-6">
              <div className="skeleton-shimmer h-6 rounded w-1/2 mb-4" />
              <div className="skeleton-shimmer h-4 rounded w-full mb-2" />
              <div className="skeleton-shimmer h-4 rounded w-3/4" />
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
              className="card overflow-hidden"
            >
              {/* Tool Header */}
              <div
                className="p-5 cursor-pointer hover:bg-dark-800/30 transition-colors"
                onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-white text-lg">{tool.name}</h3>
                      <span className={cn(
                        'badge',
                        tool.status === 'active' && 'badge-success',
                        tool.status === 'coming_soon' && 'badge-warning',
                        tool.status === 'beta' && 'badge-accent'
                      )}>
                        {tool.status === 'coming_soon' ? 'Coming Soon' : tool.status}
                      </span>
                      {tool.provider.verified && (
                        <span className="flex items-center gap-1 text-xs text-accent-400">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-dark-400 text-sm mb-3">{tool.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {tool.tags.slice(0, 4).map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-dark-800/80 text-dark-400 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <div className="text-xl font-bold text-accent-400">
                      ${tool.pricing.basePrice}
                    </div>
                    <div className="text-xs text-dark-500">{tool.pricing.model}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCallTool?.(tool)
                      }}
                      className="btn-primary text-sm py-1.5"
                    >
                      Use Tool
                    </button>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-1 text-dark-400">
                    <Zap className="w-4 h-4 text-accent-400" />
                    {tool.stats.totalCalls > 0 ? tool.stats.totalCalls.toLocaleString() : '—'} calls
                  </div>
                  <div className="flex items-center gap-1 text-dark-400">
                    <Star className="w-4 h-4 text-amber-400" />
                    {tool.provider.reputation}
                  </div>
                  <div className="flex items-center gap-1 text-dark-400">
                    <Clock className="w-4 h-4" />
                    ~{tool.stats.avgResponseTime}ms
                  </div>
                  <div className="flex items-center gap-1 text-dark-400">
                    <DollarSign className="w-4 h-4" />
                    USDC
                  </div>
                  <div className="ml-auto">
                    {expandedTool === tool.id ? (
                      <ChevronDown className="w-5 h-5 text-dark-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-dark-400" />
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
                    className="border-t border-dark-700/50"
                  >
                    <div className="p-5 grid md:grid-cols-2 gap-6">
                      {/* Provider Info */}
                      <div>
                        <h4 className="text-sm font-medium text-dark-400 mb-3">Provider</h4>
                        <div className="bg-dark-800/50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-white">{tool.provider.name}</span>
                            {tool.provider.verified && (
                              <Shield className="w-4 h-4 text-accent-400" />
                            )}
                          </div>
                          <a
                            href={`${explorerUrl}/address/${tool.provider.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-accent-400 font-mono mb-2 flex items-center gap-1 hover:underline"
                          >
                            {tool.provider.address.slice(0, 10)}...{tool.provider.address.slice(-8)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className="flex items-center gap-4 text-sm mt-2">
                            <span className="flex items-center gap-1 text-amber-400">
                              <Star className="w-4 h-4" />
                              {tool.provider.reputation}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Pricing */}
                      <div>
                        <h4 className="text-sm font-medium text-dark-400 mb-3">Pricing</h4>
                        <div className="bg-dark-800/50 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between">
                            <span className="text-dark-400">Base Price</span>
                            <span className="text-white font-semibold">${tool.pricing.basePrice} USDC</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Model</span>
                            <span className="text-white capitalize">{tool.pricing.model}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-dark-400">Network</span>
                            <span className="text-white">Base Sepolia</span>
                          </div>
                        </div>
                      </div>

                      {/* Schema */}
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-medium text-dark-400 mb-3">Schema</h4>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-dark-800/50 rounded-lg p-4">
                            <div className="text-xs text-dark-500 mb-2">Input</div>
                            <pre className="text-sm text-dark-300 font-mono">
                              {JSON.stringify(tool.schema.input, null, 2)}
                            </pre>
                          </div>
                          <div className="bg-dark-800/50 rounded-lg p-4">
                            <div className="text-xs text-dark-500 mb-2">Output</div>
                            <pre className="text-sm text-dark-300 font-mono">
                              {JSON.stringify(tool.schema.output, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="md:col-span-2 flex items-center gap-3">
                        <button
                          onClick={() => copyToolId(tool.id)}
                          className="btn-secondary flex items-center gap-2 text-sm"
                        >
                          {copiedId === tool.id ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          Copy Tool ID
                        </button>
                        <button
                          onClick={() => onToolSelect?.(tool)}
                          className="btn-secondary flex items-center gap-2 text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Details
                        </button>
                        <button
                          onClick={() => onCallTool?.(tool)}
                          className="btn-glow flex items-center gap-2 text-sm ml-auto"
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
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Tools Found</h3>
          <p className="text-dark-400 max-w-md mx-auto">
            Try adjusting your search or filters to find what you're looking for.
          </p>
        </div>
      )}
    </div>
  )
}
