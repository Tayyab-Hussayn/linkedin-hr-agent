'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post, Stats } from '@/lib/types'
import { PostCard } from '@/components/ui/PostCard'
import { StatStrip } from '@/components/ui/StatStrip'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/hooks/useToast'
import Link from 'next/link'

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    fetchData()
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

  const handleApprove = async (postId: string) => {
    try {
      // Mark as removing to trigger animation
      setRemovingIds(prev => new Set(prev).add(postId))

      await api.submitDecision(postId, 'approved')

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
            approved: stats.approved + 1,
          })
        }
      }, 300)

      showToast('Post approved successfully!', 'success')
    } catch (error) {
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

      await api.submitDecision(editingPost.id, 'approved', editedContent)

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
      showToast('Post edited and approved!', 'success')
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
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm"
              placeholder="Edit your post content..."
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {editedContent.length} characters
              </span>
              <span className="text-xs text-gray-500">
                ~{Math.ceil(editedContent.split(/\s+/).length)} words
              </span>
            </div>
          </div>

          <button
            onClick={handleSaveEdit}
            disabled={isSaving || !editedContent.trim()}
            className="w-full px-4 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save & Approve'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
