'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { ToastContainer } from '@/components/ui/Toast'
import FeedbackBanner from '@/components/FeedbackBanner'
import { useAppContext } from '@/context/AppContext'
import { useSSE } from '@/hooks/useSSE'
import { api, getApiUrl } from '@/lib/api'
import { auth } from '@/lib/auth'

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string
    downloadUrl: string
  } | null>(null)
  const { toasts, dismissToast, setScheduledCount, triggerRefresh } = useAppContext()

  // Pages that don't need auth
  const publicPages = ['/login', '/register', '/onboarding']
  const isPublicPage = publicPages.some(p => pathname?.startsWith(p))

  useEffect(() => {
    if (!isPublicPage && !auth.isLoggedIn()) {
      router.replace('/login')
    }
  }, [pathname, isPublicPage, router])

  useSSE({
    onNewPosts: () => {
      fetchStats() // Update pending count in sidebar
      triggerRefresh() // Signal pages to re-fetch
    },
    onPostApproved: () => {
      fetchStats() // Update scheduled count
      triggerRefresh()
    },
    onPostRejected: () => {
      fetchStats()
      triggerRefresh()
    },
    onPublishNow: () => {
      fetchStats()
      triggerRefresh()
    }
  })

  useEffect(() => {
    if (isPublicPage) return
    // Fetch initial stats
    fetchStats()
    // Check for updates after 5 seconds
    setTimeout(checkForUpdates, 5000)
  }, [isPublicPage])

  useEffect(() => {
    if (isPublicPage) return
    const handleOnline = () => fetchStats()
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isPublicPage])

  const fetchStats = async () => {
    try {
      const stats = await api.getStats()
      setPendingCount(stats.pending || 0)
      setPublishedCount(stats.published || 0)
      setScheduledCount(stats.approved || 0)
      setIsOnline(true)
    } catch (error) {
      setIsOnline(false)
      console.error('Failed to fetch stats:', error)
    }
  }

  const handleRefresh = () => {
    fetchStats()
    triggerRefresh()
  }

  const checkForUpdates = async () => {
    try {
      // Don't check more than once per 24 hours
      const lastCheck = localStorage.getItem('qalam_update_check')
      const lastDismissed = localStorage.getItem('qalam_update_dismissed')
      const now = Date.now()

      if (lastCheck && now - parseInt(lastCheck) < 24 * 60 * 60 * 1000) {
        return // checked within last 24 hours
      }

      const res = await fetch(`${getApiUrl()}/updater/app-version.json`)
      const data = await res.json()

      // Current app version — update this when releasing
      const CURRENT_VERSION = '1.2.1'

      localStorage.setItem('qalam_update_check', now.toString())

      if (!data.version || data.version === '0.0.0') return

      // Compare versions
      const parseVersion = (v: string) => v.split('.').map(Number)
      const remote = parseVersion(data.version)
      const current = parseVersion(CURRENT_VERSION)

      const isNewer = remote[0] > current[0] ||
        (remote[0] === current[0] && remote[1] > current[1]) ||
        (remote[0] === current[0] && remote[1] === current[1] && remote[2] > current[2])

      // Check if user dismissed this version already
      if (isNewer && lastDismissed !== data.version) {
        setUpdateAvailable({
          version: data.version,
          downloadUrl: data.download_url
        })
      }
    } catch {
      // Silent fail — update check is non-critical
    }
  }

  // Don't render sidebar/header on public pages
  if (isPublicPage) {
    return (
      <>
        {children}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <>
      <Header onRefresh={handleRefresh} isOnline={isOnline} />
      <Sidebar pendingCount={pendingCount} publishedCount={publishedCount} />
      <MobileNav pendingCount={pendingCount} />

      {/* Update Available Banner */}
      {updateAvailable && !isPublicPage && (
        <div className="fixed top-[60px] left-0 right-0 z-50 md:left-[220px] flex items-center justify-between px-4 py-2.5 bg-accent/10 border-b border-accent/30">
          <div className="flex items-center gap-2">
            <span className="text-accent text-sm">✨</span>
            <span className="text-sm text-text-primary">
              Qalam <span className="font-semibold text-accent">
                v{updateAvailable.version}
              </span> is available
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={updateAvailable.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-1.5 accent-gradient text-bg rounded-lg"
            >
              Download update
            </a>
            <button
              onClick={() => {
                localStorage.setItem(
                  'qalam_update_dismissed',
                  updateAvailable.version
                )
                setUpdateAvailable(null)
              }}
              className="text-muted hover:text-text-primary text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={`${updateAvailable && !isPublicPage ? 'pt-[95px]' : 'pt-[60px]'} pb-20 md:pb-6 md:ml-[220px] min-h-screen`}>
        <div className="max-w-[900px] mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <FeedbackBanner />
    </>
  )
}
