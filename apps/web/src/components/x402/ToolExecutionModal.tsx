'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Zap, DollarSign, Clock, CheckCircle, AlertCircle,
  Loader2, ExternalLink, Copy, Check, Shield, Cpu,
  FileText, Code, Search, BarChart3, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tool {
  id: string
  name: string
  description: string
  pricing: {
    basePrice: string
    currency: string
    model: string
  }
  provider: {
    address: string
    name: string
    verified: boolean
  }
}

interface ExecutionResult {
  success: boolean
  execution: {
    id: string
    toolId: string
    status: string
    timestamp: string
    executionTime: string
    aiModel: string
    aiProvider: string
    deterministic: boolean
  }
  result: any
  payment: {
    status: string
    amount: number
    currency: string
    txHash: string | null
    blockNumber: number | null
    gasUsed: string | null
    from: string
    to: string
    toType?: string
    network: string
    chainId: number
    explorerUrl: string | null
  }
  // EigenCompute TEE attestation
  eigencompute?: {
    teeType: string
    enclaveId: string
    jobId: string
    inputHash: string
    outputHash: string
    verified: boolean
    measurements: {
      mrEnclave: string
      mrSigner: string
      isvProdId: number
      isvSvn: number
    }
    attestation: {
      type: string
      version: string
      signature: string
      timestamp: number
    }
  }
  compute: {
    provider: string
    aiEndpoint?: string
    model?: string
    wallet: string
    balances: {
      eth: string
      usdc: string
    }
    blockNumber: number
    tokenGrant?: {
      hasGrant: boolean
      tokensRemaining?: number
    }
    tee?: {
      enabled: boolean
      type: string
      version: string
      attestationValid: boolean
    }
  }
  explorer: {
    wallet: string
    network: string
    determinal?: string
    eigencloud?: string
  }
}

interface ToolExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  tool: Tool | null
  walletAddress?: string
}

type ExecutionStep = 'input' | 'payment' | 'executing' | 'complete' | 'error'

const TOOL_ICONS: Record<string, React.ReactNode> = {
  'tool_deep_research': <Search className="w-5 h-5" />,
  'tool_code_analysis': <Code className="w-5 h-5" />,
  'tool_data_extraction': <FileText className="w-5 h-5" />,
  'tool_sentiment_analysis': <BarChart3 className="w-5 h-5" />,
  'tool_summarization': <Sparkles className="w-5 h-5" />,
}

const TOOL_PLACEHOLDERS: Record<string, { label: string; placeholder: string; field: string }> = {
  'tool_deep_research': { label: 'Research Query', placeholder: 'What would you like to research?', field: 'query' },
  'tool_code_analysis': { label: 'Code to Analyze', placeholder: 'Paste your code here...', field: 'code' },
  'tool_data_extraction': { label: 'Content', placeholder: 'Paste content to extract data from...', field: 'content' },
  'tool_sentiment_analysis': { label: 'Text', placeholder: 'Enter text to analyze sentiment...', field: 'text' },
  'tool_summarization': { label: 'Text to Summarize', placeholder: 'Paste the text you want to summarize...', field: 'text' },
}

export function ToolExecutionModal({
  isOpen,
  onClose,
  tool,
  walletAddress
}: ToolExecutionModalProps) {
  const [step, setStep] = useState<ExecutionStep>('input')
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('input')
      setInput('')
      setResult(null)
      setError(null)
    }
  }, [isOpen, tool])

  const handleExecute = async () => {
    if (!tool || !input.trim()) return

    setStep('payment')
    setError(null)

    // Simulate payment verification (1 second)
    await new Promise(resolve => setTimeout(resolve, 1000))

    setStep('executing')

    try {
      // Get the correct field name for this tool
      const fieldConfig = TOOL_PLACEHOLDERS[tool.id] || { field: 'input' }
      const inputData = { [fieldConfig.field]: input }

      const response = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: tool.id,
          input: inputData,
          payerAddress: walletAddress,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Execution failed')
      }

      setResult(data)
      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      setStep('error')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen || !tool) return null

  const toolConfig = TOOL_PLACEHOLDERS[tool.id] || { label: 'Input', placeholder: 'Enter your input...', field: 'input' }
  const ToolIcon = TOOL_ICONS[tool.id] || <Zap className="w-5 h-5" />

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl bg-dark-900 rounded-2xl border border-dark-700/50 shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-dark-700/50 bg-gradient-to-r from-accent-600/10 to-transparent">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-accent-500/20 text-accent-400">
                  {ToolIcon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{tool.name}</h2>
                  <p className="text-sm text-dark-400 mt-0.5">{tool.description}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-dark-800 transition-colors text-dark-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pricing Badge */}
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/80 rounded-lg">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">${tool.pricing.basePrice}</span>
                <span className="text-dark-400 text-sm">{tool.pricing.currency}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/80 rounded-lg">
                <Shield className="w-4 h-4 text-accent-400" />
                <span className="text-sm text-dark-300">EigenCloud Verified</span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Step: Input */}
            {step === 'input' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <label className="block">
                  <span className="text-sm font-medium text-dark-300 mb-2 block">
                    {toolConfig.label}
                  </span>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={toolConfig.placeholder}
                    className="input min-h-[150px] resize-none"
                    autoFocus
                  />
                </label>

                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-dark-400">
                    Powered by <span className="text-accent-400">EigenCloud AI</span>
                  </div>
                  <button
                    onClick={handleExecute}
                    disabled={!input.trim()}
                    className="btn-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="w-4 h-4" />
                    Execute Tool (${tool.pricing.basePrice})
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step: Payment */}
            {step === 'payment' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-accent-500/20 flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-accent-400 animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Processing x402 Payment</h3>
                <p className="text-dark-400 text-sm">
                  Verifying payment of ${tool.pricing.basePrice} USDC...
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-dark-500">
                  <div className="status-dot status-dot-online live-indicator" />
                  Base Sepolia Network
                </div>
              </motion.div>
            )}

            {/* Step: Executing */}
            {step === 'executing' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Cpu className="w-8 h-8 text-emerald-400 animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Executing on EigenCloud</h3>
                <p className="text-dark-400 text-sm">
                  Running AI inference in secure TEE enclave...
                </p>
                <div className="mt-6 max-w-xs mx-auto">
                  <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-accent-500 to-emerald-500"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 2, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step: Complete */}
            {step === 'complete' && result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Success Header */}
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Execution Complete!</h3>
                  <p className="text-dark-400 text-sm mt-1">
                    Completed in {result.execution.executionTime}
                  </p>
                </div>

                {/* Execution Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-800/50 rounded-lg p-4">
                    <div className="text-xs text-dark-500 mb-1">Execution ID</div>
                    <div className="font-mono text-sm text-white truncate">
                      {result.execution.id}
                    </div>
                  </div>
                  <div className="bg-dark-800/50 rounded-lg p-4">
                    <div className="text-xs text-dark-500 mb-1">Block Number</div>
                    <div className="font-mono text-sm text-white">
                      #{result.compute.blockNumber.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Result */}
                <div className="bg-dark-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-dark-500">Result</div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(result.result, null, 2))}
                      className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-sm text-dark-300 font-mono overflow-auto max-h-[200px] whitespace-pre-wrap">
                    {JSON.stringify(result.result, null, 2)}
                  </pre>
                </div>

                {/* EigenCompute TEE Attestation */}
                {result.eigencompute && (
                  <div className="bg-gradient-to-r from-accent-600/10 to-emerald-600/10 rounded-lg p-4 border border-accent-600/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-accent-400" />
                        <span className="text-sm font-medium text-white">EigenCompute TEE Attestation</span>
                      </div>
                      {result.eigencompute.verified && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-dark-500">TEE Type</div>
                        <div className="text-dark-300 uppercase">{result.eigencompute.teeType}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">Enclave ID</div>
                        <div className="text-dark-300 font-mono text-xs">{result.eigencompute.enclaveId}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">Input Hash</div>
                        <div className="text-dark-300 font-mono text-xs truncate">{result.eigencompute.inputHash}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">Output Hash</div>
                        <div className="text-dark-300 font-mono text-xs truncate">{result.eigencompute.outputHash}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-dark-500">MR Enclave (Measurement)</div>
                        <div className="text-dark-300 font-mono text-xs truncate">
                          {result.eigencompute.measurements.mrEnclave}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* x402 Payment Transaction */}
                {result.payment && result.payment.txHash && (
                  <div className="bg-gradient-to-r from-emerald-600/10 to-blue-600/10 rounded-lg p-4 border border-emerald-600/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-white">x402 Payment Settled</span>
                      </div>
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                        <CheckCircle className="w-3 h-3" />
                        Confirmed
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-dark-500">Amount</div>
                        <div className="text-emerald-400 font-semibold">${result.payment.amount} {result.payment.currency}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">Block</div>
                        <div className="text-dark-300">#{result.payment.blockNumber?.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">Recipient</div>
                        <div className="text-dark-300">
                          {result.payment.toType === 'crossmint-treasury' ? (
                            <span className="text-blue-400">Crossmint Treasury</span>
                          ) : (
                            <span>Settlement Address</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-500">To Address</div>
                        <div className="text-dark-300 font-mono text-xs truncate">{result.payment.to?.slice(0, 10)}...{result.payment.to?.slice(-6)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-xs text-dark-500">Transaction Hash</div>
                        <a
                          href={result.payment.explorerUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-400 font-mono text-xs hover:underline flex items-center gap-1"
                        >
                          {result.payment.txHash?.slice(0, 20)}...{result.payment.txHash?.slice(-8)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Compute Info */}
                <div className="bg-dark-800/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-4 h-4 text-accent-400" />
                    <span className="text-sm font-medium text-white">AI Inference</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-dark-500">Provider</div>
                      <div className="text-dark-300">{result.compute.provider}</div>
                    </div>
                    <div>
                      <div className="text-xs text-dark-500">Model</div>
                      <div className="text-dark-300">{result.execution.aiModel}</div>
                    </div>
                    {result.compute.tokenGrant && (
                      <div className="col-span-2">
                        <div className="text-xs text-dark-500">Token Grant</div>
                        <div className="text-dark-300">
                          {result.compute.tokenGrant.tokensRemaining?.toLocaleString()} tokens remaining
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <a
                    href={result.explorer.wallet}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 text-sm flex-1 justify-center"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Explorer
                  </a>
                  <button
                    onClick={onClose}
                    className="btn-primary flex items-center gap-2 text-sm flex-1 justify-center"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step: Error */}
            {step === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Execution Failed</h3>
                <p className="text-dark-400 text-sm mb-6">{error}</p>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={() => setStep('input')}
                    className="btn-secondary"
                  >
                    Try Again
                  </button>
                  <button onClick={onClose} className="btn-primary">
                    Close
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
