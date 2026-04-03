import { useEffect, useRef, useCallback } from 'react'
import { auth } from '@/lib/auth'

type SSEEvent = {
  type: string
  data?: Record<string, unknown>
  timestamp?: string
}

type SSEHandlers = {
  onNewPosts?: (data: SSEEvent) => void
  onPostApproved?: (data: SSEEvent) => void
  onPostRejected?: (data: SSEEvent) => void
  onPublishNow?: (data: SSEEvent) => void
  onConnected?: () => void
}

export function useSSE(handlers: SSEHandlers) {
  const esRef = useRef<EventSource | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    if (!auth.isLoggedIn()) return
    if (esRef.current) {
      esRef.current.close()
    }

    const token = localStorage.getItem('postflow_token')
    const apiUrl = localStorage.getItem('api_url') ||
      process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'

    // SSE doesn't support custom headers — pass token as query param
    const url = `${apiUrl}/api/events?token=${token}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data)

        if (event.type === 'ping') return
        if (event.type === 'connected') {
          handlersRef.current.onConnected?.()
          return
        }
        if (event.type === 'new_posts') {
          handlersRef.current.onNewPosts?.(event)
        }
        if (event.type === 'post_approved') {
          handlersRef.current.onPostApproved?.(event)
        }
        if (event.type === 'post_rejected') {
          handlersRef.current.onPostRejected?.(event)
        }
        if (event.type === 'publish_now') {
          handlersRef.current.onPublishNow?.(event)
        }
      } catch(e) {
        // ignore parse errors
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      // Reconnect after 5 seconds
      setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [connect])
}
