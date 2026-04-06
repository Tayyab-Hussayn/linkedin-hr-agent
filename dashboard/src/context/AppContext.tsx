'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { ToastMessage } from '@/lib/types'

interface AppContextType {
  scheduledPulse: boolean
  triggerScheduledPulse: () => void
  scheduledCount: number
  setScheduledCount: (n: number) => void
  toasts: ToastMessage[]
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextType>({
  scheduledPulse: false,
  triggerScheduledPulse: () => {},
  scheduledCount: 0,
  setScheduledCount: () => {},
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [scheduledPulse, setScheduledPulse] = useState(false)
  const [scheduledCount, setScheduledCount] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const triggerScheduledPulse = () => {
    setScheduledPulse(true)
    setTimeout(() => setScheduledPulse(false), 3500)
  }

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = Math.random().toString(36).substring(7)
    const toast: ToastMessage = { id, message, type }
    setToasts(prev => [...prev, toast])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <AppContext.Provider value={{
      scheduledPulse,
      triggerScheduledPulse,
      scheduledCount,
      setScheduledCount,
      toasts,
      showToast,
      dismissToast,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => useContext(AppContext)
