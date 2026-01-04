'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Zap, DollarSign, Shield,
  Coins, Wallet, RefreshCw, ExternalLink, Check,
  Copy, AlertCircle, Trophy, Users, CheckCircle2, Loader2,
  Plug, ArrowRight, Play, Receipt, ChevronDown, ChevronUp,
  Wrench, Bot, CreditCard
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, RPC_URL, USDC_ADDRESS } from '@/lib/config'
import { PageHeader } from '@/components/PageHeader'
import { fadeInUp } from '@/lib/animations'

// Platform wallet that actually executes payments (has ETH + USDC)
const PLATFORM_WALLET = '0xcF1A4587a4470634fc950270cab298B79b258eDe'

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

interface SettlementResult {
  txHash: string
  blockNumber: number
  explorerUrl: string
  netAmount: number
  direction: string
}

interface FlowSession {
  sessionId: string
  agentId: string
  agentAddress: string
  transactions: SessionTransaction[]
  totalSpent: number
  status: 'active' | 'settled'
  settlementResult?: SettlementResult
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

  // Fetch balance with delay to wait for block confirmation
  const fetchBalanceWithDelay = useCallback(async (address: string, delayMs: number = 3000) => {
    // Wait for transaction to be mined
    await new Promise(resolve => setTimeout(resolve, delayMs))
    await fetchBalance(address)
    // Fetch again after another delay to ensure we have latest
    await new Promise(resolve => setTimeout(resolve, 2000))
    await fetchBalance(address)
  }, [fetchBalance])

  // Auto-refresh platform wallet balance every 5 seconds while session is active
  useEffect(() => {
    if (session) {
      // Fetch platform wallet balance (the actual wallet that pays)
      fetchBalance(PLATFORM_WALLET)
      const interval = setInterval(() => {
        fetchBalance(PLATFORM_WALLET)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [session, fetchBalance])

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
        // Fetch platform wallet balance (the wallet that actually pays)
        await fetchBalance(PLATFORM_WALLET)

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

  // Step 3: Select Model & Pay - REAL USDC PAYMENT
  const selectModel = async (bid: LLMBid) => {
    if (!llmIntent || !identity || !session) return

    setSelectedBid(bid)
    setIsSelecting(true)
    setError(null)

    try {
      const paymentAmount = 0.005 // LLM selection cost

      // Execute REAL USDC payment via flow API
      const flowStartResponse = await fetch(`${API_URL}/api/flow/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: `llm.${bid.modelId}`,
          amount: paymentAmount,
          clientAddress: identity.address
        })
      })
      const flowStartData = await flowStartResponse.json()

      let realTxHash = null
      if (flowStartData.success) {
        const paymentResponse = await fetch(`${API_URL}/api/flow/${flowStartData.data.flowSessionId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: paymentAmount })
        })
        const paymentData = await paymentResponse.json()
        realTxHash = paymentData.success ? paymentData.data?.txHash : null
      }

      // Record selection with real payment TX hash
      const response = await fetch(`${API_URL}/api/llm/intent/${llmIntent.id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: bid.modelId,
          paymentTxHash: realTxHash || 'pending',
          clientAddress: identity.address
        })
      })

      const data = await response.json()

      if (data.success) {
        setPaymentTxHash(realTxHash)

        // Record in bilateral session
        await fetch(`${API_URL}/api/mcp/bilateral/${session.sessionId}/client-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: paymentAmount,
            resource: `llm.${bid.modelId}`
          })
        })

        // Update session with real TX hash
        const tx: SessionTransaction = {
          id: `tx_${Date.now()}`,
          type: 'llm',
          resource: bid.modelId,
          amount: paymentAmount,
          txHash: realTxHash || undefined,
          timestamp: Date.now()
        }
        setSession(prev => prev ? {
          ...prev,
          transactions: [...prev.transactions, tx],
          totalSpent: prev.totalSpent + paymentAmount
        } : null)

        // Refresh platform wallet balance after payment (with delay for block confirmation)
        fetchBalanceWithDelay(PLATFORM_WALLET, 3000)

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

  // Step 4: Execute MCP Tools - REAL API CALLS
  const executeTools = async (toolCalls: { name: string; params: any }[]) => {
    if (!session || !identity) return

    setIsExecutingTools(true)

    const results: ToolResult[] = []

    for (const tool of toolCalls) {
      try {
        const toolCost = 0.001

        // Execute REAL tool via API
        const toolResponse = await fetch(`${API_URL}/api/mcp/tools/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: tool.name,
            input: tool.params
          })
        })

        const toolData = await toolResponse.json()

        if (toolData.success) {
              // Execute REAL USDC payment via flow API
          // First start a flow session
          const flowStartResponse = await fetch(`${API_URL}/api/flow/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolName: tool.name,
              amount: toolCost,
              clientAddress: identity.address
            })
          })
          const flowStartData = await flowStartResponse.json()

          let realTxHash = null
          if (flowStartData.success) {
            // Execute the payment
            const paymentResponse = await fetch(`${API_URL}/api/flow/${flowStartData.data.flowSessionId}/pay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: toolCost })
            })
            const paymentData = await paymentResponse.json()
            realTxHash = paymentData.success ? paymentData.data?.txHash : null
          }

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
            output: toolData.data?.result || toolData.data, // Real data from API
            cost: toolCost,
            latency: toolData.data?.latency || 0, // Real latency
            txHash: realTxHash || undefined
          }
          results.push(result)

          // Update session with real TX hash
          const tx: SessionTransaction = {
            id: `tx_${Date.now()}`,
            type: 'tool',
            resource: tool.name,
            amount: toolCost,
            txHash: realTxHash || undefined,
            timestamp: Date.now()
          }
          setSession(prev => prev ? {
            ...prev,
            transactions: [...prev.transactions, tx],
            totalSpent: prev.totalSpent + toolCost
          } : null)

          // Refresh platform wallet balance after payment (with delay for block confirmation)
          fetchBalanceWithDelay(PLATFORM_WALLET, 3000)
        }
      } catch (err) {
        console.error('Tool execution error:', err)
      }
    }

    setToolResults(results)
    setIsExecutingTools(false)
    setCurrentStep('summary')
  }


  // Step 5: Settle Session with proper logging and response handling
  const settleSession = async () => {
    if (!session) return

    setIsSettling(true)
    setError(null)

    const MAX_RETRIES = 3
    const TIMEOUT_MS = 60000 // 60 seconds for blockchain transactions
    const RETRY_DELAY_MS = 2000 // 2 seconds between retries

    // Helper to delay execution
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Helper to check if error is retryable (network errors)
    const isRetryableError = (err: unknown): boolean => {
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) return true
      if (err instanceof Error) {
        const msg = err.message.toLowerCase()
        return msg.includes('network') || msg.includes('timeout') || msg.includes('aborted') ||
               msg.includes('connection') || msg.includes('err_network')
      }
      return false
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        console.log(`[Settlement] Attempt ${attempt}/${MAX_RETRIES} - Initiating settlement for session ${session.sessionId}`)

        const response = await fetch(`${API_URL}/api/mcp/bilateral/${session.sessionId}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Check HTTP status first
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || `HTTP ${response.status}: Settlement failed`)
        }

        const data = await response.json()
        console.log('[Settlement] Response:', data)

        if (data.success) {
          const result = data.data
          console.log(`[Settlement] SUCCESS!`)
          console.log(`[Settlement]   TX Hash: ${result.transactionHash}`)
          console.log(`[Settlement]   Block: ${result.blockNumber}`)
          console.log(`[Settlement]   Amount: $${result.netAmount} USDC`)
          console.log(`[Settlement]   Direction: ${result.direction}`)
          console.log(`[Settlement]   Explorer: ${result.explorerUrl}`)

          // Store settlement result in session state
          setSession(prev => prev ? {
            ...prev,
            status: 'settled',
            settlementResult: {
              txHash: result.transactionHash,
              blockNumber: result.blockNumber,
              explorerUrl: result.explorerUrl,
              netAmount: result.netAmount,
              direction: result.direction
            }
          } : null)

          // Success - exit the retry loop
          setIsSettling(false)
          return
        } else {
          throw new Error(data.error?.message || 'Settlement failed')
        }
      } catch (err) {
        clearTimeout(timeoutId)
        console.error(`[Settlement] Attempt ${attempt} failed:`, err)

        // Determine error type for user-friendly message
        let errorMessage: string
        if (err instanceof Error && err.name === 'AbortError') {
          errorMessage = 'Settlement request timed out (60s). The blockchain may be congested.'
        } else if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
          errorMessage = 'Network connection lost. Please check your internet connection.'
        } else if (err instanceof Error) {
          errorMessage = err.message
        } else {
          errorMessage = 'Failed to settle session'
        }

        // If this is a retryable error and we have attempts left, retry
        if (isRetryableError(err) && attempt < MAX_RETRIES) {
          console.log(`[Settlement] Retryable error detected. Waiting ${RETRY_DELAY_MS}ms before retry...`)
          setError(`Network error. Retrying... (${attempt}/${MAX_RETRIES})`)
          await delay(RETRY_DELAY_MS)
          continue
        }

        // No more retries or non-retryable error
        if (attempt === MAX_RETRIES && isRetryableError(err)) {
          errorMessage = `Settlement failed after ${MAX_RETRIES} attempts. Please check your connection and try again.`
        }

        setError(errorMessage)
        setIsSettling(false)
        return
      }
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
    if (modelId === comparison.recommended) badges.push({ label: 'Recommended', color: 'badge badge-accent' })
    if (modelId === comparison.cheapest) badges.push({ label: 'Cheapest', color: 'badge badge-success' })
    if (modelId === comparison.fastest) badges.push({ label: 'Fastest', color: 'badge badge-info' })
    return badges
  }

  if (!isClient) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        title="Synapse Demo"
        subtitle="Full End-to-End Flow"
        icon={<Zap className="w-6 h-6" />}
        rightContent={
          identity && walletBalance ? (
            <div className="badge badge-success">
              <DollarSign className="w-4 h-4 mr-1" />
              {walletBalance.usdc} USDC
            </div>
          ) : null
        }
      />

      <main className="page-content max-w-5xl">
        {/* Hero */}
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold gradient-text mb-2">
            LLM + Intent + x402 + MCP
          </h1>
          <p className="text-dark-400">Complete end-to-end flow with real payments on Base Sepolia</p>
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
                  isActive ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30' :
                  isPast ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  'bg-dark-800 text-dark-500 border border-dark-700'
                }`}>
                  {isPast ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  <span className="text-xs font-medium hidden sm:inline">{stepLabels[step]}</span>
                </div>
                {idx < 5 && <ArrowRight className="w-4 h-4 text-dark-600 mx-1" />}
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
              className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400"
            >
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto btn-ghost text-red-300 hover:text-red-200 px-2 py-1">Dismiss</button>
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
              className="card p-8"
            >
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-accent-500/20 to-cyan-500/20 flex items-center justify-center">
                  <Shield className="w-10 h-10 text-accent-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Step 1: Create Agent Identity</h2>
                <p className="text-dark-400 mb-6 max-w-md mx-auto">
                  Generate a cryptographic wallet identity for your agent. This wallet will hold USDC for payments.
                </p>

                {/* Faucet Link */}
                <div className="glass-accent rounded-lg p-4 mb-6 max-w-md mx-auto">
                  <p className="text-sm text-accent-400 mb-2">Need testnet USDC?</p>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-accent-300 hover:text-accent-200"
                  >
                    <CreditCard className="w-4 h-4" />
                    Get Base Sepolia USDC from Circle Faucet
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <button
                  onClick={createIdentity}
                  disabled={isCreatingIdentity}
                  className="btn-glow px-8 py-4 text-lg glow disabled:opacity-50"
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
              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-accent-400" />
                    </div>
                    <div>
                      <div className="text-sm text-dark-400">Agent Wallet</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white">{identity.address.slice(0, 10)}...{identity.address.slice(-8)}</span>
                        <button onClick={copyAddress} className="p-1 hover:bg-dark-700 rounded">
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-dark-400" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {walletBalance && (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-dark-400">Platform Credits</div>
                        <div className="text-xl font-bold text-emerald-400">${walletBalance.usdc} USDC</div>
                      </div>
                      <button onClick={() => fetchBalance(PLATFORM_WALLET)} className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700" title="Refresh platform wallet balance">
                        <RefreshCw className="w-4 h-4 text-dark-400" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Prompt Input */}
              <div className="card p-6">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-accent-400" />
                  Step 2: Enter Your Prompt
                </h2>
                <p className="text-dark-400 mb-4">
                  LLMs will compete to answer your question. Try asking about weather or crypto prices to trigger MCP tools!
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., What's the weather like in New York today?"
                  className="input min-h-[100px] resize-none mb-4"
                />
                <button
                  onClick={submitPrompt}
                  disabled={!prompt.trim() || isSubmitting}
                  className="btn-glow w-full flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50"
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
              className="card p-8 text-center"
            >
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="w-24 h-24 border-4 border-accent-500/30 rounded-full animate-spin border-t-accent-500" />
                <Users className="w-10 h-10 text-accent-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">LLMs are Competing</h2>
              <p className="text-dark-400">Multiple AI models are generating responses...</p>
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
              <div className="card p-6">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  {llmIntent.bids.length} Models Competed
                </h2>
                <p className="text-dark-400 mb-4">Select your preferred response. Payment: $0.005 USDC</p>

                <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
                  <div className="text-xs text-dark-500 mb-1">Your Prompt</div>
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
                      className={`card p-6 ${
                        isSelected ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/20' :
                        bid.rank === 1 ? 'border-accent-500/30' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            bid.rank === 1 ? 'bg-accent-500/20' : 'bg-dark-800'
                          }`}>
                            {bid.rank === 1 ? <Trophy className="w-5 h-5 text-accent-400" /> :
                              <span className="text-dark-400 font-bold">#{bid.rank}</span>}
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-white">{bid.modelId}</h4>
                            <div className="text-sm text-dark-500">{bid.provider}</div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {badges.map((b, i) => (
                            <span key={i} className={b.color}>{b.label}</span>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-dark-800/50 rounded-lg">
                        <div>
                          <div className="text-xs text-dark-400">Score</div>
                          <div className="text-lg font-bold text-accent-400">{bid.calculatedScore}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-dark-400">Latency</div>
                          <div className="text-lg font-bold text-cyan-400">{bid.latency.toFixed(0)}ms</div>
                        </div>
                        <div>
                          <div className="text-xs text-dark-400">Quality</div>
                          <div className="text-lg font-bold text-amber-400">{bid.qualityScore.toFixed(1)}/10</div>
                        </div>
                      </div>

                      <div className="bg-dark-800/30 rounded-lg p-4 mb-4 max-h-32 overflow-y-auto">
                        <div className="text-sm text-dark-300 whitespace-pre-wrap">
                          {bid.response && bid.response.trim().length > 0
                            ? bid.response
                            : <span className="text-dark-500 italic">No response content available</span>
                          }
                        </div>
                      </div>

                      <button
                        onClick={() => selectModel(bid)}
                        disabled={isSelecting}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                          isSelecting && isSelected ? 'bg-accent-600/50 text-white' :
                          isSelecting ? 'bg-dark-700 text-dark-400 cursor-not-allowed' :
                          bid.rank === 1 ? 'btn-glow' :
                          'btn-secondary'
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
              className="card p-8"
            >
              <div className="text-center mb-6">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  {isExecutingTools ? (
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                  ) : (
                    <Wrench className="w-10 h-10 text-cyan-400" />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {isExecutingTools ? 'Executing MCP Tools...' : 'Tools Executed'}
                </h2>
                <p className="text-dark-400">
                  The LLM detected tool calls in its response and triggered MCP tools automatically
                </p>
              </div>

              {toolResults.length > 0 && (
                <div className="space-y-4">
                  {toolResults.map((result, idx) => (
                    <div key={idx} className="bg-dark-800/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Plug className="w-5 h-5 text-cyan-400" />
                          <span className="font-bold text-white">{result.toolName}</span>
                        </div>
                        <span className="text-emerald-400 font-mono text-sm">${result.cost.toFixed(4)} USDC</span>
                      </div>
                      <pre className="bg-dark-900/50 rounded-lg p-3 text-sm text-dark-300 overflow-x-auto">
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
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-emerald-400 mb-2">Flow Complete!</h2>
                <p className="text-dark-400">LLM response received{toolResults.length > 0 ? ' with tool augmentation' : ''}</p>
              </div>

              {/* Selected Response */}
              {selectedBid && (
                <div className="card p-6">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-accent-400" />
                    Selected Response: {selectedBid.modelId}
                  </h3>
                  <div className="bg-dark-800/50 rounded-lg p-4 text-dark-300">
                    {selectedBid.response}
                  </div>
                  {toolResults.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-dark-700">
                      <h4 className="text-sm font-bold text-cyan-400 mb-2 flex items-center gap-2">
                        <Plug className="w-4 h-4" />
                        Tool Results:
                      </h4>
                      {toolResults.map((result, idx) => (
                        <div key={idx} className="bg-dark-800/30 rounded-lg p-3 text-sm">
                          <span className="text-dark-400">{result.toolName}: </span>
                          <span className="text-white">{JSON.stringify(result.output)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Session Summary */}
              <div className="card p-6">
                <button
                  onClick={() => setShowTransactions(!showTransactions)}
                  className="w-full flex items-center justify-between mb-4"
                >
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-dark-400" />
                    Session Transactions ({session.transactions.length})
                  </h3>
                  {showTransactions ? <ChevronUp className="w-5 h-5 text-dark-400" /> : <ChevronDown className="w-5 h-5 text-dark-400" />}
                </button>

                {showTransactions && (
                  <div className="space-y-2 mb-4">
                    {session.transactions.map((tx) => (
                      <div key={tx.id} className={`p-3 rounded-lg ${
                        tx.type === 'llm' ? 'bg-accent-500/10 border border-accent-500/20' : 'bg-cyan-500/10 border border-cyan-500/20'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {tx.type === 'llm' ? <Brain className="w-5 h-5 text-accent-400" /> : <Plug className="w-5 h-5 text-cyan-400" />}
                            <span className="text-white">{tx.resource}</span>
                          </div>
                          <span className={`font-mono ${tx.type === 'llm' ? 'text-accent-400' : 'text-cyan-400'}`}>
                            ${tx.amount.toFixed(4)}
                          </span>
                        </div>
                        {tx.txHash && tx.txHash.startsWith('0x') && (
                          <div className="mt-2 flex items-center gap-2">
                            <a
                              href={`https://sepolia.basescan.org/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View on BaseScan: {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-dark-800/50 rounded-lg mb-4">
                  <span className="text-dark-400">Total Spent</span>
                  <span className="text-2xl font-bold text-emerald-400">${session.totalSpent.toFixed(4)} USDC</span>
                </div>

                {session.status === 'active' ? (
                  <button
                    onClick={settleSession}
                    disabled={isSettling}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold transition-all"
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
                  <div className="space-y-3">
                    <div className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-5 h-5" />
                      Session Settled
                    </div>

                    {/* Settlement Transaction Details */}
                    {session.settlementResult && (
                      <div className="p-4 bg-dark-800/50 rounded-lg border border-emerald-500/30 space-y-3">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-emerald-400" />
                          Settlement Transaction
                        </h4>
                        <div className="flex items-center justify-between">
                          <span className="text-dark-400 text-sm">Amount</span>
                          <span className="text-emerald-400 font-semibold">
                            ${session.settlementResult.netAmount?.toFixed(4) || '0.0000'} USDC
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-dark-400 text-sm">Direction</span>
                          <span className="text-white text-sm">
                            {session.settlementResult.direction?.replace(/-/g, ' → ') || 'N/A'}
                          </span>
                        </div>
                        {session.settlementResult.blockNumber && (
                          <div className="flex items-center justify-between">
                            <span className="text-dark-400 text-sm">Block</span>
                            <span className="text-white text-sm">#{session.settlementResult.blockNumber}</span>
                          </div>
                        )}
                        {session.settlementResult.txHash && (
                          <div className="flex items-center justify-between">
                            <span className="text-dark-400 text-sm">TX Hash</span>
                            <span className="text-white text-sm font-mono">
                              {session.settlementResult.txHash.slice(0, 10)}...{session.settlementResult.txHash.slice(-8)}
                            </span>
                          </div>
                        )}
                        {session.settlementResult.explorerUrl && (
                          <a
                            href={session.settlementResult.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full px-3 py-2 mt-2 rounded-lg bg-accent-600/20 text-accent-400 hover:bg-accent-600/30 transition-colors text-sm"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Settlement on BaseScan
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* New Demo Button */}
              <button
                onClick={resetDemo}
                className="btn-secondary w-full flex items-center justify-center gap-2 py-3"
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
