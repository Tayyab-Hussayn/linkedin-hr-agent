'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post } from '@/lib/types'
import { PostCard } from '@/components/ui/PostCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/hooks/useToast'
import { getStatusLabel, formatRelativeTime, getPillarColor, cn } from '@/lib/utils'

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    setIsLoading(true)
    try {
      const data = await api.getPosts('history', 50)
      setPosts(data)
    } catch (error) {
      showToast('Failed to load history', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadgeColor = (post: Post) => {
    if (post.post_status === 'published') return 'bg-blue-100 text-blue-700 border-blue-200'
    if (post.approval_status === 'approved') return 'bg-green-100 text-green-700 border-green-200'
    if (post.approval_status === 'rejected') return 'bg-red-100 text-red-700 border-red-200'
    return 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">History</h1>

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
          title="No history yet"
          description="Posts you approve, reject, or publish will appear here."
        />
      )}

      {/* Posts List */}
      {!isLoading && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post) => {
            const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
            const pillarColor = getPillarColor(pillarIndex)
            const statusBadgeColor = getStatusBadgeColor(post)
            const statusLabel = getStatusLabel(post)

            // Extract hook (first line)
            const hook = post.content.split('\n').filter(l => l.trim())[0] || post.content.substring(0, 100)

            return (
              <div
                key={post.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
              >
                {/* Header: Pillar & Status */}
                <div className="flex items-start justify-between mb-3">
                  <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
                    {post.topic_pillar}
                  </span>
                  <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', statusBadgeColor)}>
                    {statusLabel}
                  </span>
                </div>

                {/* Hook Preview */}
                <h3 className="font-serif text-lg font-bold leading-snug mb-4 text-gray-900">
                  {hook}
                </h3>

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{formatRelativeTime(post.created_at)}</span>
                  <span>{post.estimated_words} words</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
