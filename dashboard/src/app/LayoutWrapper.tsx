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

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [n8nUrl, setN8nUrl] = useState('')
  const [postsPerPage, setPostsPerPage] = useState(20)
  const [dailyPostLimit, setDailyPostLimit] = useState(3)
  const [isSaving, setIsSaving] = useState(false)
  const { toasts, showToast, dismissToast } = useToast()
  const { setScheduledCount } = useAppContext()

  useEffect(() => {
    // Load settings from localStorage
    if (typeof window !== 'undefined') {
      const storedUrl = localStorage.getItem('n8n_url') || config.n8nUrl
      const storedLimit = localStorage.getItem('posts_per_page') || '20'
      const storedDailyLimit = localStorage.getItem('daily_post_limit') || '3'
      setN8nUrl(storedUrl)
      setPostsPerPage(parseInt(storedLimit))
      setDailyPostLimit(parseInt(storedDailyLimit))
    }

    // Fetch initial stats
    fetchStats()
  }, [])

  // Load daily limit from DB when settings panel opens
  useEffect(() => {
    if (isSettingsOpen) {
      api.getClientSettings().then(settings => {
        setDailyPostLimit(settings.daily_post_limit || 3)
      })
      // Also read from localStorage as fallback
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('daily_post_limit')
        if (stored) setDailyPostLimit(parseInt(stored) || 3)
      }
    }
  }, [isSettingsOpen])

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
    setIsSaving(true)
    try {
      // Save n8n URL and posts per page to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('n8n_url', n8nUrl)
        localStorage.setItem('posts_per_page', postsPerPage.toString())
        localStorage.setItem('daily_post_limit', dailyPostLimit.toString())
      }

      // Save daily limit to DB via n8n
      const result = await api.updateClientSettings('hr-pro-001', {
        daily_post_limit: dailyPostLimit
      })

      if (result.status === 'ok' || result.message) {
        showToast('Settings saved successfully', 'success')
      } else {
        showToast('Settings saved locally — DB update may have failed', 'warning')
      }

      setIsSettingsOpen(false)
      // Refresh stats with new URL
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
        showToast('Connection failed. Check your n8n URL.', 'error')
      }
    } catch (error) {
      showToast('Connection failed. Check your n8n URL.', 'error')
    }
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
          {/* n8n URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              n8n Server URL
            </label>
            <input
              type="text"
              value={n8nUrl}
              onChange={(e) => setN8nUrl(e.target.value)}
              placeholder="http://localhost:5678"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              The URL where your n8n instance is running
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
            <input
              type="number"
              value={dailyPostLimit}
              onChange={(e) => setDailyPostLimit(parseInt(e.target.value) || 3)}
              min="1"
              max="20"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum posts to generate per day (Current: {dailyPostLimit} posts/day)
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
