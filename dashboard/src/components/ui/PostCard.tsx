'use client'

import { useState } from 'react'
import { ThumbsUp, Edit3, ThumbsDown, Loader2 } from 'lucide-react'
import { Post } from '@/lib/types'
import { formatRelativeTime, getStatusColor, getPillarColor, cn } from '@/lib/utils'

interface PostCardProps {
  post: Post
  onApprove?: (postId: string) => Promise<void>
  onReject?: (postId: string) => Promise<void>
  onEdit?: (post: Post) => void
  showActions?: boolean
  isRemoving?: boolean
}

export function PostCard({
  post,
  onApprove,
  onReject,
  onEdit,
  showActions = true,
  isRemoving = false,
}: PostCardProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const handleApprove = async () => {
    if (!onApprove) return
    setIsApproving(true)
    try {
      await onApprove(post.id)
    } catch (error) {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!onReject) return
    setIsRejecting(true)
    try {
      await onReject(post.id)
    } catch (error) {
      setIsRejecting(false)
    }
  }

  // Extract hook (first line or first sentence)
  const getHook = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim())
    return lines[0] || content.substring(0, 100)
  }

  // Get body preview (skip first line)
  const getBodyPreview = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim())
    const body = lines.slice(1).join(' ')
    return body.substring(0, 200)
  }

  const hook = getHook(post.content)
  const bodyPreview = getBodyPreview(post.content)

  // Get pillar color based on pillar name hash
  const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const pillarColor = getPillarColor(pillarIndex)

  const statusColor = getStatusColor(post.approval_status)

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-gray-200 shadow-sm p-5 transition-all duration-300',
        isRemoving && 'opacity-0 scale-95 h-0 overflow-hidden'
      )}
    >
      {/* Header: Pillar & Status */}
      <div className="flex items-start justify-between mb-3">
        <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
          {post.topic_pillar}
        </span>
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', statusColor)} style={{ boxShadow: `0 0 8px ${statusColor}` }} />
        </div>
      </div>

      {/* Hook */}
      <h3 className="font-serif text-lg font-bold leading-snug mb-2 text-gray-900">
        {hook}
      </h3>

      {/* Body Preview */}
      {bodyPreview && (
        <p className="text-sm text-gray-600 line-clamp-3 mb-4">
          {bodyPreview}
        </p>
      )}

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
        <span>{formatRelativeTime(post.created_at)}</span>
        <span>{post.estimated_words} words</span>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsUp className="w-4 h-4" />
            )}
            Approve
          </button>

          <button
            onClick={() => onEdit?.(post)}
            disabled={isApproving || isRejecting}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={handleReject}
            disabled={isApproving || isRejecting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-500 border border-red-200 rounded-xl font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ThumbsDown className="w-4 h-4" />
            )}
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
