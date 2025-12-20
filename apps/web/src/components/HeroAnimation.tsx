'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrame: number
    let particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
      life: number
    }> = []

    const colors = ['#8B5CF6', '#06B6D4', '#22C55E', '#F59E0B']

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2
      ctx.scale(2, 2)
    }
    resize()
    window.addEventListener('resize', resize)

    const spawnParticle = () => {
      const side = Math.floor(Math.random() * 4)
      let x, y, vx, vy

      switch (side) {
        case 0: // top
          x = Math.random() * canvas.offsetWidth
          y = 0
          vx = (Math.random() - 0.5) * 2
          vy = Math.random() * 2 + 1
          break
        case 1: // right
          x = canvas.offsetWidth
          y = Math.random() * canvas.offsetHeight
          vx = -(Math.random() * 2 + 1)
          vy = (Math.random() - 0.5) * 2
          break
        case 2: // bottom
          x = Math.random() * canvas.offsetWidth
          y = canvas.offsetHeight
          vx = (Math.random() - 0.5) * 2
          vy = -(Math.random() * 2 + 1)
          break
        default: // left
          x = 0
          y = Math.random() * canvas.offsetHeight
          vx = Math.random() * 2 + 1
          vy = (Math.random() - 0.5) * 2
      }

      particles.push({
        x,
        y,
        vx,
        vy,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1
      })
    }

    // Initial particles
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: Math.random()
      })
    }

    const animate = () => {
      if (!canvas || !ctx) return

      const width = canvas.offsetWidth
      const height = canvas.offsetHeight

      // Clear with fade effect
      ctx.fillStyle = 'rgba(17, 24, 39, 0.05)'
      ctx.fillRect(0, 0, width, height)

      // Spawn new particles
      if (Math.random() < 0.1) spawnParticle()

      // Draw connections between nearby particles
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach(p2 => {
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 100) {
            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.2 * (1 - dist / 100) * Math.min(p1.life, p2.life)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      // Update and draw particles
      particles = particles.filter(p => {
        // Update position
        p.x += p.vx
        p.y += p.vy

        // Apply slight gravity toward center
        const centerX = width / 2
        const centerY = height / 2
        p.vx += (centerX - p.x) * 0.0001
        p.vy += (centerY - p.y) * 0.0001

        // Fade out
        p.life -= 0.002

        // Draw
        if (p.life > 0) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fillStyle = p.color.replace(')', `, ${p.life})`).replace('rgb', 'rgba').replace('#', '')

          // Convert hex to rgba
          const hex = p.color
          const r = parseInt(hex.slice(1, 3), 16)
          const g = parseInt(hex.slice(3, 5), 16)
          const b = parseInt(hex.slice(5, 7), 16)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.life})`
          ctx.fill()
        }

        // Keep if alive and on screen
        return p.life > 0 &&
               p.x > -50 && p.x < width + 50 &&
               p.y > -50 && p.y < height + 50
      })

      // Center glow
      const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, 200
      )
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.1)')
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(width / 2 - 200, height / 2 - 200, 400, 400)

      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrame)
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-950" />
      <div className="absolute inset-0 bg-gradient-to-r from-gray-950/50 via-transparent to-gray-950/50" />
    </motion.div>
  )
}
