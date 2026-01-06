'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const socketRef = useRef<Socket | null>(null)
  const subscribersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())

  // Initialize socket connection (client-side only)
  useEffect(() => {
    // Guard against SSR
    if (typeof window === 'undefined') return

    let socket: Socket

    // Dynamic import to avoid SSR issues
    import('socket.io-client').then(({ io }) => {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id)
        setIsConnected(true)

        // Join dashboard room for broadcast events
        socket.emit('join_dashboard')
      })

      socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason)
        setIsConnected(false)
      })

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message)
        setIsConnected(false)
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
      if (socket) {
        socket.disconnect()
      }
      socketRef.current = null
    }
  }, [])

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
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_intent', { intentId })
    }
  }, [])

  const unsubscribeFromIntent = useCallback((intentId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_intent', { intentId })
    }
  }, [])

  return {
    socket: socketRef.current,
    isConnected,
    lastMessage,
    subscribe,
    unsubscribe,
    emit,
    subscribeToIntent,
    unsubscribeFromIntent,
  }
}
