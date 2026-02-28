'use client'

import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, Settings } from 'lucide-react'
import { api } from '@/lib/api'

interface HeaderProps {
  onRefresh?: () => void
  onOpenSettings?: () => void
}

export function Header({ onRefresh, onOpenSettings }: HeaderProps) {
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    updateTime()
    const interval = setInterval(updateTime, 60000) // Update every minute
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
      const connected = await api.testConnection()
      setIsOnline(connected)
      if (onRefresh) onRefresh()
    } catch (error) {
      setIsOnline(false)
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] bg-white border-b border-gray-200 z-50">
      <div className="h-full px-4 md:px-6 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-lg">PostFlow</span>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-4">
          {/* Status */}
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <span className="text-gray-500">Last updated</span>
            <span className="font-medium text-gray-900">{lastUpdated}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </header>
  )
}
