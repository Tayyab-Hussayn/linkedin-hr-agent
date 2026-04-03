'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface AppContextType {
  scheduledPulse: boolean
  triggerScheduledPulse: () => void
  scheduledCount: number
  setScheduledCount: (n: number) => void
}

const AppContext = createContext<AppContextType>({
  scheduledPulse: false,
  triggerScheduledPulse: () => {},
  scheduledCount: 0,
  setScheduledCount: () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [scheduledPulse, setScheduledPulse] = useState(false)
  const [scheduledCount, setScheduledCount] = useState(0)

  const triggerScheduledPulse = () => {
    setScheduledPulse(true)
    setTimeout(() => setScheduledPulse(false), 3500)
  }

  return (
    <AppContext.Provider value={{
      scheduledPulse,
      triggerScheduledPulse,
      scheduledCount,
      setScheduledCount,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => useContext(AppContext)
