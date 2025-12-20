'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface Node {
  id: string
  x: number
  y: number
  type: 'client' | 'provider' | 'intent'
  label: string
  active: boolean
}

interface Connection {
  from: string
  to: string
  active: boolean
  type: 'bid' | 'payment'
}

interface Props {
  activeProviders: number
  activeIntents: number
  className?: string
}

export function NetworkVisualization({ activeProviders, activeIntents, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [connections, setConnections] = useState<Connection[]>([])

  // Generate nodes based on active counts
  useEffect(() => {
    const newNodes: Node[] = []

    // Center client node
    newNodes.push({
      id: 'client',
      x: 0.5,
      y: 0.5,
      type: 'client',
      label: 'You',
      active: true
    })

    // Provider nodes in a circle
    for (let i = 0; i < Math.min(activeProviders, 8); i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
      const radius = 0.35
      newNodes.push({
        id: `provider-${i}`,
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.5 + Math.sin(angle) * radius,
        type: 'provider',
        label: `P${i + 1}`,
        active: i < activeProviders
      })
    }

    setNodes(newNodes)
  }, [activeProviders])

  // Animate canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2
      ctx.scale(2, 2)
    }
    resize()
    window.addEventListener('resize', resize)

    let animationFrame: number
    let particles: Array<{
      x: number
      y: number
      targetX: number
      targetY: number
      progress: number
      speed: number
    }> = []

    const animate = () => {
      if (!canvas || !ctx) return

      const width = canvas.offsetWidth
      const height = canvas.offsetHeight

      // Clear
      ctx.fillStyle = 'rgba(17, 24, 39, 0.1)'
      ctx.fillRect(0, 0, width, height)

      // Draw connections
      nodes.forEach((node, i) => {
        if (node.type !== 'client') {
          const clientNode = nodes.find(n => n.type === 'client')
          if (!clientNode) return

          ctx.beginPath()
          ctx.moveTo(clientNode.x * width, clientNode.y * height)
          ctx.lineTo(node.x * width, node.y * height)
          ctx.strokeStyle = node.active
            ? 'rgba(139, 92, 246, 0.2)'
            : 'rgba(75, 85, 99, 0.1)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      })

      // Draw nodes
      nodes.forEach(node => {
        const x = node.x * width
        const y = node.y * height
        const radius = node.type === 'client' ? 20 : 12

        // Glow effect
        if (node.active) {
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2)
          gradient.addColorStop(0, node.type === 'client'
            ? 'rgba(139, 92, 246, 0.4)'
            : 'rgba(34, 197, 94, 0.3)')
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4)
        }

        // Node circle
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = node.type === 'client'
          ? '#8B5CF6'
          : node.active ? '#22C55E' : '#374151'
        ctx.fill()

        // Node border
        ctx.strokeStyle = node.type === 'client'
          ? '#A78BFA'
          : node.active ? '#4ADE80' : '#4B5563'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      // Spawn particles occasionally
      if (Math.random() < 0.03 && activeIntents > 0) {
        const providerNodes = nodes.filter(n => n.type === 'provider' && n.active)
        if (providerNodes.length > 0) {
          const clientNode = nodes.find(n => n.type === 'client')
          const randomProvider = providerNodes[Math.floor(Math.random() * providerNodes.length)]
          if (clientNode && randomProvider) {
            particles.push({
              x: randomProvider.x * width,
              y: randomProvider.y * height,
              targetX: clientNode.x * width,
              targetY: clientNode.y * height,
              progress: 0,
              speed: 0.02 + Math.random() * 0.02
            })
          }
        }
      }

      // Update and draw particles
      particles = particles.filter(p => p.progress < 1)
      particles.forEach(p => {
        p.progress += p.speed
        const currentX = p.x + (p.targetX - p.x) * p.progress
        const currentY = p.y + (p.targetY - p.y) * p.progress

        ctx.beginPath()
        ctx.arc(currentX, currentY, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#8B5CF6'
        ctx.fill()

        // Trail
        ctx.beginPath()
        ctx.moveTo(currentX, currentY)
        const trailProgress = Math.max(0, p.progress - 0.1)
        const trailX = p.x + (p.targetX - p.x) * trailProgress
        const trailY = p.y + (p.targetY - p.y) * trailProgress
        ctx.lineTo(trailX, trailY)
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)'
        ctx.lineWidth = 2
        ctx.stroke()
      })

      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrame)
    }
  }, [nodes, activeIntents])

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl"
        style={{ background: 'rgba(17, 24, 39, 0.5)' }}
      />

      {/* Labels */}
      <div className="absolute top-4 left-4 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-synapse-500" />
          <span className="text-gray-400">Client</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-gray-400">Provider</span>
        </div>
      </div>

      {/* Activity indicator */}
      {activeIntents > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-synapse-500/20 text-synapse-400 text-xs"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="w-2 h-2 rounded-full bg-synapse-400"
          />
          Processing {activeIntents} intent{activeIntents > 1 ? 's' : ''}
        </motion.div>
      )}
    </div>
  )
}
