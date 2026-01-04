'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale, AlertTriangle, CheckCircle2, XCircle, Clock, FileText,
  ExternalLink, Plus, RefreshCw, ChevronDown, ChevronUp, Loader2,
  DollarSign, TrendingDown, Shield, Gavel, Eye, Send
} from 'lucide-react'
import { API_URL } from '@/lib/config'
import { PageHeader } from '@/components/PageHeader'
import { fadeInUp, staggerContainer, staggerItem, modalOverlay, modalContent } from '@/lib/animations'

// ============================================================
// TYPES
// ============================================================

type DisputeStatus =
  | 'OPENED'
  | 'EVIDENCE_COLLECTION'
  | 'UNDER_REVIEW'
  | 'RESOLVED_CLIENT_WINS'
  | 'RESOLVED_PROVIDER_WINS'
  | 'RESOLVED_SPLIT'
  | 'EXPIRED'

type DisputeReason =
  | 'INCORRECT_DATA'
  | 'NO_RESPONSE'
  | 'LATE_RESPONSE'
  | 'QUALITY_ISSUE'
  | 'MALICIOUS_BEHAVIOR'
  | 'OTHER'

interface DisputeEvidence {
  id: string
  disputeId: string
  submittedBy: 'client' | 'provider' | 'oracle'
  type: 'execution_proof' | 'reference_data' | 'timing_log' | 'attestation' | 'other'
  data: any
  timestamp: number
}

interface DisputeResolution {
  verdict: 'client_wins' | 'provider_wins' | 'split'
  clientRefund: number
  providerPayment: number
  slashAmount: number
  reputationPenalty: number
  explanation: string
}

interface SlashingTx {
  txHash: string
  blockNumber?: number
  explorerUrl?: string
  slashedAmountUSDC: number
  recipient: string
  executedAt: number
}

interface Dispute {
  id: string
  intentId: string
  escrowId: string
  clientAddress: string
  providerAddress: string
  reason: DisputeReason
  description: string
  status: DisputeStatus
  evidence: DisputeEvidence[]
  createdAt: number
  resolvedAt?: number
  resolution?: DisputeResolution
  slashingTx?: SlashingTx
  deviationPercent?: number
  referenceValue?: any
  providedValue?: any
}

interface DisputeConfig {
  realOraclesEnabled: boolean
  registeredOracles: string[]
  deviationThreshold: string
  slashPercentage: string
  evidenceTimeoutMs: number
}

interface DisputeStats {
  total: number
  opened: number
  resolved: number
  clientWins: number
  providerWins: number
  splits: number
  totalSlashed: number
}

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

function StatusBadge({ status }: { status: DisputeStatus }) {
  const config: Record<DisputeStatus, { className: string; icon: React.ReactNode }> = {
    OPENED: { className: 'badge badge-warning', icon: <Clock className="w-3 h-3" /> },
    EVIDENCE_COLLECTION: { className: 'badge badge-info', icon: <FileText className="w-3 h-3" /> },
    UNDER_REVIEW: { className: 'badge badge-accent', icon: <Eye className="w-3 h-3" /> },
    RESOLVED_CLIENT_WINS: { className: 'badge badge-success', icon: <CheckCircle2 className="w-3 h-3" /> },
    RESOLVED_PROVIDER_WINS: { className: 'badge badge-error', icon: <XCircle className="w-3 h-3" /> },
    RESOLVED_SPLIT: { className: 'badge badge-warning', icon: <Scale className="w-3 h-3" /> },
    EXPIRED: { className: 'badge bg-dark-500/20 text-dark-400 border border-dark-500/30', icon: <Clock className="w-3 h-3" /> }
  }

  const { className, icon } = config[status]

  return (
    <span className={`${className} gap-1.5`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function DisputesPage() {
  const [isClient, setIsClient] = useState(false)

  // Data state
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [config, setConfig] = useState<DisputeConfig | null>(null)
  const [stats, setStats] = useState<DisputeStats | null>(null)
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null)

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewDisputeForm, setShowNewDisputeForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<DisputeStatus | 'ALL'>('ALL')

  // Form state
  const [newDispute, setNewDispute] = useState({
    intentId: '',
    escrowId: '',
    clientAddress: '',
    providerAddress: '',
    reason: 'INCORRECT_DATA' as DisputeReason,
    description: '',
    providedValue: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Evidence form state
  const [showEvidenceForm, setShowEvidenceForm] = useState(false)
  const [evidenceData, setEvidenceData] = useState({
    submittedBy: 'client' as 'client' | 'provider' | 'oracle',
    type: 'other' as 'execution_proof' | 'reference_data' | 'timing_log' | 'attestation' | 'other',
    data: ''
  })

  useEffect(() => {
    setIsClient(true)
    loadData()
  }, [])

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const loadData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Fetch config, stats, and all disputes in parallel
      const [configRes, statsRes, disputesRes] = await Promise.all([
        fetch(`${API_URL}/api/disputes/config`),
        fetch(`${API_URL}/api/disputes/stats/summary`),
        fetch(`${API_URL}/api/disputes/all`)
      ])

      const configData = await configRes.json()
      const statsData = await statsRes.json()
      const disputesData = await disputesRes.json()

      if (configData.success) setConfig(configData.data)
      if (statsData.success) setStats(statsData.data)
      if (disputesData.success) setDisputes(disputesData.data.disputes)

    } catch (err) {
      console.error('Error loading dispute data:', err)
      setError('Failed to load dispute configuration')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchDispute = async (disputeId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/disputes/${disputeId}`)
      const data = await res.json()
      if (data.success) {
        setSelectedDispute(data.data)
        // Also add to disputes list if not there
        setDisputes(prev => {
          const exists = prev.find(d => d.id === data.data.id)
          if (!exists) return [...prev, data.data]
          return prev.map(d => d.id === data.data.id ? data.data : d)
        })
      }
    } catch (err) {
      console.error('Error fetching dispute:', err)
    }
  }

  // ============================================================
  // DISPUTE ACTIONS
  // ============================================================

  const openDispute = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Parse providedValue as JSON if possible
      let parsedValue: any = newDispute.providedValue
      try {
        parsedValue = JSON.parse(newDispute.providedValue)
      } catch {
        // Keep as string if not valid JSON
      }

      const res = await fetch(`${API_URL}/api/disputes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newDispute,
          providedValue: parsedValue
        })
      })

      const data = await res.json()

      if (data.success) {
        setDisputes(prev => [data.data, ...prev])
        setSelectedDispute(data.data)
        setShowNewDisputeForm(false)
        setNewDispute({
          intentId: '',
          escrowId: '',
          clientAddress: '',
          providerAddress: '',
          reason: 'INCORRECT_DATA',
          description: '',
          providedValue: ''
        })
        // Refresh stats
        loadData()
      } else {
        setError(data.error?.message || 'Failed to open dispute')
      }
    } catch (err) {
      console.error('Error opening dispute:', err)
      setError('Failed to open dispute')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitEvidence = async () => {
    if (!selectedDispute) return

    setIsSubmitting(true)
    setError(null)

    try {
      let parsedData: any = evidenceData.data
      try {
        parsedData = JSON.parse(evidenceData.data)
      } catch {
        parsedData = { text: evidenceData.data }
      }

      const res = await fetch(`${API_URL}/api/disputes/${selectedDispute.id}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...evidenceData,
          data: parsedData
        })
      })

      const data = await res.json()

      if (data.success) {
        // Refresh dispute to get updated evidence
        await fetchDispute(selectedDispute.id)
        setShowEvidenceForm(false)
        setEvidenceData({
          submittedBy: 'client',
          type: 'other',
          data: ''
        })
      } else {
        setError(data.error?.message || 'Failed to submit evidence')
      }
    } catch (err) {
      console.error('Error submitting evidence:', err)
      setError('Failed to submit evidence')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const filteredDisputes = disputes.filter(d =>
    statusFilter === 'ALL' || d.status === statusFilter
  )

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString()

  if (!isClient) {
    return null
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="page-container">
      <PageHeader
        title="Dispute Resolution"
        subtitle="Oracle-backed dispute resolution with real USDC slashing"
        icon={<Gavel className="w-6 h-6" />}
        rightContent={
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="btn-ghost p-2 rounded-lg"
            >
              <RefreshCw className={`w-5 h-5 text-dark-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowNewDisputeForm(true)}
              className="btn-glow flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Open Dispute
            </button>
          </div>
        }
      />

      <main className="page-content">

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-300">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
                <XCircle className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats & Config Cards */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {/* Config Card */}
          <motion.div variants={staggerItem} className="stat-card">
            <div className="flex items-center gap-2 text-accent-400 mb-4">
              <Shield className="w-5 h-5" />
              <span className="font-medium">System Config</span>
            </div>
            {config ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-dark-400">Real Oracles</span>
                  <span className={config.realOraclesEnabled ? 'text-emerald-400' : 'text-red-400'}>
                    {config.realOraclesEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Slash %</span>
                  <span className="text-white">{config.slashPercentage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Deviation</span>
                  <span className="text-white">{config.deviationThreshold}</span>
                </div>
                {config.registeredOracles.length > 0 && (
                  <div className="pt-2 border-t border-dark-700">
                    <span className="text-dark-400 text-xs">Oracles: </span>
                    <span className="text-accent-400 text-xs">{config.registeredOracles.join(', ')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 animate-spin text-dark-500" />
              </div>
            )}
          </motion.div>

          {/* Stats Cards */}
          <motion.div variants={staggerItem} className="stat-card">
            <div className="flex items-center gap-2 text-blue-400 mb-4">
              <Scale className="w-5 h-5" />
              <span className="font-medium">Total Disputes</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {stats?.total ?? 0}
            </div>
            <div className="text-sm text-dark-400 mt-2">
              {stats?.opened ?? 0} active, {stats?.resolved ?? 0} resolved
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="stat-card">
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Resolution Stats</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">Client Wins</span>
                <span className="text-emerald-400">{stats?.clientWins ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Provider Wins</span>
                <span className="text-red-400">{stats?.providerWins ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Splits</span>
                <span className="text-amber-400">{stats?.splits ?? 0}</span>
              </div>
            </div>
          </motion.div>

          <motion.div variants={staggerItem} className="stat-card">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <TrendingDown className="w-5 h-5" />
              <span className="font-medium">Total Slashed</span>
            </div>
            <div className="text-4xl font-bold text-white">
              ${(stats?.totalSlashed ?? 0).toFixed(4)}
            </div>
            <div className="text-sm text-dark-400 mt-2">USDC on Base Sepolia</div>
          </motion.div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Disputes List */}
          <div className="lg:col-span-1">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-dark-400" />
                  Disputes
                </h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DisputeStatus | 'ALL')}
                  className="input !w-auto !py-1 !px-3 text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="OPENED">Opened</option>
                  <option value="EVIDENCE_COLLECTION">Evidence Collection</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="RESOLVED_CLIENT_WINS">Client Wins</option>
                  <option value="RESOLVED_PROVIDER_WINS">Provider Wins</option>
                  <option value="RESOLVED_SPLIT">Split</option>
                </select>
              </div>

              {filteredDisputes.length === 0 ? (
                <div className="text-center py-12 text-dark-500">
                  <Scale className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No disputes found</p>
                  <p className="text-sm mt-1">Open a new dispute to get started</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {filteredDisputes.map((dispute) => (
                    <motion.button
                      key={dispute.id}
                      onClick={() => setSelectedDispute(dispute)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedDispute?.id === dispute.id
                          ? 'bg-accent-500/20 border-accent-500/50'
                          : 'bg-dark-800/50 border-dark-700 hover:border-dark-600'
                      }`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-dark-400">
                          {dispute.id.slice(0, 12)}...
                        </span>
                        <StatusBadge status={dispute.status} />
                      </div>
                      <div className="text-sm font-medium text-white mb-1">
                        {dispute.reason.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-dark-500">
                        {formatTime(dispute.createdAt)}
                      </div>
                      {dispute.slashingTx && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-400">
                          <DollarSign className="w-3 h-3" />
                          Slashed: ${dispute.slashingTx.slashedAmountUSDC.toFixed(4)}
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dispute Details */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {selectedDispute ? (
                <motion.div
                  key={selectedDispute.id}
                  variants={fadeInUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="card p-6"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold">Dispute Details</h2>
                        <StatusBadge status={selectedDispute.status} />
                      </div>
                      <p className="text-sm text-dark-400 font-mono mt-1">{selectedDispute.id}</p>
                    </div>
                    <button
                      onClick={() => fetchDispute(selectedDispute.id)}
                      className="btn-ghost p-2 rounded-lg"
                    >
                      <RefreshCw className="w-4 h-4 text-dark-400" />
                    </button>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-dark-800/50 rounded-lg p-4">
                      <span className="text-xs text-dark-500">Intent ID</span>
                      <p className="font-mono text-sm truncate">{selectedDispute.intentId}</p>
                    </div>
                    <div className="bg-dark-800/50 rounded-lg p-4">
                      <span className="text-xs text-dark-500">Escrow ID</span>
                      <p className="font-mono text-sm truncate">{selectedDispute.escrowId}</p>
                    </div>
                    <div className="bg-dark-800/50 rounded-lg p-4">
                      <span className="text-xs text-dark-500">Client</span>
                      <p className="font-mono text-sm">{formatAddress(selectedDispute.clientAddress)}</p>
                    </div>
                    <div className="bg-dark-800/50 rounded-lg p-4">
                      <span className="text-xs text-dark-500">Provider</span>
                      <p className="font-mono text-sm">{formatAddress(selectedDispute.providerAddress)}</p>
                    </div>
                  </div>

                  {/* Reason & Description */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 text-amber-400 mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">{selectedDispute.reason.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-dark-300 text-sm bg-dark-800/50 rounded-lg p-4">
                      {selectedDispute.description}
                    </p>
                  </div>

                  {/* Values Comparison */}
                  {(selectedDispute.providedValue || selectedDispute.referenceValue) && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-dark-400 mb-3">Value Comparison</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                          <span className="text-xs text-red-400">Provided Value</span>
                          <pre className="text-sm mt-1 text-white overflow-x-auto">
                            {JSON.stringify(selectedDispute.providedValue, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                          <span className="text-xs text-emerald-400">Reference Value (Oracle)</span>
                          <pre className="text-sm mt-1 text-white overflow-x-auto">
                            {JSON.stringify(selectedDispute.referenceValue, null, 2) || 'Pending...'}
                          </pre>
                        </div>
                      </div>
                      {selectedDispute.deviationPercent !== undefined && (
                        <div className="mt-2 text-center">
                          <span className={`text-sm font-medium ${
                            selectedDispute.deviationPercent > 5 ? 'text-red-400' : 'text-emerald-400'
                          }`}>
                            Deviation: {selectedDispute.deviationPercent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resolution */}
                  {selectedDispute.resolution && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-dark-400 mb-3">Resolution</h3>
                      <div className={`rounded-lg p-4 border ${
                        selectedDispute.resolution.verdict === 'client_wins'
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : selectedDispute.resolution.verdict === 'provider_wins'
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-3">
                          {selectedDispute.resolution.verdict === 'client_wins' && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          )}
                          {selectedDispute.resolution.verdict === 'provider_wins' && (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          {selectedDispute.resolution.verdict === 'split' && (
                            <Scale className="w-5 h-5 text-amber-400" />
                          )}
                          <span className="font-semibold capitalize">
                            {selectedDispute.resolution.verdict.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-dark-300 mb-4">
                          {selectedDispute.resolution.explanation}
                        </p>
                        <div className="grid grid-cols-4 gap-2 text-center text-sm">
                          <div>
                            <span className="text-dark-500 block text-xs">Client Refund</span>
                            <span className="text-emerald-400">${selectedDispute.resolution.clientRefund.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-dark-500 block text-xs">Provider Payment</span>
                            <span className="text-blue-400">${selectedDispute.resolution.providerPayment.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-dark-500 block text-xs">Slashed</span>
                            <span className="text-red-400">${selectedDispute.resolution.slashAmount.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-dark-500 block text-xs">Rep Penalty</span>
                            <span className="text-amber-400">-{selectedDispute.resolution.reputationPenalty}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Slashing Transaction */}
                  {selectedDispute.slashingTx && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-dark-400 mb-3">Slashing Transaction</h3>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-red-400 font-medium">
                            ${selectedDispute.slashingTx.slashedAmountUSDC.toFixed(4)} USDC Slashed
                          </span>
                          <a
                            href={selectedDispute.slashingTx.explorerUrl || `https://sepolia.basescan.org/tx/${selectedDispute.slashingTx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-accent-400 hover:text-accent-300 text-sm"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View on BaseScan
                          </a>
                        </div>
                        <div className="text-xs font-mono text-dark-400 break-all">
                          TX: {selectedDispute.slashingTx.txHash}
                        </div>
                        {selectedDispute.slashingTx.blockNumber && (
                          <div className="text-xs text-dark-500 mt-1">
                            Block: {selectedDispute.slashingTx.blockNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Evidence */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-dark-400">
                        Evidence ({selectedDispute.evidence.length})
                      </h3>
                      {['OPENED', 'EVIDENCE_COLLECTION'].includes(selectedDispute.status) && (
                        <button
                          onClick={() => setShowEvidenceForm(true)}
                          className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
                        >
                          <Plus className="w-3 h-3" />
                          Add Evidence
                        </button>
                      )}
                    </div>

                    {selectedDispute.evidence.length === 0 ? (
                      <div className="text-center py-6 text-dark-500 text-sm">
                        No evidence submitted yet
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {selectedDispute.evidence.map((ev) => (
                          <div
                            key={ev.id}
                            className="bg-dark-800/50 rounded-lg p-3 text-sm"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className={`badge ${
                                ev.submittedBy === 'client' ? 'badge-info' :
                                ev.submittedBy === 'provider' ? 'badge-accent' :
                                'badge-success'
                              }`}>
                                {ev.submittedBy}
                              </span>
                              <span className="text-xs text-dark-500">{ev.type}</span>
                            </div>
                            <pre className="text-xs text-dark-300 overflow-x-auto">
                              {JSON.stringify(ev.data, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="text-xs text-dark-500 border-t border-dark-800 pt-4">
                    <div>Created: {formatTime(selectedDispute.createdAt)}</div>
                    {selectedDispute.resolvedAt && (
                      <div>Resolved: {formatTime(selectedDispute.resolvedAt)}</div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  variants={fadeInUp}
                  initial="initial"
                  animate="animate"
                  className="card p-12 text-center"
                >
                  <Gavel className="w-16 h-16 mx-auto mb-4 text-dark-700" />
                  <h3 className="text-xl font-medium text-dark-400 mb-2">No Dispute Selected</h3>
                  <p className="text-dark-500 mb-6">
                    Select a dispute from the list or open a new one
                  </p>
                  <button
                    onClick={() => setShowNewDisputeForm(true)}
                    className="btn-glow inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Open New Dispute
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* New Dispute Modal */}
        <AnimatePresence>
          {showNewDisputeForm && (
            <motion.div
              variants={modalOverlay}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowNewDisputeForm(false)}
            >
              <motion.div
                variants={modalContent}
                initial="initial"
                animate="animate"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className="card p-6 w-full max-w-xl"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    Open New Dispute
                  </h2>
                  <button
                    onClick={() => setShowNewDisputeForm(false)}
                    className="btn-ghost p-1 rounded"
                  >
                    <XCircle className="w-5 h-5 text-dark-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-dark-400 block mb-1">Intent ID</label>
                      <input
                        type="text"
                        value={newDispute.intentId}
                        onChange={(e) => setNewDispute(prev => ({ ...prev, intentId: e.target.value }))}
                        className="input text-sm"
                        placeholder="intent_abc123"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-dark-400 block mb-1">Escrow ID</label>
                      <input
                        type="text"
                        value={newDispute.escrowId}
                        onChange={(e) => setNewDispute(prev => ({ ...prev, escrowId: e.target.value }))}
                        className="input text-sm"
                        placeholder="escrow_xyz789"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-dark-400 block mb-1">Client Address</label>
                      <input
                        type="text"
                        value={newDispute.clientAddress}
                        onChange={(e) => setNewDispute(prev => ({ ...prev, clientAddress: e.target.value }))}
                        className="input text-sm font-mono"
                        placeholder="0x..."
                      />
                    </div>
                    <div>
                      <label className="text-sm text-dark-400 block mb-1">Provider Address</label>
                      <input
                        type="text"
                        value={newDispute.providerAddress}
                        onChange={(e) => setNewDispute(prev => ({ ...prev, providerAddress: e.target.value }))}
                        className="input text-sm font-mono"
                        placeholder="0x..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-dark-400 block mb-1">Reason</label>
                    <select
                      value={newDispute.reason}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, reason: e.target.value as DisputeReason }))}
                      className="input text-sm"
                    >
                      <option value="INCORRECT_DATA">Incorrect Data</option>
                      <option value="NO_RESPONSE">No Response</option>
                      <option value="LATE_RESPONSE">Late Response</option>
                      <option value="QUALITY_ISSUE">Quality Issue</option>
                      <option value="MALICIOUS_BEHAVIOR">Malicious Behavior</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-dark-400 block mb-1">Description</label>
                    <textarea
                      value={newDispute.description}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, description: e.target.value }))}
                      className="input text-sm h-20 resize-none"
                      placeholder="Describe the issue..."
                    />
                  </div>

                  <div>
                    <label className="text-sm text-dark-400 block mb-1">
                      Provided Value (JSON or text)
                    </label>
                    <textarea
                      value={newDispute.providedValue}
                      onChange={(e) => setNewDispute(prev => ({ ...prev, providedValue: e.target.value }))}
                      className="input text-sm font-mono h-20 resize-none"
                      placeholder='{"BTC": 95000} or "BTC price was $95,000"'
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      For crypto price disputes, use format: {`{"BTC": price}`}
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                    <button
                      onClick={() => setShowNewDisputeForm(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={openDispute}
                      disabled={isSubmitting || !newDispute.intentId || !newDispute.escrowId}
                      className="btn-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Open Dispute
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evidence Modal */}
        <AnimatePresence>
          {showEvidenceForm && selectedDispute && (
            <motion.div
              variants={modalOverlay}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowEvidenceForm(false)}
            >
              <motion.div
                variants={modalContent}
                initial="initial"
                animate="animate"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className="card p-6 w-full max-w-md"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-accent-400" />
                    Submit Evidence
                  </h2>
                  <button
                    onClick={() => setShowEvidenceForm(false)}
                    className="btn-ghost p-1 rounded"
                  >
                    <XCircle className="w-5 h-5 text-dark-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-dark-400 block mb-1">Submitted By</label>
                    <select
                      value={evidenceData.submittedBy}
                      onChange={(e) => setEvidenceData(prev => ({ ...prev, submittedBy: e.target.value as any }))}
                      className="input text-sm"
                    >
                      <option value="client">Client</option>
                      <option value="provider">Provider</option>
                      <option value="oracle">Oracle</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-dark-400 block mb-1">Evidence Type</label>
                    <select
                      value={evidenceData.type}
                      onChange={(e) => setEvidenceData(prev => ({ ...prev, type: e.target.value as any }))}
                      className="input text-sm"
                    >
                      <option value="execution_proof">Execution Proof</option>
                      <option value="reference_data">Reference Data</option>
                      <option value="timing_log">Timing Log</option>
                      <option value="attestation">Attestation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-dark-400 block mb-1">
                      Evidence Data (JSON or text)
                    </label>
                    <textarea
                      value={evidenceData.data}
                      onChange={(e) => setEvidenceData(prev => ({ ...prev, data: e.target.value }))}
                      className="input text-sm font-mono h-32 resize-none"
                      placeholder='{"actual_price": 98500, "timestamp": 1704844800}'
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                    <button
                      onClick={() => setShowEvidenceForm(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitEvidence}
                      disabled={isSubmitting || !evidenceData.data}
                      className="btn-glow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Submit Evidence
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
