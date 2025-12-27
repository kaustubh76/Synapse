'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plug, Wallet, Users, ArrowLeftRight, DollarSign, Clock, Check,
  Copy, AlertCircle, Loader2, Shield, ExternalLink, RefreshCw,
  Home, Wifi, Plus, ArrowRight, ArrowDown, ChevronDown, ChevronUp,
  Zap, Scale, Receipt, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, RPC_URL, USDC_ADDRESS, NETWORK } from '@/lib/config'

// Types
interface MCPIdentity {
  clientId: string
  address: string
  publicKey: string
  network: string
  createdAt: number
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

export default function MCPPage() {
  const [isClient, setIsClient] = useState(false)

  // Identity state
  const [clientIdentity, setClientIdentity] = useState<MCPIdentity | null>(null)
  const [serverIdentity, setServerIdentity] = useState<MCPIdentity | null>(null)
  const [isCreatingIdentity, setIsCreatingIdentity] = useState<'client' | 'server' | null>(null)

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

  useEffect(() => {
    setIsClient(true)
  }, [])

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
        } else {
          setServerIdentity(data.data)
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
        // API returns session data directly, not wrapped in .session
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
      const endpoint = paymentDirection === 'client'
        ? 'client-payment'
        : 'server-payment'

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
        // Update session with new balances from API
        setCurrentSession(prev => prev ? {
          ...prev,
          clientPaidTotal: data.data.clientPaidTotal ?? prev.clientPaidTotal,
          serverPaidTotal: data.data.serverPaidTotal ?? prev.serverPaidTotal,
          netBalance: data.data.netBalance,
          transactionCount: prev.transactionCount + 1
        } : null)
        // Add to transactions list
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
      } else {
        setError(data.error?.message || 'Failed to settle session')
      }
    } catch (err) {
      setError('Failed to connect to API')
    } finally {
      setIsSettling(false)
    }
  }

  // Reset everything
  const resetAll = () => {
    setClientIdentity(null)
    setServerIdentity(null)
    setCurrentSession(null)
    setTransactions([])
    setSettlementResult(null)
    setError(null)
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
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">MCP BILATERAL</h1>
                <p className="text-xs text-gray-500">Value Exchange Protocol</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
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
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <ArrowLeftRight className="w-10 h-10 text-purple-400" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
              MCP Bilateral Value Exchange
            </h1>
          </div>
          <p className="text-gray-400 text-lg max-w-3xl mx-auto">
            MCPs can be both payer AND payee. Track bidirectional payments, calculate net balance, and settle at session end.
          </p>
        </motion.div>

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

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Identities */}
          <div className="space-y-6">
            {/* Client Identity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
            >
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
                    <div className="text-xs text-gray-400 mb-1">Client ID</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-white truncate">{clientIdentity.clientId}</span>
                      <button
                        onClick={() => copyToClipboard(clientIdentity.clientId, 'clientId')}
                        className="p-1 hover:bg-gray-700 rounded"
                      >
                        {copied === 'clientId' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>
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
            </motion.div>

            {/* Server Identity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-gray-800"
            >
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
                    <div className="text-xs text-gray-400 mb-1">Server ID</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-white truncate">{serverIdentity.clientId}</span>
                      <button
                        onClick={() => copyToClipboard(serverIdentity.clientId, 'serverId')}
                        className="p-1 hover:bg-gray-700 rounded"
                      >
                        {copied === 'serverId' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>
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
            </motion.div>

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
                    <div className="text-xs text-gray-500">
                      {currentSession.netBalance > 0 ? 'Server owes Client' : currentSession.netBalance < 0 ? 'Client owes Server' : 'Even'}
                    </div>
                  </div>
                </div>

                {/* Record Payment */}
                {currentSession.status !== 'settled' && (
                  <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">Record Payment</h4>

                    {/* Direction Toggle */}
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
                        Client to Server
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
                        Server to Client
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="Amount (USDC)"
                          step="0.01"
                          min="0"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={paymentResource}
                          onChange={(e) => setPaymentResource(e.target.value)}
                          placeholder="Resource (optional)"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <button
                        onClick={recordPayment}
                        disabled={isProcessingPayment || !paymentAmount}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessingPayment ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Plus className="w-5 h-5" />
                        )}
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
                        Settle Session (Net: ${Math.abs(currentSession.netBalance).toFixed(4)})
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
                    <p className="text-gray-400 text-sm">{settlementResult.totalTransactions} transactions processed</p>
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
                  <div className="flex justify-between">
                    <span className="text-gray-400">From:</span>
                    <span className="text-blue-400 font-mono text-sm">{settlementResult.fromAddress.slice(0, 8)}...{settlementResult.fromAddress.slice(-6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">To:</span>
                    <span className="text-purple-400 font-mono text-sm">{settlementResult.toAddress.slice(0, 8)}...{settlementResult.toAddress.slice(-6)}</span>
                  </div>
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

            {/* Transactions List */}
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
                        <motion.div
                          key={tx.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            tx.payer === 'client'
                              ? 'bg-blue-900/20 border border-blue-500/20'
                              : 'bg-purple-900/20 border border-purple-500/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              tx.payer === 'client' ? 'bg-blue-500/20' : 'bg-purple-500/20'
                            }`}>
                              <ArrowRight className={`w-4 h-4 ${tx.payer === 'client' ? 'text-blue-400' : 'text-purple-400 rotate-180'}`} />
                            </div>
                            <div>
                              <div className="text-sm text-white">{tx.resource}</div>
                              <div className="text-xs text-gray-500">
                                {tx.payer === 'client' ? 'Client → Server' : 'Server → Client'}
                              </div>
                            </div>
                          </div>
                          <div className={`text-sm font-bold ${tx.payer === 'client' ? 'text-blue-400' : 'text-purple-400'}`}>
                            ${tx.amount.toFixed(4)}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* How It Works */}
            {!currentSession && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6"
              >
                <h4 className="text-purple-400 font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  How Bilateral Exchange Works
                </h4>
                <div className="space-y-4 text-sm text-gray-300">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-400 text-xs font-bold">1</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Create Identities</div>
                      <div className="text-gray-400">Both MCP client and server get cryptographic wallet identities automatically</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-purple-400 text-xs font-bold">2</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Bilateral Session</div>
                      <div className="text-gray-400">Client can pay server for tools, but server can ALSO pay client for data</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-green-400 text-xs font-bold">3</span>
                    </div>
                    <div>
                      <div className="font-medium text-white">Net Settlement</div>
                      <div className="text-gray-400">At session end, only the NET difference is settled on-chain (saves gas!)</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
