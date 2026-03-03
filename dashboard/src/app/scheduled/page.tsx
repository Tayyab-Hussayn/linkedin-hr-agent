'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post } from '@/lib/types'
import { useToast } from '@/hooks/useToast'
import { useAppContext } from '@/context/AppContext'
import { CalendarCheck, Clock, Trash2, Calendar } from 'lucide-react'
import { cn, getPillarColor, formatRelativeTime } from '@/lib/utils'
import { Sheet } from '@/components/ui/Sheet'
import Link from 'next/link'

function getTimeUntil(scheduledFor: Date): string {
  const now = new Date()
  const diff = scheduledFor.getTime() - now.getTime()

  if (diff < 0) return 'Now'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `In ${days}d ${hours % 24}h`
  }

  if (hours > 0) {
    return `In ${hours}h ${minutes}m`
  }

  return `In ${minutes}m`
}

function formatScheduledTime(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isToday = date.toDateString() === today.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  if (isToday) return `Today at ${timeStr}`
  if (isTomorrow) return `Tomorrow at ${timeStr}`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null)
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow'>('today')
  const [selectedTime, setSelectedTime] = useState<number>(9)
  const { showToast } = useToast()
  const { setScheduledCount } = useAppContext()

  // Schedule times map (postId -> Date)
  const [scheduleTimes, setScheduleTimes] = useState<Map<string, Date>>(new Map())

  useEffect(() => {
    fetchScheduledPosts()

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchScheduledPosts()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const fetchScheduledPosts = async () => {
    setIsLoading(true)
    try {
      const postsData = await api.getPosts('approved', 20)
      setPosts(postsData)
      setScheduledCount(postsData.length)

      // Initialize schedule times (mock for now - would come from DB)
      const times = new Map<string, Date>()
      postsData.forEach((post, index) => {
        const slot = new Date()
        slot.setHours(9 + (index * 3), 0, 0, 0)
        times.set(post.id, slot)
      })
      setScheduleTimes(times)
    } catch (error) {
      showToast('Failed to load scheduled posts', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublishNow = async (postId: string) => {
    setPublishingId(postId)
    try {
      setRemovingIds(prev => new Set(prev).add(postId))

      // This would trigger immediate publishing
      await api.submitDecision(postId, 'approved')

      setTimeout(() => {
        setPosts(prev => prev.filter(p => p.id !== postId))
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
        setScheduledCount(posts.length - 1)
      }, 300)

      showToast('Publishing now...', 'success')
    } catch (error) {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
      showToast('Failed to publish post', 'error')
    } finally {
      setPublishingId(null)
    }
  }

  const handleRemove = async (postId: string) => {
    try {
      setRemovingIds(prev => new Set(prev).add(postId))

      await api.submitDecision(postId, 'rejected')

      setTimeout(() => {
        setPosts(prev => prev.filter(p => p.id !== postId))
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
        setScheduledCount(posts.length - 1)
      }, 300)

      showToast('Post removed from schedule', 'warning')
    } catch (error) {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
      showToast('Failed to remove post', 'error')
    }
  }

  const handleReschedule = (post: Post) => {
    setReschedulePost(post)
    const currentTime = scheduleTimes.get(post.id) || new Date()
    const isToday = currentTime.toDateString() === new Date().toDateString()
    setSelectedDate(isToday ? 'today' : 'tomorrow')
    setSelectedTime(currentTime.getHours())
  }

  const handleSaveReschedule = async () => {
    if (!reschedulePost) return

    try {
      const newTime = new Date()
      if (selectedDate === 'tomorrow') {
        newTime.setDate(newTime.getDate() + 1)
      }
      newTime.setHours(selectedTime, 0, 0, 0)

      await api.schedulePost(reschedulePost.id, newTime.toISOString())

      setScheduleTimes(prev => {
        const next = new Map(prev)
        next.set(reschedulePost.id, newTime)
        return next
      })

      setReschedulePost(null)
      showToast('Post rescheduled successfully', 'success')
    } catch (error) {
      showToast('Failed to reschedule post', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Scheduled Posts</h1>
        <div className="text-center py-12 text-gray-500">Loading scheduled posts...</div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Scheduled Posts</h1>

        {/* Empty State */}
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarCheck className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No posts scheduled</h2>
          <p className="text-gray-500 mb-6">Approve posts from the Queue to schedule them</p>
          <Link
            href="/queue"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
          >
            Go to Queue →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Scheduled Posts</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{posts.length} posts waiting to publish</span>
          <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
            Auto-publishes at scheduled time
          </span>
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {posts.map((post) => {
          const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          const pillarColor = getPillarColor(pillarIndex)
          const hook = post.content.split('\n').filter(l => l.trim())[0] || post.content.substring(0, 100)
          const bodyPreview = post.content.split('\n').filter(l => l.trim()).slice(1).join(' ').substring(0, 150)
          const scheduledFor = scheduleTimes.get(post.id) || new Date()
          const timeUntil = getTimeUntil(scheduledFor)

          return (
            <div
              key={post.id}
              className={cn(
                'bg-white rounded-2xl border border-gray-200 shadow-sm p-5 transition-all duration-300',
                removingIds.has(post.id) && 'opacity-0 scale-95 h-0 overflow-hidden'
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
                  {post.topic_pillar}
                </span>
                <div className="w-2 h-2 rounded-full bg-green-500" style={{ boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)' }} />
              </div>

              {/* Hook */}
              <h3 className="font-serif text-lg font-bold leading-snug mb-2 text-gray-900">
                {hook}
              </h3>

              {/* Body Preview */}
              {bodyPreview && (
                <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                  {bodyPreview}
                </p>
              )}

              {/* Schedule Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 text-blue-900 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-semibold">
                    Scheduled: {formatScheduledTime(scheduledFor)}
                  </span>
                </div>
                <div className="text-xs text-blue-700 ml-6">
                  {timeUntil}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePublishNow(post.id)}
                  disabled={publishingId === post.id}
                  className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {publishingId === post.id ? 'Publishing...' : 'Publish Now'}
                </button>

                <button
                  onClick={() => handleReschedule(post)}
                  className="px-4 py-2.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-xl font-medium hover:bg-blue-100 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleRemove(post.id)}
                  className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Reschedule Sheet */}
      <Sheet
        isOpen={!!reschedulePost}
        onClose={() => setReschedulePost(null)}
        title="Reschedule Post"
      >
        <div className="space-y-6">
          {/* Date Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Day
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedDate('today')}
                className={cn(
                  'flex-1 px-4 py-3 rounded-lg font-medium transition-colors',
                  selectedDate === 'today'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                Today
              </button>
              <button
                onClick={() => setSelectedDate('tomorrow')}
                className={cn(
                  'flex-1 px-4 py-3 rounded-lg font-medium transition-colors',
                  selectedDate === 'tomorrow'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                Tomorrow
              </button>
            </div>
          </div>

          {/* Time Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Time
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[9, 12, 15, 18, 21].map((hour) => (
                <button
                  key={hour}
                  onClick={() => setSelectedTime(hour)}
                  className={cn(
                    'px-4 py-3 rounded-lg font-medium transition-colors',
                    selectedTime === hour
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Button */}
          <button
            onClick={handleSaveReschedule}
            className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
          >
            Schedule
          </button>
        </div>
      </Sheet>
    </div>
  )
}
