'use client'

import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

interface HeaderProps {
  onRefresh?: () => void
  isOnline: boolean
}

export function Header({ onRefresh, isOnline }: HeaderProps) {
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    updateTime()
    const interval = setInterval(updateTime, 60000)
    return () => clearInterval(interval)
  }, [])

  const updateTime = () => {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
    setLastUpdated(timeStr)
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      if (onRefresh) onRefresh()
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 md:left-[220px] h-[60px] bg-surface/80 backdrop-blur-md border-b border-stroke z-30 flex items-center justify-between px-4">
      {/* Mobile logo */}
      <span className="md:hidden font-display italic text-lg accent-gradient-text font-semibold">
        Qalam
      </span>

      {/* Connection status */}
      <div className="hidden md:flex items-center gap-2 text-xs text-muted">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${
          isOnline ? 'bg-green-500' : 'bg-red-500'
        }`}></span>
        <span className={isOnline ? 'text-muted' : 'text-red-400'}>
          {isOnline ? `Last updated ${lastUpdated}` : 'Server unreachable'}
        </span>
      </div>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="p-2 rounded-lg text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </header>
  )
}
