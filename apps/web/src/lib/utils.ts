import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUSD(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`
  }
  return `$${amount.toFixed(2)}`
}

export function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

export function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    CREATED: 'status-open',
    OPEN: 'status-open',
    BIDDING_CLOSED: 'status-bidding',
    ASSIGNED: 'status-assigned',
    EXECUTING: 'status-executing',
    COMPLETED: 'status-completed',
    FAILED: 'status-failed',
    CANCELLED: 'status-failed',
    DISPUTED: 'status-failed',
  }
  return colors[status] || 'bg-gray-500/20 text-gray-400'
}

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

export function getReputationStars(score: number): string {
  const fullStars = Math.floor(score)
  const hasHalf = score % 1 >= 0.5
  return '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0))
}
