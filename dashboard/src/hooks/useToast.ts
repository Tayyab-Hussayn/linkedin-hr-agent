'use client'

import { useState, useCallback } from 'react'
import { ToastMessage } from '@/lib/types'

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = Math.random().toString(36).substring(7)
    const toast: ToastMessage = { id, message, type }

    setToasts(prev => [...prev, toast])

    setTimeout(() => {
      dismissToast(id)
    }, 3500)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, showToast, dismissToast }
}
