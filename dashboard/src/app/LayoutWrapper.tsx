'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { ToastContainer } from '@/components/ui/Toast'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/context/AppContext'
import { api } from '@/lib/api'
import { config } from '@/lib/config'
import { Stats } from '@/lib/types'

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [n8nUrl, setN8nUrl] = useState('')
  const [postsPerPage, setPostsPerPage] = useState(20)
  const [dailyPostLimit, setDailyPostLimit] = useState<number | null>(null)
  const [publishingSlots, setPublishingSlots] = useState<string[]>(['18:00'])
  const [isSaving, setIsSaving] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const { toasts, showToast, dismissToast } = useToast()
  const { setScheduledCount } = useAppContext()

  useEffect(() => {
    // Load settings from localStorage
    if (typeof window !== 'undefined') {
      const storedUrl = localStorage.getItem('api_url') || config.n8nUrl
      const storedLimit = localStorage.getItem('posts_per_page') || '20'
      const storedSlots = localStorage.getItem('publishing_slots')
      setN8nUrl(storedUrl)
      setPostsPerPage(parseInt(storedLimit))
      if (storedSlots) {
        try {
          setPublishingSlots(JSON.parse(storedSlots))
        } catch (e) {
          setPublishingSlots(['18:00'])
        }
      }
    }

    // Fetch initial stats
    fetchStats()
  }, [])

  // Load daily limit from DB when settings panel opens
  useEffect(() => {
    if (isSettingsOpen) {
      fetchStatsForSettings()
    }
  }, [isSettingsOpen])

  const fetchStatsForSettings = async () => {
    try {
      const data = await api.getStats()
      setStats(data)
      setDailyPostLimit(data.daily_post_limit)
    } catch(e) {
      console.error('Failed to fetch stats for settings:', e)
    }
  }

  const fetchStats = async () => {
    try {
      const stats = await api.getStats()
      setPendingCount(stats.pending || 0)
      setPublishedCount(stats.published || 0)
      setScheduledCount(stats.approved || 0)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleRefresh = () => {
    fetchStats()
  }

  const handleSaveSettings = async () => {
    if (dailyPostLimit === null) {
      showToast('Please wait for settings to load', 'warning')
      return
    }

    setIsSaving(true)
    try {
      // Save API URL, posts per page to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('api_url', n8nUrl)
        localStorage.setItem('posts_per_page', postsPerPage.toString())
        localStorage.setItem('publishing_slots', JSON.stringify(publishingSlots))
      }

      // Save daily limit and publishing slots to DB via API
      await api.updateClientSettings('hr-pro-001', {
        daily_post_limit: dailyPostLimit,
        publishing_slots: publishingSlots
      })

      // Re-fetch stats to confirm new value from DB
      const updatedStats = await api.getStats()
      setStats(updatedStats)
      setDailyPostLimit(updatedStats.daily_post_limit)

      // Sync to localStorage as cache only
      if (typeof window !== 'undefined') {
        localStorage.setItem('daily_post_limit', updatedStats.daily_post_limit.toString())
      }

      showToast(`Daily limit updated to ${updatedStats.daily_post_limit} posts/day`, 'success')
      setIsSettingsOpen(false)

      // Refresh stats in main layout
      setTimeout(() => fetchStats(), 500)
    } catch(e) {
      showToast('Failed to save settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestConnection = async () => {
    try {
      const isConnected = await api.testConnection()
      if (isConnected) {
        showToast('Connection successful!', 'success')
      } else {
        showToast('Connection failed. Check your API server URL.', 'error')
      }
    } catch (error) {
      showToast('Connection failed. Check your API server URL.', 'error')
    }
  }

  const togglePublishingSlot = (slot: string) => {
    setPublishingSlots(prev => {
      if (prev.includes(slot)) {
        // Don't allow removing the last slot
        if (prev.length === 1) return prev
        return prev.filter(s => s !== slot)
      } else {
        return [...prev, slot].sort()
      }
    })
  }

  return (
    <>
      <Header onRefresh={handleRefresh} onOpenSettings={() => setIsSettingsOpen(true)} />
      <Sidebar pendingCount={pendingCount} publishedCount={publishedCount} />
      <MobileNav pendingCount={pendingCount} />

      {/* Main Content */}
      <main className="pt-[60px] pb-20 md:pb-6 md:ml-[220px] min-h-screen">
        <div className="max-w-[900px] mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Settings Sheet */}
      <Sheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Settings">
        <div className="space-y-6">
          {/* API URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Server URL
            </label>
            <input
              type="text"
              value={n8nUrl}
              onChange={(e) => setN8nUrl(e.target.value)}
              placeholder="http://localhost:5050"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              The URL where your PostFlow API server is running
            </p>
          </div>

          {/* Posts per page */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Posts per page
            </label>
            <input
              type="number"
              value={postsPerPage}
              onChange={(e) => setPostsPerPage(parseInt(e.target.value) || 20)}
              min="5"
              max="100"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Daily Post Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Daily Post Limit
            </label>
            {stats && (
              <div className="mb-2 text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Current plan: <span className="font-semibold text-blue-700">{stats.plan_name}</span> (max {stats.daily_post_limit}/day)
              </div>
            )}
            <input
              type="number"
              value={dailyPostLimit ?? ''}
              onChange={(e) => setDailyPostLimit(parseInt(e.target.value) || 0)}
              placeholder={dailyPostLimit !== null ? String(dailyPostLimit) : 'Loading...'}
              min="1"
              max="20"
              disabled={dailyPostLimit === null}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Override your plan's default limit (1-20 posts per day)
            </p>
          </div>

          {/* Publishing Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Publishing Time
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Posts will auto-publish at this time daily
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { time: '09:00', label: '9:00 AM' },
                { time: '12:00', label: '12:00 PM' },
                { time: '18:00', label: '6:00 PM' },
                { time: '21:00', label: '9:00 PM' }
              ].map(({ time, label }) => (
                <button
                  key={time}
                  onClick={() => togglePublishingSlot(time)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    publishingSlots.includes(time)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Selected: {publishingSlots.map(s => {
                const slot = { '09:00': '9:00 AM', '12:00': '12:00 PM', '18:00': '6:00 PM', '21:00': '9:00 PM' }[s]
                return slot
              }).join(', ')}
            </p>
          </div>

          {/* Test Connection */}
          <button
            onClick={handleTestConnection}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Test Connection
          </button>

          {/* Save Settings */}
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </Sheet>
    </>
  )
}
