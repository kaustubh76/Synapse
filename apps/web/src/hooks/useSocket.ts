'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)

  useEffect(() => {
    // Create socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current.on('connect', () => {
      console.log('Socket connected')
      setIsConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      console.log('Socket disconnected')
      setIsConnected(false)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, (data) => {
        setLastMessage({ event, data, timestamp: Date.now() })
        callback(data)
      })
    }
  }, [])

  const unsubscribe = useCallback((event: string) => {
    if (socketRef.current) {
      socketRef.current.off(event)
    }
  }, [])

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data)
    }
  }, [])

  const subscribeToIntent = useCallback((intentId: string) => {
    emit('subscribe_intent', { intentId })
  }, [emit])

  const unsubscribeFromIntent = useCallback((intentId: string) => {
    emit('unsubscribe_intent', { intentId })
  }, [emit])

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
