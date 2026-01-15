'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Connection state for better tracking
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 25000 // 25 seconds
const HEARTBEAT_TIMEOUT = 10000 // 10 seconds to wait for pong

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const socketRef = useRef<Socket | null>(null)
  const subscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const subscribedIntentsRef = useRef<Set<string>>(new Set())
  const hasJoinedDashboardRef = useRef(false)

  // Clear heartbeat timers
  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimeoutRef.current = null
    }
  }, [])

  // Start heartbeat mechanism
  const startHeartbeat = useCallback((socket: Socket) => {
    clearHeartbeat()

    heartbeatIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('Heartbeat timeout - connection may be stale')
          // Force reconnect if no pong received
          socket.disconnect()
        }, HEARTBEAT_TIMEOUT)

        socket.emit('ping')
      }
    }, HEARTBEAT_INTERVAL)
  }, [clearHeartbeat])

  // Restore subscriptions after reconnection
  const restoreSubscriptions = useCallback((socket: Socket) => {
    // Rejoin dashboard room
    if (hasJoinedDashboardRef.current) {
      socket.emit('join_dashboard')
    }

    // Resubscribe to intents
    subscribedIntentsRef.current.forEach(intentId => {
      socket.emit('subscribe_intent', { intentId })
    })

    console.log(`Restored ${subscribedIntentsRef.current.size} intent subscriptions`)
  }, [])

  // Initialize socket connection (client-side only)
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined') return

    let socket: Socket
    let mounted = true

    setConnectionState('connecting')

    // Dynamic import to avoid SSR issues
    import('socket.io-client').then(({ io }) => {
      if (!mounted) return

      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity, // Keep trying
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000, // Max 30 seconds between attempts
        randomizationFactor: 0.5, // Add jitter to prevent thundering herd
        timeout: 20000,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id)
        setIsConnected(true)
        setConnectionState('connected')
        setReconnectAttempt(0)

        // Start heartbeat
        startHeartbeat(socket)

        // Join dashboard room for broadcast events
        socket.emit('join_dashboard')
        hasJoinedDashboardRef.current = true

        // Restore any existing subscriptions (for reconnections)
        restoreSubscriptions(socket)
      })

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason)
        setIsConnected(false)
        setConnectionState('disconnected')
        clearHeartbeat()

        // If server closed connection, attempt reconnect
        if (reason === 'io server disconnect') {
          socket.connect()
        }
      })

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message)
        setIsConnected(false)
        setConnectionState('reconnecting')
      })

      // Track reconnection attempts for UI feedback
      socket.io.on('reconnect_attempt', (attempt) => {
        setReconnectAttempt(attempt)
        setConnectionState('reconnecting')
        console.log(`Reconnection attempt ${attempt}`)
      })

      socket.io.on('reconnect', (attempt) => {
        console.log(`Reconnected after ${attempt} attempts`)
        setReconnectAttempt(0)
      })

      socket.io.on('reconnect_failed', () => {
        console.error('Failed to reconnect after all attempts')
        setConnectionState('disconnected')
      })

      // Handle pong response for heartbeat
      socket.on('pong', () => {
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current)
          heartbeatTimeoutRef.current = null
        }
      })

      // Handle all incoming events and dispatch to subscribers
      socket.onAny((event: string, data: any) => {
        setLastMessage({ event, data, timestamp: Date.now() })

        const callbacks = subscribersRef.current.get(event)
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(data)
            } catch (error) {
              console.error(`Error in socket callback for ${event}:`, error)
            }
          })
        }
      })
    })

    return () => {
      mounted = false
      clearHeartbeat()
      if (socket) {
        socket.disconnect()
      }
      socketRef.current = null
      hasJoinedDashboardRef.current = false
    }
  }, [clearHeartbeat, startHeartbeat, restoreSubscriptions])

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!subscribersRef.current.has(event)) {
      subscribersRef.current.set(event, new Set())
    }
    subscribersRef.current.get(event)!.add(callback)

    // Return unsubscribe function
    return () => {
      const callbacks = subscribersRef.current.get(event)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          subscribersRef.current.delete(event)
        }
      }
    }
  }, [])

  const unsubscribe = useCallback((event: string) => {
    subscribersRef.current.delete(event)
  }, [])

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    }
  }, [])

  const subscribeToIntent = useCallback((intentId: string) => {
    // Track subscription for reconnection restoration
    subscribedIntentsRef.current.add(intentId)

    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_intent', { intentId })
    }
  }, [])

  const unsubscribeFromIntent = useCallback((intentId: string) => {
    // Remove from tracked subscriptions
    subscribedIntentsRef.current.delete(intentId)

    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_intent', { intentId })
    }
  }, [])

  // Manual reconnect function for UI controls
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current.connect()
    }
  }, [])

  return {
    socket: socketRef.current,
    isConnected,
    connectionState,
    reconnectAttempt,
    lastMessage,
    subscribe,
    unsubscribe,
    emit,
    subscribeToIntent,
    unsubscribeFromIntent,
    reconnect,
  }
}
