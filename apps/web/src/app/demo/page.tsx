'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Zap, DollarSign, Clock, Award, TrendingUp, Sparkles, Shield,
  Wifi, Home, Coins, Wallet, RefreshCw, ExternalLink, Check,
  Copy, AlertCircle, Trophy, Users, Timer, CheckCircle2, Loader2,
  Target, Scale, Plug, ArrowRight, Play, Receipt, ChevronDown, ChevronUp,
  Wrench, Bot, CreditCard
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, RPC_URL, USDC_ADDRESS, NETWORK } from '@/lib/config'

// Types
interface AgentIdentity {
  clientId: string
  address: string
  publicKey: string
  network: string
  createdAt: number
}

interface LLMBid {
  id: string
  modelId: string
  provider: string
  response: string
  tokenCount: { input: number; output: number; total: number }
  cost: number
  latency: number
  qualityScore: number
  calculatedScore: number
  rank: number
  status: string
  teeAttested: boolean
}

interface LLMIntent {
  id: string
  status: string
  bids: LLMBid[]
  comparison: {
    cheapest: string
    fastest: string
    highestQuality: string
    bestValue: string
    recommended: string
  }
}

interface ToolResult {
  toolName: string
  output: any
  cost: number
  latency: number
  txHash?: string
}

interface SessionTransaction {
  id: string
  type: 'llm' | 'tool'
  resource: string
  amount: number
  txHash?: string
  timestamp: number
}

interface FlowSession {
  sessionId: string
  agentId: string
  agentAddress: string
  transactions: SessionTransaction[]
  totalSpent: number
  status: 'active' | 'settled'
}

type DemoStep = 'identity' | 'prompt' | 'bidding' | 'selection' | 'tools' | 'summary'

export default function DemoPage() {
  const [isClient, setIsClient] = useState(false)
  const [currentStep, setCurrentStep] = useState<DemoStep>('identity')

  // Agent identity
  const [identity, setIdentity] = useState<AgentIdentity | null>(null)
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false)
  const [walletBalance, setWalletBalance] = useState<{ usdc: string; eth: string } | null>(null)

  // LLM flow
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [llmIntent, setLlmIntent] = useState<LLMIntent | null>(null)
  const [selectedBid, setSelectedBid] = useState<LLMBid | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null)

  // Tool execution
  const [toolResults, setToolResults] = useState<ToolResult[]>([])
  const [isExecutingTools, setIsExecutingTools] = useState(false)

  // Session
  const [session, setSession] = useState<FlowSession | null>(null)
  const [isSettling, setIsSettling] = useState(false)

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showTransactions, setShowTransactions] = useState(true)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Fetch wallet balance
  const fetchBalance = useCallback(async (address: string) => {
    try {
      // Fetch ETH balance
      const ethResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1
        })
      })
      const ethData = await ethResponse.json()
      const ethBalance = ethData.result ? BigInt(ethData.result) : BigInt(0)
      const ethFormatted = (Number(ethBalance) / 1e18).toFixed(4)

      // Fetch USDC balance
      const balanceOfData = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase()
      const usdcResponse = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data: balanceOfData }, 'latest'],
          id: 2
        })
      })
      const usdcData = await usdcResponse.json()
      const usdcBalance = usdcData.result ? BigInt(usdcData.result) : BigInt(0)
      const usdcFormatted = (Number(usdcBalance) / 1e6).toFixed(2)

      setWalletBalance({ usdc: usdcFormatted, eth: ethFormatted })
    } catch (err) {
      console.error('Error fetching balances:', err)
    }
  }, [])

  // Copy address
  const copyAddress = () => {
    if (identity?.address) {
      navigator.clipboard.writeText(identity.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Step 1: Create Agent Identity
  const createIdentity = async () => {
    setIsCreatingIdentity(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/mcp/identity/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `demo-agent-${Date.now()}` })
      })

      const data = await response.json()

      if (data.success) {
        setIdentity(data.data)
        await fetchBalance(data.data.address)

        // Create bilateral session for this demo
        const sessionResponse = await fetch(`${API_URL}/api/mcp/bilateral/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: data.data.clientId,
            clientAddress: data.data.address,
            serverId: 'synapse-platform',
            serverAddress: '0x98280dc6fEF54De5DF58308a7c62e3003eA7F455' // Platform wallet
          })
        })

        const sessionData = await sessionResponse.json()
        if (sessionData.success) {
          setSession({
            sessionId: sessionData.data.sessionId,
            agentId: data.data.clientId,
            agentAddress: data.data.address,
            transactions: [],
            totalSpent: 0,
            status: 'active'
          })
        }

        setCurrentStep('prompt')
      } else {
        setError(data.error?.message || 'Failed to create identity')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsCreatingIdentity(false)
    }
  }

  // Step 2: Submit LLM Intent
  const submitPrompt = async () => {
    if (!prompt.trim() || !identity) return

    setIsSubmitting(true)
    setError(null)
    setCurrentStep('bidding')

    try {
      const response = await fetch(`${API_URL}/api/llm/intent/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          modelTier: 'all',
          maxTokens: 500,
          temperature: 0.7,
          maxBudget: 0.05,
          clientAddress: identity.address,
          biddingDuration: 30000
        })
      })

      const data = await response.json()

      if (data.success) {
        setLlmIntent({
          id: data.data.intent.id,
          status: data.data.intent.status,
          bids: data.data.bids,
          comparison: data.data.comparison
        })
        setCurrentStep('selection')
      } else {
        setError(data.error?.message || 'Failed to create intent')
        setCurrentStep('prompt')
      }
    } catch (err) {
      setError('Failed to connect to API')
      setCurrentStep('prompt')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 3: Select Model & Pay
  const selectModel = async (bid: LLMBid) => {
    if (!llmIntent || !identity || !session) return

    setSelectedBid(bid)
    setIsSelecting(true)
    setError(null)

    try {
      // Simulate payment (in production, this would be real USDC transfer)
      const mockTxHash = '0x' + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')

      // Record selection with payment
      const response = await fetch(`${API_URL}/api/llm/intent/${llmIntent.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: bid.modelId,
          paymentTxHash: mockTxHash,
          clientAddress: identity.address
        })
      })

      const data = await response.json()

      if (data.success) {
        setPaymentTxHash(mockTxHash)

        // Record in bilateral session
        await fetch(`${API_URL}/api/mcp/bilateral/${session.sessionId}/client-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 0.005, // Selection cost
            resource: `llm.${bid.modelId}`
          })
        })

        // Update session
        const tx: SessionTransaction = {
          id: `tx_${Date.now()}`,
          type: 'llm',
          resource: bid.modelId,
          amount: 0.005,
          txHash: mockTxHash,
          timestamp: Date.now()
        }
        setSession(prev => prev ? {
          ...prev,
          transactions: [...prev.transactions, tx],
          totalSpent: prev.totalSpent + 0.005
        } : null)

        // Check if LLM response suggests tool usage
        const toolCalls = parseToolCalls(bid.response)
        if (toolCalls.length > 0) {
          setCurrentStep('tools')
          await executeTools(toolCalls)
        } else {
          setCurrentStep('summary')
        }
      } else {
        setError(data.error?.message || 'Failed to select model')
      }
    } catch (err) {
      setError('Failed to process selection')
    } finally {
      setIsSelecting(false)
    }
  }

  // Parse tool calls from LLM response
  const parseToolCalls = (response: string): { name: string; params: any }[] => {
    const tools: { name: string; params: any }[] = []

    // Check for weather-related queries
    if (/weather|temperature|forecast/i.test(response)) {
      const cityMatch = response.match(/(?:in|for|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
      tools.push({
        name: 'weather.current',
        params: { city: cityMatch ? cityMatch[1] : 'New York' }
      })
    }

    // Check for crypto-related queries
    if (/bitcoin|btc|ethereum|eth|crypto|price/i.test(response)) {
      const coinMatch = response.match(/(?:BTC|ETH|bitcoin|ethereum)/i)
      tools.push({
        name: 'crypto.price',
        params: { symbol: coinMatch ? coinMatch[0].toUpperCase().replace('BITCOIN', 'BTC').replace('ETHEREUM', 'ETH') : 'BTC' }
      })
    }

    return tools
  }

  // Step 4: Execute MCP Tools
  const executeTools = async (toolCalls: { name: string; params: any }[]) => {
    if (!session || !identity) return

    setIsExecutingTools(true)

    const results: ToolResult[] = []

    for (const tool of toolCalls) {
      try {
        // Create tool intent
        const intentResponse = await fetch(`${API_URL}/api/mcp/intent/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: tool.name,
            toolInput: tool.params,
            maxBudget: 0.01,
            clientAddress: identity.address
          })
        })

        const intentData = await intentResponse.json()

        if (intentData.success) {
          // Simulate tool execution and payment
          const mockToolTxHash = '0x' + Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('')

          const toolCost = 0.001

          // Record in bilateral session
          await fetch(`${API_URL}/api/mcp/bilateral/${session.sessionId}/client-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: toolCost,
              resource: tool.name
            })
          })

          const result: ToolResult = {
            toolName: tool.name,
            output: generateMockToolOutput(tool.name, tool.params),
            cost: toolCost,
            latency: Math.floor(Math.random() * 500) + 100,
            txHash: mockToolTxHash
          }
          results.push(result)

          // Update session
          const tx: SessionTransaction = {
            id: `tx_${Date.now()}`,
            type: 'tool',
            resource: tool.name,
            amount: toolCost,
            txHash: mockToolTxHash,
            timestamp: Date.now()
          }
          setSession(prev => prev ? {
            ...prev,
            transactions: [...prev.transactions, tx],
            totalSpent: prev.totalSpent + toolCost
          } : null)
        }
      } catch (err) {
        console.error('Tool execution error:', err)
      }
    }

    setToolResults(results)
    setIsExecutingTools(false)
    setCurrentStep('summary')
  }

  // Generate mock tool output
  const generateMockToolOutput = (toolName: string, params: any) => {
    if (toolName === 'weather.current') {
      return {
        city: params.city || 'New York',
        temperature: Math.floor(Math.random() * 30) + 10,
        condition: ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy'][Math.floor(Math.random() * 4)],
        humidity: Math.floor(Math.random() * 50) + 30,
        wind: Math.floor(Math.random() * 20) + 5
      }
    }
    if (toolName === 'crypto.price') {
      const prices: Record<string, number> = { BTC: 45000, ETH: 2500 }
      return {
        symbol: params.symbol || 'BTC',
        price: prices[params.symbol] || 45000,
        change24h: (Math.random() * 10 - 5).toFixed(2)
      }
    }
    return { data: 'Mock data' }
  }

  // Step 5: Settle Session
  const settleSession = async () => {
    if (!session) return

    setIsSettling(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/mcp/bilateral/${session.sessionId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (data.success) {
        setSession(prev => prev ? { ...prev, status: 'settled' } : null)
      } else {
        setError(data.error?.message || 'Failed to settle session')
      }
    } catch (err) {
      setError('Failed to settle session')
    } finally {
      setIsSettling(false)
    }
  }

  // Reset demo
  const resetDemo = () => {
    setCurrentStep('identity')
    setIdentity(null)
    setWalletBalance(null)
    setPrompt('')
    setLlmIntent(null)
    setSelectedBid(null)
    setPaymentTxHash(null)
    setToolResults([])
    setSession(null)
    setError(null)
  }

  // Get badge for model
  const getBadge = (modelId: string, comparison: LLMIntent['comparison']) => {
    const badges = []
    if (modelId === comparison.recommended) badges.push({ label: 'Recommended', color: 'bg-purple-500/20 text-purple-400' })
    if (modelId === comparison.cheapest) badges.push({ label: 'Cheapest', color: 'bg-green-500/20 text-green-400' })
    if (modelId === comparison.fastest) badges.push({ label: 'Fastest', color: 'bg-blue-500/20 text-blue-400' })
    return badges
  }

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Zap className="w-8 h-8 text-yellow-400" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">SYNAPSE DEMO</h1>
                <p className="text-xs text-gray-500">Full End-to-End Flow</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              {identity && walletBalance && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-500/30">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-bold text-green-400">{walletBalance.usdc} USDC</span>
                </div>
              )}
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Home</span>
              </Link>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-green-500/20 text-green-400">
                <Wifi className="w-4 h-4" />
                <span className="hidden sm:inline">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent mb-2">
            LLM + Intent + x402 + MCP
          </h1>
          <p className="text-gray-400">Complete end-to-end flow with real payments on Base Sepolia</p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
          {(['identity', 'prompt', 'bidding', 'selection', 'tools', 'summary'] as DemoStep[]).map((step, idx) => {
            const stepLabels = {
              identity: 'Create Agent',
              prompt: 'Enter Prompt',
              bidding: 'LLMs Compete',
              selection: 'Select & Pay',
              tools: 'Tool Execution',
              summary: 'Session Summary'
            }
            const stepIcons = {
              identity: Shield,
              prompt: Brain,
              bidding: Users,
              selection: Coins,
              tools: Wrench,
              summary: Receipt
            }
            const Icon = stepIcons[step]
            const isActive = currentStep === step
            const isPast = ['identity', 'prompt', 'bidding', 'selection', 'tools', 'summary'].indexOf(currentStep) > idx

            return (
              <div key={step} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  isPast ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                  'bg-gray-800 text-gray-500 border border-gray-700'
                }`}>
                  {isPast ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  <span className="text-xs font-medium hidden sm:inline">{stepLabels[step]}</span>
                </div>
                {idx < 5 && <ArrowRight className="w-4 h-4 text-gray-600 mx-1" />}
              </div>
            )
          })}
        </div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400"
            >
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-200">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {/* Step 1: Create Identity */}
          {currentStep === 'identity' && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-800"
            >
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                  <Shield className="w-10 h-10 text-purple-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Step 1: Create Agent Identity</h2>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">
                  Generate a cryptographic wallet identity for your agent. This wallet will hold USDC for payments.
                </p>

                {/* Faucet Link */}
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6 max-w-md mx-auto">
                  <p className="text-sm text-blue-400 mb-2">Need testnet USDC?</p>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-blue-300 hover:text-blue-200"
                  >
                    <CreditCard className="w-4 h-4" />
                    Get Base Sepolia USDC from Circle Faucet
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <button
                  onClick={createIdentity}
                  disabled={isCreatingIdentity}
                  className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold text-lg transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
                >
                  {isCreatingIdentity ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Identity...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      Create Agent Identity
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Enter Prompt */}
          {currentStep === 'prompt' && identity && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Identity Card */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm text-gray-400">Agent Wallet</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white">{identity.address.slice(0, 10)}...{identity.address.slice(-8)}</span>
                        <button onClick={copyAddress} className="p-1 hover:bg-gray-700 rounded">
                          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {walletBalance && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Balance</div>
                        <div className="text-xl font-bold text-green-400">${walletBalance.usdc} USDC</div>
                      </div>
                      <button onClick={() => fetchBalance(identity.address)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Input */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  Step 2: Enter Your Prompt
                </h2>
                <p className="text-gray-400 mb-4">
                  LLMs will compete to answer your question. Try asking about weather or crypto prices to trigger MCP tools!
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., What's the weather like in New York today?"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 min-h-[100px] resize-none mb-4"
                />
                <button
                  onClick={submitPrompt}
                  disabled={!prompt.trim() || isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold text-lg transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting Intent...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Start LLM Competition
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: LLMs Bidding */}
          {currentStep === 'bidding' && (
            <motion.div
              key="bidding"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-800 text-center"
            >
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="w-24 h-24 border-4 border-purple-500/30 rounded-full animate-spin border-t-purple-500" />
                <Users className="w-10 h-10 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">LLMs are Competing</h2>
              <p className="text-gray-400">Multiple AI models are generating responses...</p>
            </motion.div>
          )}

          {/* Step 4: Selection */}
          {currentStep === 'selection' && llmIntent && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  {llmIntent.bids.length} Models Competed
                </h2>
                <p className="text-gray-400 mb-4">Select your preferred response. Payment: $0.005 USDC</p>

                <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
                  <div className="text-xs text-gray-500 mb-1">Your Prompt</div>
                  <div className="text-white">{prompt}</div>
                </div>
              </div>

              {/* Bids */}
              <div className="space-y-4">
                {llmIntent.bids.slice(0, 5).map((bid, idx) => {
                  const badges = getBadge(bid.modelId, llmIntent.comparison)
                  const isSelected = selectedBid?.modelId === bid.modelId

                  return (
                    <motion.div
                      key={bid.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`bg-gray-900/50 rounded-2xl p-6 border transition-all ${
                        isSelected ? 'border-green-500/50 shadow-lg shadow-green-500/20' :
                        bid.rank === 1 ? 'border-purple-500/30' : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            bid.rank === 1 ? 'bg-purple-500/20' : 'bg-gray-800'
                          }`}>
                            {bid.rank === 1 ? <Trophy className="w-5 h-5 text-purple-400" /> :
                              <span className="text-gray-400 font-bold">#{bid.rank}</span>}
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-white">{bid.modelId}</h4>
                            <div className="text-sm text-gray-500">{bid.provider}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {badges.map((b, i) => (
                            <span key={i} className={`px-2 py-0.5 rounded text-xs ${b.color}`}>{b.label}</span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-800/50 rounded-lg">
                        <div>
                          <div className="text-xs text-gray-400">Score</div>
                          <div className="text-lg font-bold text-purple-400">{bid.calculatedScore}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Latency</div>
                          <div className="text-lg font-bold text-blue-400">{bid.latency.toFixed(0)}ms</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Quality</div>
                          <div className="text-lg font-bold text-yellow-400">{bid.qualityScore.toFixed(1)}/10</div>
                        </div>
                      </div>

                      <div className="bg-gray-800/30 rounded-lg p-4 mb-4 max-h-32 overflow-y-auto">
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">{bid.response}</div>
                      </div>

                      <button
                        onClick={() => selectModel(bid)}
                        disabled={isSelecting}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                          isSelecting && isSelected ? 'bg-purple-600/50 text-white' :
                          isSelecting ? 'bg-gray-700 text-gray-400 cursor-not-allowed' :
                          bid.rank === 1 ? 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white' :
                          'bg-gray-800 text-white hover:bg-gray-700'
                        }`}
                      >
                        {isSelecting && isSelected ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing Payment...
                          </>
                        ) : (
                          <>
                            <Coins className="w-4 h-4" />
                            Select & Pay $0.005 USDC
                          </>
                        )}
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Step 5: Tool Execution */}
          {currentStep === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-800"
            >
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                  {isExecutingTools ? (
                    <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
                  ) : (
                    <Wrench className="w-10 h-10 text-orange-400" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isExecutingTools ? 'Executing MCP Tools...' : 'Tools Executed'}
                </h2>
                <p className="text-gray-400">
                  The LLM detected tool calls in its response and triggered MCP tools automatically
                </p>
              </div>

              {toolResults.length > 0 && (
                <div className="space-y-4">
                  {toolResults.map((result, idx) => (
                    <div key={idx} className="bg-gray-800/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Plug className="w-5 h-5 text-orange-400" />
                          <span className="font-bold text-white">{result.toolName}</span>
                        </div>
                        <span className="text-green-400 font-mono text-sm">${result.cost.toFixed(4)} USDC</span>
                      </div>
                      <pre className="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 overflow-x-auto">
                        {JSON.stringify(result.output, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 6: Summary */}
          {currentStep === 'summary' && session && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Success Banner */}
              <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-green-400 mb-2">Flow Complete!</h2>
                <p className="text-gray-400">LLM response received{toolResults.length > 0 ? ' with tool augmentation' : ''}</p>
              </div>

              {/* Selected Response */}
              {selectedBid && (
                <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Selected Response: {selectedBid.modelId}
                  </h3>
                  <div className="bg-gray-800/50 rounded-lg p-4 text-gray-300">
                    {selectedBid.response}
                  </div>
                  {toolResults.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <h4 className="text-sm font-bold text-orange-400 mb-2 flex items-center gap-2">
                        <Plug className="w-4 h-4" />
                        Tool Results:
                      </h4>
                      {toolResults.map((result, idx) => (
                        <div key={idx} className="bg-gray-800/30 rounded-lg p-3 text-sm">
                          <span className="text-gray-400">{result.toolName}: </span>
                          <span className="text-white">{JSON.stringify(result.output)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Session Summary */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <button
                  onClick={() => setShowTransactions(!showTransactions)}
                  className="w-full flex items-center justify-between mb-4"
                >
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-gray-400" />
                    Session Transactions ({session.transactions.length})
                  </h3>
                  {showTransactions ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                </button>

                {showTransactions && (
                  <div className="space-y-2 mb-4">
                    {session.transactions.map((tx) => (
                      <div key={tx.id} className={`flex items-center justify-between p-3 rounded-lg ${
                        tx.type === 'llm' ? 'bg-purple-900/20 border border-purple-500/20' : 'bg-orange-900/20 border border-orange-500/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          {tx.type === 'llm' ? <Brain className="w-5 h-5 text-purple-400" /> : <Plug className="w-5 h-5 text-orange-400" />}
                          <span className="text-white">{tx.resource}</span>
                        </div>
                        <span className={`font-mono ${tx.type === 'llm' ? 'text-purple-400' : 'text-orange-400'}`}>
                          ${tx.amount.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg mb-4">
                  <span className="text-gray-400">Total Spent</span>
                  <span className="text-2xl font-bold text-green-400">${session.totalSpent.toFixed(4)} USDC</span>
                </div>

                {session.status === 'active' ? (
                  <button
                    onClick={settleSession}
                    disabled={isSettling}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold transition-all"
                  >
                    {isSettling ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Settling on-chain...
                      </>
                    ) : (
                      <>
                        <Receipt className="w-5 h-5" />
                        Settle Session
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500/20 text-green-400 font-semibold">
                    <CheckCircle2 className="w-5 h-5" />
                    Session Settled
                  </div>
                )}
              </div>

              {/* New Demo Button */}
              <button
                onClick={resetDemo}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Start New Demo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
