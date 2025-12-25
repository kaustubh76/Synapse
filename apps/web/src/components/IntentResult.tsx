'use client'

import { motion } from 'framer-motion'
import { CheckCircle, Clock, DollarSign, Zap, ExternalLink, Copy, Check, Shield, Cpu, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { cn, formatUSD, formatTime, truncateAddress } from '@/lib/utils'

interface EigenComputeResult {
  teeType: string
  enclaveId: string
  jobId: string
  inputHash: string
  outputHash: string
  verified: boolean
  measurements: {
    mrEnclave: string
    mrSigner: string
  }
}

interface PaymentResult {
  status: string
  amount: number
  currency: string
  txHash: string | null
  blockNumber: number | null
  explorerUrl: string | null
}

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
  eigencompute?: EigenComputeResult
  payment?: PaymentResult
}

export function IntentResult({ result, intentType, maxBudget, eigencompute, payment }: IntentResultProps) {
  const [copied, setCopied] = useState(false)
  const [showTeeDetails, setShowTeeDetails] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const savings = maxBudget - result.settledAmount
  const savingsPercent = maxBudget > 0 ? ((savings / maxBudget) * 100).toFixed(0) : '0'

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
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-emerald-400">Intent Fulfilled!</h3>
            {eigencompute?.verified && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                <Shield className="w-3 h-3" />
                TEE Verified
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            Delivered by {truncateAddress(result.providerId)}
            {eigencompute && <span className="text-purple-400 ml-1">via EigenCloud</span>}
          </p>
        </div>
      </div>

      {/* Result Data */}
      <div className="bg-gray-900/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Result Data</span>
            {eigencompute && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded">
                <Sparkles className="w-3 h-3" />
                AI Enhanced
              </span>
            )}
          </div>
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
              parseFloat(result.data.change24h) >= 0 ? 'text-green-400' : 'text-red-400'
            )}>
              {parseFloat(result.data.change24h) >= 0 ? '+' : ''}{result.data.change24h}%
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
          <pre className="text-sm text-gray-300 overflow-x-auto max-h-40">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
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

      {/* EigenCompute TEE Attestation */}
      {eigencompute && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-4"
        >
          <button
            onClick={() => setShowTeeDetails(!showTeeDetails)}
            className="w-full bg-gradient-to-r from-purple-600/10 to-blue-600/10 rounded-lg p-3 border border-purple-600/20 hover:border-purple-500/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">EigenCompute TEE Attestation</span>
              </div>
              <div className="flex items-center gap-2">
                {eigencompute.verified && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                    <CheckCircle className="w-3 h-3" />
                    Verified
                  </span>
                )}
                <span className="text-xs text-gray-400">{showTeeDetails ? 'Hide' : 'Show'} Details</span>
              </div>
            </div>
          </button>

          {showTeeDetails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 p-3 bg-gray-800/30 rounded-lg space-y-2"
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-gray-500">TEE Type</div>
                  <div className="text-purple-400 font-mono uppercase">{eigencompute.teeType}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Enclave ID</div>
                  <div className="text-gray-300 font-mono text-xs truncate">{eigencompute.enclaveId}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Job ID</div>
                  <div className="text-gray-300 font-mono text-xs truncate">{eigencompute.jobId}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Input Hash</div>
                  <div className="text-gray-300 font-mono text-xs truncate">{eigencompute.inputHash?.slice(0, 20)}...</div>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-700">
                <div className="text-xs text-gray-500 mb-1">MR Enclave (Measurement)</div>
                <div className="text-purple-300 font-mono text-xs break-all">
                  {eigencompute.measurements?.mrEnclave}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* x402 Payment Transaction */}
      {(payment?.txHash || result.settlementTx) && (
        <div className="bg-gradient-to-r from-emerald-600/10 to-blue-600/10 rounded-lg p-3 border border-emerald-600/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-white">x402 Payment Settled</span>
            </div>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
              <CheckCircle className="w-3 h-3" />
              Confirmed
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-gray-500">Amount</div>
              <div className="text-emerald-400 font-semibold">
                ${payment?.amount || result.settledAmount} {payment?.currency || 'USDC'}
              </div>
            </div>
            {payment?.blockNumber && (
              <div>
                <div className="text-xs text-gray-500">Block</div>
                <div className="text-gray-300">#{payment.blockNumber.toLocaleString()}</div>
              </div>
            )}
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">Transaction Hash</div>
            <a
              href={payment?.explorerUrl || `https://sepolia.basescan.org/tx/${payment?.txHash || result.settlementTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-synapse-400 font-mono text-xs hover:underline flex items-center gap-1"
            >
              {(payment?.txHash || result.settlementTx)?.slice(0, 20)}...{(payment?.txHash || result.settlementTx)?.slice(-8)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Fallback for demo mode (no real transaction) */}
      {!payment?.txHash && !result.settlementTx && payment?.status === 'demo' && (
        <div className="bg-amber-600/10 rounded-lg p-3 border border-amber-600/20">
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <Cpu className="w-4 h-4" />
            <span>Demo Mode - No on-chain payment (insufficient USDC balance)</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}
