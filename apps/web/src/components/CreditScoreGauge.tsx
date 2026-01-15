'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Credit tier configuration
const CREDIT_TIERS = [
  { name: 'Subprime', min: 300, max: 579, color: 'from-red-500 to-red-600', textColor: 'text-red-400' },
  { name: 'Fair', min: 580, max: 669, color: 'from-orange-500 to-orange-600', textColor: 'text-orange-400' },
  { name: 'Good', min: 670, max: 739, color: 'from-yellow-500 to-yellow-600', textColor: 'text-yellow-400' },
  { name: 'Excellent', min: 740, max: 799, color: 'from-green-500 to-green-600', textColor: 'text-green-400' },
  { name: 'Exceptional', min: 800, max: 850, color: 'from-emerald-400 to-cyan-500', textColor: 'text-emerald-400' },
]

// Get tier info for a score
function getTierForScore(score: number) {
  return CREDIT_TIERS.find(tier => score >= tier.min && score <= tier.max) || CREDIT_TIERS[0]
}

// Calculate percentage for visual representation (300-850 range)
function scoreToPercent(score: number): number {
  return ((score - 300) / (850 - 300)) * 100
}

interface CreditScoreGaugeProps {
  score: number
  previousScore?: number
  showTierInfo?: boolean
  showFactors?: boolean
  factors?: {
    paymentHistory: number // 0-100
    creditUtilization: number // 0-100
    accountAge: number // 0-100
    recentInquiries: number // 0-100
    diverseHistory: number // 0-100
  }
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CreditScoreGauge({
  score,
  previousScore,
  showTierInfo = true,
  showFactors = false,
  factors,
  className,
  size = 'md',
}: CreditScoreGaugeProps) {
  const tier = getTierForScore(score)
  const percent = scoreToPercent(score)
  const scoreChange = previousScore ? score - previousScore : 0

  // Size configurations
  const sizes = {
    sm: { gauge: 120, stroke: 8, fontSize: 'text-2xl' },
    md: { gauge: 180, stroke: 12, fontSize: 'text-4xl' },
    lg: { gauge: 240, stroke: 16, fontSize: 'text-5xl' },
  }
  const sizeConfig = sizes[size]

  // SVG calculations
  const radius = (sizeConfig.gauge - sizeConfig.stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (percent / 100) * circumference * 0.75 // 270 degrees arc

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Gauge */}
      <div className="relative" style={{ width: sizeConfig.gauge, height: sizeConfig.gauge }}>
        <svg
          width={sizeConfig.gauge}
          height={sizeConfig.gauge}
          className="transform -rotate-[135deg]"
        >
          {/* Background arc */}
          <circle
            cx={sizeConfig.gauge / 2}
            cy={sizeConfig.gauge / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={sizeConfig.stroke}
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            className="text-gray-700"
          />
          {/* Score arc */}
          <motion.circle
            cx={sizeConfig.gauge / 2}
            cy={sizeConfig.gauge / 2}
            r={radius}
            fill="none"
            strokeWidth={sizeConfig.stroke}
            strokeDasharray={circumference}
            strokeLinecap="round"
            className={cn('transition-all', `text-${tier.textColor.replace('text-', '')}`)}
            style={{ stroke: `url(#gradient-${tier.name})` }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          {/* Gradient definitions */}
          <defs>
            {CREDIT_TIERS.map((t) => (
              <linearGradient key={t.name} id={`gradient-${t.name}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" className={cn(t.color.split(' ')[0].replace('from-', 'text-'))} stopColor="currentColor" />
                <stop offset="100%" className={cn(t.color.split(' ')[1].replace('to-', 'text-'))} stopColor="currentColor" />
              </linearGradient>
            ))}
          </defs>
        </svg>

        {/* Score display in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={cn(sizeConfig.fontSize, 'font-bold', tier.textColor)}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {score}
          </motion.span>
          {scoreChange !== 0 && (
            <motion.span
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'text-sm font-medium',
                scoreChange > 0 ? 'text-green-400' : 'text-red-400'
              )}
            >
              {scoreChange > 0 ? '+' : ''}{scoreChange}
            </motion.span>
          )}
        </div>
      </div>

      {/* Tier info */}
      {showTierInfo && (
        <div className="mt-4 text-center">
          <div className={cn('text-lg font-semibold', tier.textColor)}>
            {tier.name}
          </div>
          <div className="text-sm text-gray-500">
            {tier.min} - {tier.max}
          </div>
        </div>
      )}

      {/* Tier scale */}
      <div className="mt-4 w-full max-w-xs">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>300</span>
          <span>850</span>
        </div>
        <div className="h-2 rounded-full bg-gray-700 overflow-hidden flex">
          {CREDIT_TIERS.map((t, i) => (
            <div
              key={t.name}
              className={cn(
                'h-full bg-gradient-to-r',
                t.color
              )}
              style={{
                width: `${((t.max - t.min) / (850 - 300)) * 100}%`,
              }}
            />
          ))}
        </div>
        {/* Score indicator */}
        <div className="relative h-0">
          <motion.div
            className="absolute w-0.5 h-4 bg-white rounded-full -top-1"
            initial={{ left: '0%' }}
            animate={{ left: `${percent}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ transform: 'translateX(-50%)' }}
          />
        </div>
      </div>

      {/* Factors breakdown */}
      {showFactors && factors && (
        <div className="mt-6 w-full max-w-sm space-y-3">
          <h4 className="text-sm font-medium text-gray-400">Score Factors</h4>
          <FactorBar label="Payment History" value={factors.paymentHistory} weight="35%" />
          <FactorBar label="Credit Utilization" value={factors.creditUtilization} weight="30%" />
          <FactorBar label="Account Age" value={factors.accountAge} weight="15%" />
          <FactorBar label="Recent Inquiries" value={factors.recentInquiries} weight="10%" />
          <FactorBar label="Diverse History" value={factors.diverseHistory} weight="10%" />
        </div>
      )}
    </div>
  )
}

// Factor progress bar
function FactorBar({
  label,
  value,
  weight,
}: {
  label: string
  value: number
  weight: string
}) {
  const getColor = (v: number) => {
    if (v >= 80) return 'bg-green-500'
    if (v >= 60) return 'bg-yellow-500'
    if (v >= 40) return 'bg-orange-500'
    return 'bg-red-500'
  }

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500">{weight}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', getColor(value))}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// Compact credit score badge
export function CreditScoreBadge({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  const tier = getTierForScore(score)

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-gradient-to-r',
        tier.color,
        'text-white font-medium text-sm',
        className
      )}
    >
      <span>{score}</span>
      <span className="opacity-80">•</span>
      <span className="opacity-90">{tier.name}</span>
    </div>
  )
}
