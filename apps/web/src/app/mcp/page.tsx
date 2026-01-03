'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plug, Wallet, Users, ArrowLeftRight, DollarSign, Clock, Check,
  Copy, AlertCircle, Loader2, Shield, ExternalLink, RefreshCw,
  Home, Wifi, Plus, ArrowRight, ArrowDown, ChevronDown, ChevronUp,
  Zap, Scale, Receipt, CheckCircle2, Cloud, Bitcoin, Newspaper,
  Play, GitBranch, Layers, History
} from 'lucide-react'
import Link from 'next/link'
import { API_URL } from '@/lib/config'

// Types
interface MCPIdentity {
  clientId: string
  address: string
  publicKey: string
  network: string
  createdAt: number
}

interface OnChainBalance {
  usdc: number
  eth: number
  usdcWei: string
  ethWei: string
}

interface ToolResult {
  success: boolean
  data: Record<string, unknown>
  latencyMs: number
  source: string
  cost: number
}

interface SubIntent {
  id: string
  type: string
  params: Record<string, unknown>
  estimatedCost: number
  toolName: string
}

interface DecompositionResult {
  planId: string
  originalIntent: string
  parsedAs: string
  subIntents: SubIntent[]
  executionPlan: {
    batches: Array<{
      batchNumber: number
      parallel: boolean
      intents: SubIntent[]
    }>
  }
  totalEstimatedCost: number
  estimatedTimeMs: number
}

interface BilateralSession {
  sessionId: string
  clientId: string
  serverId: string
  clientAddress: string
  serverAddress: string
  clientPaidTotal: number
  serverPaidTotal: number
  netBalance: number
  transactionCount: number
  status: string
  createdAt: number
}

interface Transaction {
  id: string
  payer: 'client' | 'server'
  amount: number
  resource: string
  timestamp: number
}

interface SettlementResult {
  sessionId: string
  netAmount: number
  direction: string
  fromAddress: string
  toAddress: string
  txHash?: string | null
  totalTransactions: number
}

type TabType = 'tools' | 'decomposition' | 'bilateral'

const TOOLS = [
  { name: 'weather.current', label: 'Weather', icon: Cloud, price: 0.005, placeholder: 'City name (e.g., New York)' },
  { name: 'crypto.price', label: 'Crypto Price', icon: Bitcoin, price: 0.003, placeholder: 'Symbol (e.g., BTC, ETH)' },
  { name: 'news.latest', label: 'News', icon: Newspaper, price: 0.005, placeholder: 'Search query (optional)' },
]

export default function MCPPage() {
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('tools')

  // Identity state
  const [clientIdentity, setClientIdentity] = useState<MCPIdentity | null>(null)
  const [clientBalance, setClientBalance] = useState<OnChainBalance | null>(null)
  const [serverIdentity, setServerIdentity] = useState<MCPIdentity | null>(null)
  const [serverBalance, setServerBalance] = useState<OnChainBalance | null>(null)
  const [isCreatingIdentity, setIsCreatingIdentity] = useState<'client' | 'server' | null>(null)

  // Tool execution state
  const [selectedTool, setSelectedTool] = useState(TOOLS[0])
  const [toolInput, setToolInput] = useState('')
  const [isExecutingTool, setIsExecutingTool] = useState(false)
  const [toolResults, setToolResults] = useState<ToolResult[]>([])
  const [sessionSpend, setSessionSpend] = useState(0)

  // Decomposition state
  const [intentInput, setIntentInput] = useState('')
  const [isDecomposing, setIsDecomposing] = useState(false)
  const [decompositionResult, setDecompositionResult] = useState<DecompositionResult | null>(null)
  const [isExecutingPlan, setIsExecutingPlan] = useState(false)
  const [planResults, setPlanResults] = useState<Record<string, ToolResult>>({})

  // Session state
  const [currentSession, setCurrentSession] = useState<BilateralSession | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentResource, setPaymentResource] = useState('')
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentDirection, setPaymentDirection] = useState<'client' | 'server'>('client')

  // Settlement state
  const [isSettling, setIsSettling] = useState(false)
  const [settlementResult, setSettlementResult] = useState<SettlementResult | null>(null)

  // UI state
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTransactions, setShowTransactions] = useState(true)
  const [showSessionHistory, setShowSessionHistory] = useState(false)
  const [sessionHistory, setSessionHistory] = useState<BilateralSession[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Fetch on-chain balance from API
  const fetchBalance = useCallback(async (address: string): Promise<OnChainBalance | null> => {
    try {
      console.log('[MCP] API_URL from config:', API_URL)
      console.log('[MCP] Fetching balance for:', address)
      const url = `${API_URL}/api/wallet/${address}/onchain-balance`
      console.log('[MCP] Fetch URL:', url)
      const response = await fetch(url)
      const data = await response.json()
      console.log('[MCP] Balance response:', data)
      if (data.success) {
        return data.data
      } else {
        console.error('[MCP] Balance fetch failed:', data.error)
      }
    } catch (err) {
      console.error('[MCP] Failed to fetch balance:', err)
    }
    return null
  }, [])

  // Fetch balance for a specific address and update state
  const fetchBalanceForAddress = useCallback(async (address: string, type: 'client' | 'server') => {
    console.log('[MCP] fetchBalanceForAddress called:', address, type)
    try {
      const balance = await fetchBalance(address)
      console.log('[MCP] Got balance for', type, ':', balance)
      if (balance) {
        console.log('[MCP] Setting', type, 'balance to:', balance.usdc, 'USDC')
        if (type === 'client') {
          setClientBalance(balance)
          console.log('[MCP] Client balance state updated')
        } else {
          setServerBalance(balance)
          console.log('[MCP] Server balance state updated')
        }
      } else {
        console.log('[MCP] Balance was null/undefined for', type)
      }
    } catch (err) {
      console.error('[MCP] Error in fetchBalanceForAddress:', err)
    }
  }, [fetchBalance])

  // Refresh balances for both identities
  const refreshBalances = useCallback(async () => {
    if (clientIdentity) {
      await fetchBalanceForAddress(clientIdentity.address, 'client')
    }
    if (serverIdentity) {
      await fetchBalanceForAddress(serverIdentity.address, 'server')
    }
  }, [clientIdentity, serverIdentity, fetchBalanceForAddress])

  // Sync identity from server (verify it exists on backend with private key)
  const syncIdentityFromServer = async (clientId: string): Promise<MCPIdentity | null> => {
    try {
      const response = await fetch(`${API_URL}/api/mcp/identity/${clientId}`)
      const data = await response.json()
      if (data.success) {
        console.log('[MCP] Synced identity from server:', data.data.address)
        return data.data
      }
    } catch (err) {
      console.error('[MCP] Failed to sync identity from server:', err)
    }
    return null
  }

  // Load identities from localStorage on mount
  useEffect(() => {
    setIsClient(true)

    const loadAndSyncIdentities = async () => {
      // Load persisted identities from localStorage
      const savedClientIdentity = localStorage.getItem('mcp_client_identity')
      const savedServerIdentity = localStorage.getItem('mcp_server_identity')

      console.log('[MCP] Loading from localStorage:', {
        hasClient: !!savedClientIdentity,
        hasServer: !!savedServerIdentity
      })

      if (savedClientIdentity) {
        try {
          const identity = JSON.parse(savedClientIdentity)
          console.log('[MCP] Parsed client identity:', identity.address)

          // Sync with server to ensure private key exists
          const serverIdentity = await syncIdentityFromServer(identity.clientId)
          if (serverIdentity) {
            // Server has this identity with private key
            setClientIdentity(serverIdentity)
            localStorage.setItem('mcp_client_identity', JSON.stringify(serverIdentity))
          } else {
            // Server doesn't have private key - warn user
            console.warn('[MCP] Server does not have private key for client identity. Settlement may fail.')
            setClientIdentity(identity)
          }
        } catch (e) {
          console.error('[MCP] Failed to parse saved client identity:', e)
        }
      }

      if (savedServerIdentity) {
        try {
          const identity = JSON.parse(savedServerIdentity)
          console.log('[MCP] Parsed server identity:', identity.address)

          // Sync with server to ensure private key exists
          const syncedServerIdentity = await syncIdentityFromServer(identity.clientId)
          if (syncedServerIdentity) {
            // Server has this identity with private key
            setServerIdentity(syncedServerIdentity)
            localStorage.setItem('mcp_server_identity', JSON.stringify(syncedServerIdentity))
          } else {
            // Server doesn't have private key - warn user
            console.warn('[MCP] Server does not have private key for server identity. Settlement may fail.')
            setServerIdentity(identity)
          }
        } catch (e) {
          console.error('[MCP] Failed to parse saved server identity:', e)
        }
      }
    }

    loadAndSyncIdentities()
  }, [])

  // Fetch balances when identities change
  useEffect(() => {
    console.log('[MCP] Client identity useEffect triggered, identity:', clientIdentity?.address || 'null')
    if (clientIdentity) {
      console.log('[MCP] Client identity set, fetching balance:', clientIdentity.address)
      fetchBalanceForAddress(clientIdentity.address, 'client')
    }
  }, [clientIdentity, fetchBalanceForAddress])

  useEffect(() => {
    console.log('[MCP] Server identity useEffect triggered, identity:', serverIdentity?.address || 'null')
    if (serverIdentity) {
      console.log('[MCP] Server identity set, fetching balance:', serverIdentity.address)
      fetchBalanceForAddress(serverIdentity.address, 'server')
    }
  }, [serverIdentity, fetchBalanceForAddress])

  // Debug: Log balance state changes
  useEffect(() => {
    console.log('[MCP] clientBalance state changed:', clientBalance)
    if (clientBalance) {
      console.log('[MCP] Client balance usdc value:', clientBalance.usdc, 'type:', typeof clientBalance.usdc)
    }
  }, [clientBalance])

  useEffect(() => {
    console.log('[MCP] serverBalance state changed:', serverBalance)
    if (serverBalance) {
      console.log('[MCP] Server balance usdc value:', serverBalance.usdc, 'type:', typeof serverBalance.usdc)
    }
  }, [serverBalance])

  // Debug: Force re-fetch balances after identities are loaded
  const [balanceFetchAttempted, setBalanceFetchAttempted] = useState(false)
  useEffect(() => {
    if (balanceFetchAttempted) return
    if (!clientIdentity && !serverIdentity) return

    // Wait a bit for React to settle, then fetch balances
    const timer = setTimeout(async () => {
      console.log('[MCP] Delayed balance fetch trigger - identities loaded')
      setBalanceFetchAttempted(true)

      if (clientIdentity) {
        console.log('[MCP] Delayed fetch for client:', clientIdentity.address)
        try {
          const balance = await fetchBalance(clientIdentity.address)
          console.log('[MCP] Delayed client balance result:', balance)
          if (balance) setClientBalance(balance)
        } catch (e) {
          console.error('[MCP] Delayed client balance error:', e)
        }
      }
      if (serverIdentity) {
        console.log('[MCP] Delayed fetch for server:', serverIdentity.address)
        try {
          const balance = await fetchBalance(serverIdentity.address)
          console.log('[MCP] Delayed server balance result:', balance)
          if (balance) setServerBalance(balance)
        } catch (e) {
          console.error('[MCP] Delayed server balance error:', e)
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [clientIdentity, serverIdentity, balanceFetchAttempted, fetchBalance])

  // Copy to clipboard
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Create MCP Identity
  const createIdentity = async (type: 'client' | 'server') => {
    setIsCreatingIdentity(type)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/mcp/identity/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: type === 'client' ? 'demo-mcp-client' : 'demo-mcp-server'
        })
      })

      const data = await response.json()

      if (data.success) {
        if (type === 'client') {
          setClientIdentity(data.data)
          localStorage.setItem('mcp_client_identity', JSON.stringify(data.data))
          const balance = await fetchBalance(data.data.address)
          setClientBalance(balance)
        } else {
          setServerIdentity(data.data)
          localStorage.setItem('mcp_server_identity', JSON.stringify(data.data))
          const balance = await fetchBalance(data.data.address)
          setServerBalance(balance)
        }
      } else {
        setError(data.error?.message || 'Failed to create identity')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsCreatingIdentity(null)
    }
  }

  // Execute Tool
  const executeTool = async () => {
    setIsExecutingTool(true)
    setError(null)

    try {
      const toolInput_: Record<string, string> = {}
      if (selectedTool.name === 'weather.current') {
        toolInput_.city = toolInput || 'New York'
      } else if (selectedTool.name === 'crypto.price') {
        toolInput_.symbol = toolInput || 'BTC'
      } else if (selectedTool.name === 'news.latest') {
        toolInput_.query = toolInput || 'technology'
      }

      const response = await fetch(`${API_URL}/api/mcp/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: selectedTool.name,
          toolInput: toolInput_
        })
      })

      const data = await response.json()

      if (data.success) {
        const result: ToolResult = {
          success: true,
          data: data.data,
          latencyMs: data.latencyMs,
          source: data.source,
          cost: selectedTool.price
        }
        setToolResults(prev => [result, ...prev])
        setSessionSpend(prev => prev + selectedTool.price)
        setToolInput('')
      } else {
        setError(data.error?.message || 'Tool execution failed')
      }
    } catch (err) {
      setError('Failed to execute tool')
    } finally {
      setIsExecutingTool(false)
    }
  }

  // Decompose Intent
  const decomposeIntent = async () => {
    setIsDecomposing(true)
    setError(null)
    setDecompositionResult(null)
    setPlanResults({})

    try {
      const response = await fetch(`${API_URL}/api/decomposition/simple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: intentInput })
      })

      const data = await response.json()

      if (data.success) {
        setDecompositionResult(data.data)
      } else {
        setError(data.error?.message || 'Failed to decompose intent')
      }
    } catch (err) {
      setError('Failed to decompose intent')
    } finally {
      setIsDecomposing(false)
    }
  }

  // Execute decomposition plan
  const executePlan = async () => {
    if (!decompositionResult) return

    setIsExecutingPlan(true)
    setError(null)

    try {
      for (const batch of decompositionResult.executionPlan.batches) {
        // Execute all intents in batch in parallel
        const promises = batch.intents.map(async (intent) => {
          const toolInput_: Record<string, string> = {}

          if (intent.type.includes('crypto')) {
            const symbols = intent.params.symbols as string[] || [intent.params.symbol as string] || ['BTC']
            // Execute for first symbol only in this demo
            toolInput_.symbol = symbols[0]
            const response = await fetch(`${API_URL}/api/mcp/tools/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: 'crypto.price', toolInput: toolInput_ })
            })
            return { id: intent.id, result: await response.json() }
          } else if (intent.type.includes('weather')) {
            const cities = intent.params.cities as string[] || [intent.params.city as string] || ['New York']
            toolInput_.city = cities[0]
            const response = await fetch(`${API_URL}/api/mcp/tools/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: 'weather.current', toolInput: toolInput_ })
            })
            return { id: intent.id, result: await response.json() }
          } else if (intent.type.includes('news')) {
            toolInput_.query = (intent.params.topic as string) || 'technology'
            const response = await fetch(`${API_URL}/api/mcp/tools/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ toolName: 'news.latest', toolInput: toolInput_ })
            })
            return { id: intent.id, result: await response.json() }
          }
          return { id: intent.id, result: { success: false, error: 'Unknown tool type' } }
        })

        const results = await Promise.all(promises)
        results.forEach(({ id, result }) => {
          setPlanResults(prev => ({
            ...prev,
            [id]: {
              success: result.success,
              data: result.data || {},
              latencyMs: result.latencyMs || 0,
              source: result.source || 'unknown',
              cost: 0.005
            }
          }))
        })
      }

      setSessionSpend(prev => prev + decompositionResult.totalEstimatedCost)
    } catch (err) {
      setError('Failed to execute plan')
    } finally {
      setIsExecutingPlan(false)
    }
  }

  // Create Bilateral Session
  const createSession = async () => {
    if (!clientIdentity || !serverIdentity) {
      setError('Both client and server identities are required')
      return
    }

    setIsCreatingSession(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/mcp/bilateral/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdentity.clientId,
          serverId: serverIdentity.clientId,
          clientAddress: clientIdentity.address,
          serverAddress: serverIdentity.address
        })
      })

      const data = await response.json()

      if (data.success) {
        setCurrentSession({
          sessionId: data.data.sessionId,
          clientId: clientIdentity.clientId,
          serverId: serverIdentity.clientId,
          clientAddress: data.data.clientAddress,
          serverAddress: data.data.serverAddress,
          clientPaidTotal: 0,
          serverPaidTotal: 0,
          netBalance: 0,
          transactionCount: 0,
          status: data.data.status,
          createdAt: data.data.createdAt
        })
        setTransactions([])
        setSettlementResult(null)
      } else {
        setError(data.error?.message || 'Failed to create session')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsCreatingSession(false)
    }
  }

  // Record Payment
  const recordPayment = async () => {
    if (!currentSession) return

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setIsProcessingPayment(true)
    setError(null)

    try {
      const endpoint = paymentDirection === 'client' ? 'client-payment' : 'server-payment'

      const response = await fetch(`${API_URL}/api/mcp/bilateral/${currentSession.sessionId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          resource: paymentResource || (paymentDirection === 'client' ? 'tool.usage' : 'data.provided')
        })
      })

      const data = await response.json()

      if (data.success) {
        setCurrentSession(prev => prev ? {
          ...prev,
          clientPaidTotal: data.data.clientPaidTotal ?? prev.clientPaidTotal,
          serverPaidTotal: data.data.serverPaidTotal ?? prev.serverPaidTotal,
          netBalance: data.data.netBalance,
          transactionCount: prev.transactionCount + 1
        } : null)
        setTransactions(prev => [...prev, {
          id: data.data.transactionId || `tx_${Date.now()}`,
          payer: paymentDirection,
          amount,
          resource: paymentResource || (paymentDirection === 'client' ? 'tool.usage' : 'data.provided'),
          timestamp: Date.now()
        }])
        setPaymentAmount('')
        setPaymentResource('')
      } else {
        setError(data.error?.message || 'Failed to record payment')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Settle Session
  const settleSession = async () => {
    if (!currentSession) return

    setIsSettling(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/mcp/bilateral/${currentSession.sessionId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (data.success) {
        setSettlementResult(data.data)
        setCurrentSession(prev => prev ? { ...prev, status: 'settled' } : null)

        // Refresh balances after settlement to show updated on-chain balances
        setTimeout(() => {
          console.log('[MCP] Refreshing balances after settlement...')
          refreshBalances()
        }, 2000) // Wait 2s for blockchain to confirm
      } else {
        setError(data.error?.message || 'Failed to settle session')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsSettling(false)
    }
  }

  // Fetch session history
  const fetchSessionHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const response = await fetch(`${API_URL}/api/mcp/bilateral/sessions`)
      const data = await response.json()
      if (data.success) {
        setSessionHistory(data.data.sessions)
      }
    } catch (err) {
      console.error('[MCP] Failed to fetch session history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Toggle session history view
  const toggleSessionHistory = () => {
    if (!showSessionHistory) {
      fetchSessionHistory()
    }
    setShowSessionHistory(!showSessionHistory)
  }

  // Reset everything
  const resetAll = () => {
    setClientIdentity(null)
    setClientBalance(null)
    setServerIdentity(null)
    setServerBalance(null)
    setCurrentSession(null)
    setTransactions([])
    setSettlementResult(null)
    setToolResults([])
    setDecompositionResult(null)
    setPlanResults({})
    setSessionSpend(0)
    setError(null)
    setShowSessionHistory(false)
    setSessionHistory([])
    // Clear persisted identities
    localStorage.removeItem('mcp_client_identity')
    localStorage.removeItem('mcp_server_identity')
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
              <Plug className="w-8 h-8 text-purple-400" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">MCP TOOLS</h1>
                <p className="text-xs text-gray-500">Real API Execution</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <div className="px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-500/30 text-green-400 text-sm">
                Session: ${sessionSpend.toFixed(4)} USDC
              </div>
              <Link
                href="/llm"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-900/30 text-purple-400 hover:bg-purple-900/50 transition-colors text-sm border border-purple-500/30"
              >
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">LLM Compare</span>
              </Link>
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Plug className="w-10 h-10 text-purple-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              MCP Tool Execution
            </h1>
          </div>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            Execute real tools, decompose complex intents, and settle payments on-chain
          </p>
        </motion.div>

        {/* Debug Panel - Shows current state */}
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700 text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <div className="text-yellow-400 font-bold">🔧 Debug Info</div>
            <button
              onClick={() => {
                console.log('[MCP] Manual refresh all balances clicked');
                refreshBalances();
              }}
              className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs"
            >
              Refresh Balances
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-400">Client Identity:</div>
              <div className="text-blue-400 break-all">{clientIdentity?.address || 'null'}</div>
              <div className="text-gray-400 mt-1">Client Balance:</div>
              <div className="text-green-400">
                {clientBalance ? `${clientBalance.usdc.toFixed(6)} USDC | ${clientBalance.eth.toFixed(6)} ETH` : 'null'}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Server Identity:</div>
              <div className="text-purple-400 break-all">{serverIdentity?.address || 'null'}</div>
              <div className="text-gray-400 mt-1">Server Balance:</div>
              <div className="text-green-400">
                {serverBalance ? `${serverBalance.usdc.toFixed(6)} USDC | ${serverBalance.eth.toFixed(6)} ETH` : 'null'}
              </div>
            </div>
          </div>
          <div className="mt-2 text-gray-500">
            Click &quot;Refresh Balances&quot; after settlement. If addresses don&apos;t match where you sent USDC, click &quot;Reset All&quot; in Bilateral tab.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 mb-8">
          {[
            { id: 'tools' as TabType, label: 'Tool Execution', icon: Play },
            { id: 'decomposition' as TabType, label: 'Intent Decomposition', icon: GitBranch },
            { id: 'bilateral' as TabType, label: 'Bilateral Settlement', icon: ArrowLeftRight },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
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
              <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-200">
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-8"
            >
              {/* Tool Selector */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5 text-purple-400" />
                  Execute Real Tools
                </h3>

                <div className="space-y-4">
                  {/* Tool Selection */}
                  <div className="grid grid-cols-3 gap-2">
                    {TOOLS.map(tool => (
                      <button
                        key={tool.name}
                        onClick={() => setSelectedTool(tool)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                          selectedTool.name === tool.name
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        <tool.icon className="w-6 h-6" />
                        <span className="text-xs">{tool.label}</span>
                        <span className="text-xs opacity-60">${tool.price}</span>
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <input
                    type="text"
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    placeholder={selectedTool.placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />

                  {/* Execute Button */}
                  <button
                    onClick={executeTool}
                    disabled={isExecutingTool}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold transition-all disabled:opacity-50"
                  >
                    {isExecutingTool ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        Execute (${selectedTool.price} USDC)
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Results */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-green-400" />
                  Results ({toolResults.length})
                </h3>

                {toolResults.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Execute a tool to see results
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {toolResults.map((result, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-purple-400">{result.source}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">{result.latencyMs}ms</span>
                            <span className="text-green-400">${result.cost}</span>
                          </div>
                        </div>
                        <pre className="text-sm text-gray-300 overflow-x-auto">
                          {JSON.stringify(result.data, null, 2).slice(0, 500)}
                        </pre>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'decomposition' && (
            <motion.div
              key="decomposition"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-8"
            >
              {/* Intent Input */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-purple-400" />
                  Decompose Complex Intent
                </h3>

                <div className="space-y-4">
                  <textarea
                    value={intentInput}
                    onChange={(e) => setIntentInput(e.target.value)}
                    placeholder="e.g., Get BTC and ETH prices with latest crypto news"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
                  />

                  <button
                    onClick={decomposeIntent}
                    disabled={isDecomposing || !intentInput.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold transition-all disabled:opacity-50"
                  >
                    {isDecomposing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Decomposing...
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-5 h-5" />
                        Decompose Intent
                      </>
                    )}
                  </button>

                  {/* Example intents */}
                  <div className="pt-2">
                    <p className="text-xs text-gray-500 mb-2">Try these examples:</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Get BTC and ETH prices',
                        'Bitcoin price with crypto news',
                        'Weather in New York and crypto dashboard',
                      ].map(example => (
                        <button
                          key={example}
                          onClick={() => setIntentInput(example)}
                          className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Decomposition Result */}
              <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  Execution Plan
                </h3>

                {!decompositionResult ? (
                  <div className="text-center py-8 text-gray-500">
                    Enter an intent and click Decompose to see the execution plan
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Parsed Intent */}
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">Parsed As</div>
                      <div className="text-purple-400 font-mono">{decompositionResult.parsedAs}</div>
                    </div>

                    {/* Execution Batches */}
                    <div className="space-y-3">
                      {decompositionResult.executionPlan.batches.map((batch, batchIdx) => (
                        <div key={batchIdx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-400">
                              Batch {batch.batchNumber}
                            </span>
                            {batch.parallel && (
                              <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-400">
                                Parallel
                              </span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {batch.intents.map(intent => (
                              <div key={intent.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  {planResults[intent.id] ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full border border-gray-600" />
                                  )}
                                  <span className="text-gray-300">{intent.type}</span>
                                </div>
                                <span className="text-green-400">${intent.estimatedCost.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                      <span className="text-gray-400">Total Estimated Cost</span>
                      <span className="text-lg font-bold text-green-400">
                        ${decompositionResult.totalEstimatedCost.toFixed(4)} USDC
                      </span>
                    </div>

                    {/* Execute Button */}
                    <button
                      onClick={executePlan}
                      disabled={isExecutingPlan || Object.keys(planResults).length > 0}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold transition-all disabled:opacity-50"
                    >
                      {isExecutingPlan ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Executing Plan...
                        </>
                      ) : Object.keys(planResults).length > 0 ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Plan Executed
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5" />
                          Execute All Sub-Intents
                        </>
                      )}
                    </button>

                    {/* Results */}
                    {Object.keys(planResults).length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-semibold text-gray-400">Results</h4>
                        {Object.entries(planResults).map(([id, result]) => (
                          <div key={id} className="bg-gray-800/50 rounded-lg p-3 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-purple-400">{result.source}</span>
                              <span className="text-gray-500">{result.latencyMs}ms</span>
                            </div>
                            <pre className="text-xs text-gray-400 overflow-x-auto">
                              {JSON.stringify(result.data, null, 2).slice(0, 200)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'bilateral' && (
            <motion.div
              key="bilateral"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-8"
            >
              {/* Left Column - Identities */}
              <div className="space-y-6">
                {/* Client Identity */}
                <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-400" />
                      MCP Client Identity
                    </h3>
                    {clientIdentity && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Active</span>
                    )}
                  </div>

                  {clientIdentity ? (
                    <div className="space-y-3">
                      <div className="bg-gray-800/50 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Wallet Address</div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-blue-400">{clientIdentity.address.slice(0, 10)}...{clientIdentity.address.slice(-8)}</span>
                          <button
                            onClick={() => copyToClipboard(clientIdentity.address, 'clientAddr')}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            {copied === 'clientAddr' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        </div>
                      </div>
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-gray-400">On-Chain Balance (Base Sepolia)</div>
                          <button
                            onClick={() => {
                              console.log('[MCP] Manual refresh clicked for client');
                              fetchBalanceForAddress(clientIdentity.address, 'client');
                            }}
                            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-blue-400"
                            title="Refresh balance"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-green-400 font-bold">
                              {clientBalance !== null && clientBalance !== undefined
                                ? (typeof clientBalance.usdc === 'number' ? clientBalance.usdc.toFixed(4) : String(clientBalance.usdc))
                                : '...'} USDC
                            </span>
                            <span className="text-gray-500 mx-2">|</span>
                            <span className="text-gray-400">
                              {clientBalance !== null && clientBalance !== undefined
                                ? (typeof clientBalance.eth === 'number' ? clientBalance.eth.toFixed(4) : String(clientBalance.eth))
                                : '...'} ETH
                            </span>
                          </div>
                          <a
                            href={`https://sepolia.basescan.org/address/${clientIdentity.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => createIdentity('client')}
                      disabled={isCreatingIdentity !== null}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingIdentity === 'client' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Identity...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Create Client Identity
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Server Identity */}
                <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Shield className="w-5 h-5 text-purple-400" />
                      MCP Server Identity
                    </h3>
                    {serverIdentity && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Active</span>
                    )}
                  </div>

                  {serverIdentity ? (
                    <div className="space-y-3">
                      <div className="bg-gray-800/50 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Wallet Address</div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-purple-400">{serverIdentity.address.slice(0, 10)}...{serverIdentity.address.slice(-8)}</span>
                          <button
                            onClick={() => copyToClipboard(serverIdentity.address, 'serverAddr')}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            {copied === 'serverAddr' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        </div>
                      </div>
                      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-gray-400">On-Chain Balance (Base Sepolia)</div>
                          <button
                            onClick={() => {
                              console.log('[MCP] Manual refresh clicked for server');
                              fetchBalanceForAddress(serverIdentity.address, 'server');
                            }}
                            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-purple-400"
                            title="Refresh balance"
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-green-400 font-bold">
                              {serverBalance !== null && serverBalance !== undefined
                                ? (typeof serverBalance.usdc === 'number' ? serverBalance.usdc.toFixed(4) : String(serverBalance.usdc))
                                : '...'} USDC
                            </span>
                            <span className="text-gray-500 mx-2">|</span>
                            <span className="text-gray-400">
                              {serverBalance !== null && serverBalance !== undefined
                                ? (typeof serverBalance.eth === 'number' ? serverBalance.eth.toFixed(4) : String(serverBalance.eth))
                                : '...'} ETH
                            </span>
                          </div>
                          <a
                            href={`https://sepolia.basescan.org/address/${serverIdentity.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => createIdentity('server')}
                      disabled={isCreatingIdentity !== null}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingIdentity === 'server' ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating Identity...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Create Server Identity
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Create Session Button */}
                {clientIdentity && serverIdentity && !currentSession && (
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={createSession}
                    disabled={isCreatingSession}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white font-semibold text-lg transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingSession ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        Creating Session...
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight className="w-6 h-6" />
                        Start Bilateral Session
                      </>
                    )}
                  </motion.button>
                )}
              </div>

              {/* Right Column - Session & Transactions */}
              <div className="space-y-6">
                {/* Session Info */}
                {currentSession && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-purple-900/30 to-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Scale className="w-5 h-5 text-purple-400" />
                        Bilateral Session
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        currentSession.status === 'settled'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {currentSession.status}
                      </span>
                    </div>

                    {/* Session Addresses - IMPORTANT: These are used for settlement */}
                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
                      <div className="text-xs text-yellow-400 font-semibold mb-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Settlement Addresses (On-Chain Transfer)
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <div className="text-gray-400">Client receives at:</div>
                          <div className="text-blue-400 break-all">{currentSession.clientAddress}</div>
                          {clientIdentity && clientIdentity.address !== currentSession.clientAddress && (
                            <div className="text-red-400 mt-1">⚠️ Different from current identity!</div>
                          )}
                        </div>
                        <div>
                          <div className="text-gray-400">Server receives at:</div>
                          <div className="text-purple-400 break-all">{currentSession.serverAddress}</div>
                          {serverIdentity && serverIdentity.address !== currentSession.serverAddress && (
                            <div className="text-red-400 mt-1">⚠️ Different from current identity!</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        Net {currentSession.netBalance >= 0 ? 'positive' : 'negative'}: Server pays Client ${Math.abs(currentSession.netBalance).toFixed(4)} USDC
                      </div>
                    </div>

                    {/* Balance Overview */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 text-center">
                        <ArrowDown className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <div className="text-xs text-gray-400">Client Paid</div>
                        <div className="text-lg font-bold text-blue-400">${currentSession.clientPaidTotal.toFixed(4)}</div>
                      </div>
                      <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-3 text-center">
                        <ArrowDown className="w-5 h-5 text-purple-400 mx-auto mb-1 rotate-180" />
                        <div className="text-xs text-gray-400">Server Paid</div>
                        <div className="text-lg font-bold text-purple-400">${currentSession.serverPaidTotal.toFixed(4)}</div>
                      </div>
                      <div className={`${currentSession.netBalance >= 0 ? 'bg-green-900/30 border-green-500/30' : 'bg-red-900/30 border-red-500/30'} border rounded-lg p-3 text-center`}>
                        <Scale className="w-5 h-5 mx-auto mb-1" style={{ color: currentSession.netBalance >= 0 ? '#4ade80' : '#f87171' }} />
                        <div className="text-xs text-gray-400">Net Balance</div>
                        <div className={`text-lg font-bold ${currentSession.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {currentSession.netBalance >= 0 ? '+' : ''}{currentSession.netBalance.toFixed(4)}
                        </div>
                      </div>
                    </div>

                    {/* Record Payment */}
                    {currentSession.status !== 'settled' && (
                      <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
                        <h4 className="text-sm font-semibold text-gray-300 mb-3">Record Payment</h4>
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => setPaymentDirection('client')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                              paymentDirection === 'client'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            <ArrowRight className="w-4 h-4" />
                            Client → Server
                          </button>
                          <button
                            onClick={() => setPaymentDirection('server')}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                              paymentDirection === 'server'
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            <ArrowRight className="w-4 h-4 rotate-180" />
                            Server → Client
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder="Amount"
                            step="0.01"
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
                          />
                          <button
                            onClick={recordPayment}
                            disabled={isProcessingPayment || !paymentAmount}
                            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold disabled:opacity-50"
                          >
                            {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Settle Button */}
                    {currentSession.status !== 'settled' && transactions.length > 0 && (
                      <button
                        onClick={settleSession}
                        disabled={isSettling}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold transition-all"
                      >
                        {isSettling ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Settling...
                          </>
                        ) : (
                          <>
                            <Receipt className="w-5 h-5" />
                            Settle (${Math.abs(currentSession.netBalance).toFixed(4)})
                          </>
                        )}
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Settlement Result */}
                {settlementResult && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                      <div>
                        <h3 className="text-xl font-bold text-green-400">Session Settled!</h3>
                        <p className="text-gray-400 text-sm">{settlementResult.totalTransactions} transactions</p>
                      </div>
                    </div>
                    <div className="space-y-2 bg-gray-800/50 rounded-lg p-4">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Net Amount:</span>
                        <span className="text-green-400 font-bold">${settlementResult.netAmount.toFixed(4)} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Direction:</span>
                        <span className="text-white">{settlementResult.direction}</span>
                      </div>
                      <div className="pt-2 border-t border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">From:</div>
                        <div className="text-xs font-mono text-purple-400 break-all">{settlementResult.fromAddress}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">To:</div>
                        <div className="text-xs font-mono text-blue-400 break-all">{settlementResult.toAddress}</div>
                      </div>
                      {settlementResult.txHash && (
                        <div className="pt-2">
                          <a
                            href={`https://sepolia.basescan.org/tx/${settlementResult.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-green-400 hover:text-green-300"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View on BaseScan: {settlementResult.txHash.slice(0, 10)}...{settlementResult.txHash.slice(-8)}
                          </a>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={resetAll}
                      className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Start New Session
                    </button>
                  </motion.div>
                )}

                {/* Transactions */}
                {transactions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
                  >
                    <button
                      onClick={() => setShowTransactions(!showTransactions)}
                      className="w-full flex items-center justify-between mb-4"
                    >
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-gray-400" />
                        Transactions ({transactions.length})
                      </h3>
                      {showTransactions ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </button>

                    <AnimatePresence>
                      {showTransactions && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-2 overflow-hidden"
                        >
                          {transactions.map((tx, idx) => (
                            <div
                              key={tx.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                tx.payer === 'client'
                                  ? 'bg-blue-900/20 border border-blue-500/20'
                                  : 'bg-purple-900/20 border border-purple-500/20'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <ArrowRight className={`w-4 h-4 ${tx.payer === 'client' ? 'text-blue-400' : 'text-purple-400 rotate-180'}`} />
                                <span className="text-sm text-white">{tx.resource}</span>
                              </div>
                              <span className={`text-sm font-bold ${tx.payer === 'client' ? 'text-blue-400' : 'text-purple-400'}`}>
                                ${tx.amount.toFixed(4)}
                              </span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Session History Toggle */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
                >
                  <button
                    onClick={toggleSessionHistory}
                    className="w-full flex items-center justify-between"
                  >
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <History className="w-5 h-5 text-orange-400" />
                      Session History
                    </h3>
                    <div className="flex items-center gap-2">
                      {isLoadingHistory && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {showSessionHistory ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {showSessionHistory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 space-y-3 overflow-hidden max-h-80 overflow-y-auto"
                      >
                        {sessionHistory.length === 0 ? (
                          <div className="text-center py-4 text-gray-500">
                            No sessions found
                          </div>
                        ) : (
                          sessionHistory.map((session) => (
                            <div
                              key={session.sessionId}
                              className={`p-3 rounded-lg border ${
                                session.status === 'settled'
                                  ? 'bg-green-900/20 border-green-500/30'
                                  : 'bg-yellow-900/20 border-yellow-500/30'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-mono text-gray-400">
                                  {session.sessionId.slice(0, 20)}...
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  session.status === 'settled'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {session.status}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Client Paid:</span>
                                  <span className="text-blue-400 ml-1">${session.clientPaidTotal.toFixed(4)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Server Paid:</span>
                                  <span className="text-purple-400 ml-1">${session.serverPaidTotal.toFixed(4)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Net:</span>
                                  <span className={`ml-1 ${session.netBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${Math.abs(session.netBalance).toFixed(4)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                {new Date(session.createdAt).toLocaleString()}
                              </div>
                            </div>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* How It Works */}
                {!currentSession && !clientIdentity && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6"
                  >
                    <h4 className="text-purple-400 font-semibold mb-4 flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      How Bilateral Exchange Works
                    </h4>
                    <div className="space-y-4 text-sm text-gray-300">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-400 text-xs font-bold">1</span>
                        </div>
                        <div>
                          <div className="font-medium text-white">Create Identities</div>
                          <div className="text-gray-400">Both get wallets with real on-chain balances</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-400 text-xs font-bold">2</span>
                        </div>
                        <div>
                          <div className="font-medium text-white">Record Payments</div>
                          <div className="text-gray-400">Client pays server for tools, server can pay client for data</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-400 text-xs font-bold">3</span>
                        </div>
                        <div>
                          <div className="font-medium text-white">Net Settlement</div>
                          <div className="text-gray-400">Only the NET difference settles on-chain (saves gas!)</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
