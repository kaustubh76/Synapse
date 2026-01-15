'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

// Base skeleton with shimmer animation
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-700/50',
        className
      )}
    />
  )
}

// Skeleton for text lines
export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

// Skeleton for stat cards
export function SkeletonStatCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-gray-800/50 border border-gray-700/50 p-4',
        className
      )}
    >
      <Skeleton className="h-4 w-20 mb-2" />
      <Skeleton className="h-8 w-24 mb-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

// Skeleton for provider/item cards
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-gray-800/50 border border-gray-700/50 p-4',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <SkeletonText lines={2} className="mb-3" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  )
}

// Skeleton for list items
export function SkeletonListItem({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg bg-gray-800/30',
        className
      )}
    >
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4 mb-1" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  )
}

// Skeleton for table rows
export function SkeletonTableRow({
  cols = 4,
  className,
}: {
  cols?: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-4 py-3 border-b border-gray-700/30', className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === 0 ? 'w-32' : 'w-20',
            'flex-1'
          )}
        />
      ))}
    </div>
  )
}

// Skeleton for dashboard stats grid
export function SkeletonStatsGrid({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  )
}

// Skeleton for activity feed
export function SkeletonActivityFeed({
  count = 5,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  )
}

// Skeleton for provider grid
export function SkeletonProviderGrid({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// Skeleton for DeFi pool card
export function SkeletonPoolCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-gray-800/50 border border-gray-700/50 p-5',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-5 w-28 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Skeleton className="h-3 w-12 mb-1" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div>
          <Skeleton className="h-3 w-12 mb-1" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  )
}

// Skeleton for credit score display
export function SkeletonCreditScore({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-center', className)}>
      <Skeleton className="h-32 w-32 rounded-full mb-4" />
      <Skeleton className="h-6 w-24 mb-2" />
      <Skeleton className="h-4 w-32" />
    </div>
  )
}
