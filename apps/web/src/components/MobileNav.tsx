'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
  Brain,
  LayoutDashboard,
  Zap,
  Plug,
  Sparkles,
  Coins,
  DollarSign,
  CreditCard,
  Github,
  Wifi,
  WifiOff,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  description?: string
  badge?: string
  highlight?: boolean
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'Network overview and providers',
  },
  {
    href: '/demo',
    label: 'Full Demo',
    icon: <Zap className="w-5 h-5" />,
    description: 'Complete workflow demonstration',
    highlight: true,
  },
  {
    href: '/mcp',
    label: 'MCP Bilateral',
    icon: <Plug className="w-5 h-5" />,
    description: 'Tool monetization sessions',
  },
  {
    href: '/llm',
    label: 'LLM Compare',
    icon: <Sparkles className="w-5 h-5" />,
    description: 'Multi-model comparison',
  },
  {
    href: '/defi',
    label: 'DeFi Suite',
    icon: <Coins className="w-5 h-5" />,
    description: 'Flash loans, staking, yields',
    badge: 'New',
  },
  {
    href: '/x402',
    label: 'x402 Payments',
    icon: <DollarSign className="w-5 h-5" />,
    description: 'Real USDC streaming',
  },
  {
    href: '/credit',
    label: 'Credit Score',
    icon: <CreditCard className="w-5 h-5" />,
    description: 'Agent creditworthiness',
  },
]

interface MobileNavProps {
  isConnected: boolean
}

export function MobileNav({ isConnected }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      {/* Hamburger Button - Only visible on mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 rounded-lg bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay and Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-dark-900 border-l border-dark-700 z-50 md:hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <div className="flex items-center gap-3">
                  <Brain className="w-6 h-6 text-accent-400" />
                  <span className="font-bold gradient-text">SYNAPSE</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-dark-800 transition-colors"
                  aria-label="Close navigation menu"
                >
                  <X className="w-5 h-5 text-dark-400" />
                </button>
              </div>

              {/* Connection Status */}
              <div className="px-4 py-3 border-b border-dark-700">
                <div className={cn(
                  'flex items-center gap-2 text-sm',
                  isConnected ? 'text-green-400' : 'text-red-400'
                )}>
                  {isConnected ? (
                    <>
                      <Wifi className="w-4 h-4" />
                      <span>Connected to Network</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4" />
                      <span>Offline</span>
                    </>
                  )}
                </div>
              </div>

              {/* Navigation Items */}
              <nav className="flex-1 overflow-y-auto py-2">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors',
                        isActive
                          ? 'bg-accent-600/20 text-accent-400'
                          : 'text-dark-300 hover:bg-dark-800 hover:text-white',
                        item.highlight && !isActive && 'bg-accent-800/30'
                      )}
                    >
                      <div className={cn(
                        'flex-shrink-0',
                        isActive ? 'text-accent-400' : 'text-dark-500'
                      )}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.label}</span>
                          {item.badge && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/20 text-emerald-400">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-dark-500 truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className={cn(
                        'w-4 h-4 flex-shrink-0',
                        isActive ? 'text-accent-400' : 'text-dark-600'
                      )} />
                    </Link>
                  )
                })}
              </nav>

              {/* Footer */}
              <div className="p-4 border-t border-dark-700">
                <a
                  href="https://github.com/kaushtubh/synapse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
                >
                  <Github className="w-5 h-5" />
                  <span className="text-sm">View on GitHub</span>
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
