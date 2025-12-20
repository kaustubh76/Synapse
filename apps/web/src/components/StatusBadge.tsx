'use client'

import { motion } from 'framer-motion'
import { cn, getStatusColor } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  showPulse?: boolean
}

const statusLabels: Record<string, string> = {
  CREATED: 'Created',
  OPEN: 'Accepting Bids',
  BIDDING_CLOSED: 'Selecting Winner',
  ASSIGNED: 'Assigned',
  EXECUTING: 'Executing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
}

export function StatusBadge({ status, showPulse = false }: StatusBadgeProps) {
  const isActive = ['OPEN', 'EXECUTING', 'ASSIGNED'].includes(status)

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border',
        getStatusColor(status)
      )}
    >
      {(showPulse || isActive) && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {statusLabels[status] || status}
    </motion.span>
  )
}
