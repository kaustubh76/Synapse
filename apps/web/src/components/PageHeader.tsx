'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSocket } from '@/hooks/useSocket'
import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  showConnectionStatus?: boolean
  rightContent?: ReactNode
  icon?: ReactNode
}

export function PageHeader({
  title,
  subtitle,
  backHref = '/',
  showConnectionStatus = true,
  rightContent,
  icon
}: PageHeaderProps) {
  const { isConnected } = useSocket()

  return (
    <header className="glass-dark border-b border-dark-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Back button + Title */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <Link
              href={backHref}
              className="btn-ghost p-2 rounded-lg hover:bg-dark-800/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-dark-300" />
            </Link>

            <div className="flex items-center gap-3">
              {icon && (
                <div className="text-accent-400">
                  {icon}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold gradient-text">{title}</h1>
                {subtitle && (
                  <p className="text-xs text-dark-400">{subtitle}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Right side - Connection status + custom content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {rightContent}

            {showConnectionStatus && (
              <div className={cn(
                'badge',
                isConnected ? 'badge-success' : 'badge-error'
              )}>
                {isConnected ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 mr-1.5" />
                    <span className="hidden sm:inline">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 mr-1.5" />
                    <span className="hidden sm:inline">Offline</span>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </header>
  )
}
