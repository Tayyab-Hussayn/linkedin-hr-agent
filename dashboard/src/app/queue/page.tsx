'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post, Stats } from '@/lib/types'
import { PostCard } from '@/components/ui/PostCard'
import { StatStrip } from '@/components/ui/StatStrip'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Sheet } from '@/components/ui/Sheet'
import { useAppContext } from '@/context/AppContext'
import Link from 'next/link'

function getNextScheduleSlot(): Date {
  const now = new Date()
  const slots = [9, 12, 18] // 9am, 12pm, 6pm

  for (const hour of slots) {
    const slot = new Date()
    slot.setHours(hour, 0, 0, 0)
    // Slot must be at least 30 mins in future
    if (slot.getTime() - now.getTime() > 30 * 60 * 1000) {
      return slot
    }
  }

  // All today's slots passed — use tomorrow 9am
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow
}

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { showToast, triggerScheduledPulse, setScheduledCount, refreshSignal } = useAppContext()

  useEffect(() => {
    fetchData()
  }, [refreshSignal])

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) fetchData()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', fetchData)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', fetchData)
    }
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [postsData, statsData] = await Promise.all([
        api.getPosts('pending', 20),
        api.getStats(),
      ])
      setPosts(postsData)
      setStats(statsData)
    } catch (error) {
      showToast('Failed to load posts', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const statsData = await api.getStats()
      setStats(statsData)
      setScheduledCount(statsData.approved || 0)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const handleApprove = async (postId: string, scheduledFor?: string | null) => {
    setRemovingIds(prev => new Set(prev).add(postId))
    try {
      // Just approve — n8n sets scheduled_for automatically (or uses custom time)
      const result = await api.submitDecision(postId, 'approved', undefined, scheduledFor)

      // Wait for animation to complete before removing from list
      setTimeout(() => {
        setPosts(prev => prev.filter(p => p.id !== postId))
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
      }, 300)

      // Show scheduled time in toast with better formatting
      let display = 'next available slot'
      if (result?.scheduled_display) {
        display = result.scheduled_display
      } else if (result?.scheduled_for) {
        try {
          const schedDate = new Date(result.scheduled_for)
          display = schedDate.toLocaleString('en-US', {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })
        } catch (e) {
          display = 'next available slot'
        }
      }
      showToast(`Scheduled for ${display} ✓`, 'success')

      // Trigger scheduled tab pulse animation
      triggerScheduledPulse()

      // Refresh stats
      await loadStats()

    } catch(e) {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
      showToast('Failed to approve post', 'error')
    }
  }

  const handleReject = async (postId: string) => {
    try {
      // Mark as removing to trigger animation
      setRemovingIds(prev => new Set(prev).add(postId))

      await api.submitDecision(postId, 'rejected')

      // Wait for animation to complete
      setTimeout(() => {
        setPosts(prev => prev.filter(p => p.id !== postId))
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
        if (stats) {
          setStats({
            ...stats,
            pending: stats.pending - 1,
            rejected: stats.rejected + 1,
          })
        }
      }, 300)

      showToast('Post rejected', 'warning')
    } catch (error) {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
      showToast('Failed to reject post', 'error')
    }
  }

  const handleEdit = (post: Post) => {
    setEditingPost(post)
    setEditedContent(post.content)
  }

  const handleSaveEdit = async () => {
    if (!editingPost) return

    setIsSaving(true)
    try {
      // Mark as removing to trigger animation
      setRemovingIds(prev => new Set(prev).add(editingPost.id))

      // Step 1: Mark as approved with edited content (n8n sets scheduled_for automatically)
      const result = await api.submitDecision(editingPost.id, 'approved', editedContent, null)

      // Wait for animation to complete
      setTimeout(() => {
        setPosts(prev => prev.filter(p => p.id !== editingPost.id))
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(editingPost.id)
          return next
        })
        if (stats) {
          setStats({
            ...stats,
            pending: stats.pending - 1,
            approved: stats.approved + 1,
          })
        }
      }, 300)

      setEditingPost(null)

      const display = result.scheduled_display || 'next available slot'
      showToast(`Post edited and scheduled for ${display}!`, 'success')

      // Trigger Scheduled tab animation
      triggerScheduledPulse()

      // Update stats
      await loadStats()
    } catch (error) {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(editingPost.id)
        return next
      })
      showToast('Failed to save changes', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Review Queue</h1>

      {/* Stats */}
      {stats && (
        <StatStrip
          pending={stats.pending}
          approved={stats.approved}
          published={stats.published}
        />
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && posts.length === 0 && (
        <EmptyState
          title="No posts in queue"
          description="All caught up! New posts will appear here when generated."
          showCountdown={true}
          action={
            <Link
              href="/content"
              className="text-sm text-accent hover:text-blue-700 font-medium"
            >
              Go to Content tab to generate now
            </Link>
          }
        />
      )}

      {/* Posts List */}
      {!isLoading && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onApprove={handleApprove}
              onReject={handleReject}
              onEdit={handleEdit}
              showActions={true}
              isRemoving={removingIds.has(post.id)}
            />
          ))}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet
        isOpen={!!editingPost}
        onClose={() => setEditingPost(null)}
        title="Edit Post"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Content
            </label>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 border border-stroke rounded-lg focus:outline-none focus:border-accent font-sans text-sm"
              placeholder="Edit your post content..."
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted">
                {editedContent.length} characters
              </span>
              <span className="text-xs text-muted">
                ~{Math.ceil(editedContent.split(/\s+/).length)} words
              </span>
            </div>
          </div>

          <button
            onClick={handleSaveEdit}
            disabled={isSaving || !editedContent.trim()}
            className="w-full px-4 py-3 accent-gradient text-bg rounded-lg font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save & Approve'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
