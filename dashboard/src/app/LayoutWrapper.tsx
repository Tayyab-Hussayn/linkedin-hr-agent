'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { ToastContainer } from '@/components/ui/Toast'
import { useAppContext } from '@/context/AppContext'
import { useSSE } from '@/hooks/useSSE'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)
  const { toasts, dismissToast, setScheduledCount } = useAppContext()

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
    },
    onPostApproved: () => {
      fetchStats() // Update scheduled count
    },
    onPostRejected: () => {
      fetchStats()
    },
    onPublishNow: () => {
      fetchStats()
    }
  })

  useEffect(() => {
    // Fetch initial stats
    fetchStats()
  }, [])

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
      <Header onRefresh={handleRefresh} />
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
    </>
  )
}
