'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post } from '@/lib/types'
import { useAppContext } from '@/context/AppContext'
import { CalendarCheck, Clock, Trash2, Calendar } from 'lucide-react'
import { cn, getPillarColor, formatRelativeTime } from '@/lib/utils'
import { Sheet } from '@/components/ui/Sheet'
import Link from 'next/link'

function formatScheduledTime(isoStr: string): string {
  if (!isoStr) return 'Time not set'
  const date = new Date(isoStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })
  if (diffMs <= 0) return 'Publishing soon...'
  if (diffDays === 0) return `Today at ${timeStr}`
  if (diffDays === 1) return `Tomorrow at ${timeStr}`
  return `${date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })} at ${timeStr}`
}

function getCountdown(isoStr: string): string {
  if (!isoStr) return ''
  const diffMs = new Date(isoStr).getTime() - new Date().getTime()
  if (diffMs <= 0) return 'any moment now'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `in ${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `in ${days}d ${hours % 24}h`
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null)
  const [scheduleMode, setScheduleMode] = useState<'default' | 'custom'>('default')
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'day2'>('today')
  const [selectedTime, setSelectedTime] = useState('18:00')
  const [customTime, setCustomTime] = useState('')
  const [tick, setTick] = useState(0)
  const { showToast, setScheduledCount, refreshSignal } = useAppContext()

  // Refresh when LayoutWrapper broadcasts an SSE event via refreshSignal
  useEffect(() => {
    if (refreshSignal > 0) fetchScheduledPosts()
  }, [refreshSignal])

  function getDefaultSlotDisplay(): string {
    const now = new Date()
    const sixPM = new Date()
    sixPM.setHours(18, 0, 0, 0)
    if (sixPM.getTime() > now.getTime() + 2 * 60 * 1000) {
      return 'Today at 6:00 PM'
    }
    return 'Tomorrow at 6:00 PM'
  }

  function getDateStr(mode: string): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    const local = new Date(y, m, d) // midnight local time
    if (mode === 'tomorrow') local.setDate(local.getDate() + 1)
    if (mode === 'day2') local.setDate(local.getDate() + 2)
    return `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`
  }

  function buildScheduledISO(dateStr: string, time24h: string): string {
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hour, minute] = time24h.split(':').map(Number)
    const localDate = new Date(year, month - 1, day, hour, minute, 0, 0)
    return localDate.toISOString()
  }

  useEffect(() => {
    fetchScheduledPosts()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (refreshSignal > 0) fetchScheduledPosts()
  }, [refreshSignal])

  const fetchScheduledPosts = async () => {
    setIsLoading(true)
    try {
      const postsData = await api.getPosts('scheduled', 20)
      setPosts(postsData)
      setScheduledCount(postsData.length)
    } catch (error) {
      showToast('Failed to load scheduled posts', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublishNow = async (postId: string) => {
    setPublishingId(postId)
    try {
      await api.publishNow(postId)
      // Remove from scheduled list optimistically
      setPosts(prev => prev.filter(p => p.id !== postId))
      showToast('Publishing now — will appear on LinkedIn within 60 seconds', 'success')
    } catch(e) {
      showToast('Failed to trigger publish', 'error')
    } finally {
      setPublishingId(null)
    }
  }

  const handleRemove = async (postId: string) => {
    try {
      setRemovingIds(prev => new Set(prev).add(postId))

      await api.submitDecision(postId, 'rejected')

      setTimeout(() => {
        setPosts(prev => {
          const filtered = prev.filter(p => p.id !== postId)
          setScheduledCount(filtered.length)
          return filtered
        })
        setRemovingIds(prev => {
          const next = new Set(prev)
          next.delete(postId)
          return next
        })
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
    setScheduleMode('default')
    setSelectedDate('today')
    setSelectedTime('18:00')
    setCustomTime('')
  }

  const handleSaveReschedule = async () => {
    if (!reschedulePost) return

    try {
      let scheduledFor: string | null = null

      if (scheduleMode === 'custom') {
        const dateStr = getDateStr(selectedDate)
        const timeStr = selectedTime === 'custom' ? customTime : selectedTime
        scheduledFor = buildScheduledISO(dateStr, timeStr)
      }

      // Use submitDecision with approved status to reschedule
      await api.submitDecision(reschedulePost.id, 'approved', undefined, scheduledFor)

      // Refresh posts to get updated scheduled_for
      await fetchScheduledPosts()

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
        <div className="text-center py-12 text-muted">Loading scheduled posts...</div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Scheduled Posts</h1>

        {/* Empty State */}
        <div className="bg-surface rounded-2xl border border-stroke p-12 text-center">
          <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarCheck className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">No posts scheduled</h2>
          <p className="text-muted mb-6">Approve posts from the Queue to schedule them</p>
          <Link
            href="/queue"
            className="inline-flex items-center gap-2 px-6 py-3 accent-gradient text-bg rounded-xl font-medium hover:accent-gradient transition-colors"
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
        <span className="text-sm text-muted">{posts.length} posts waiting to publish</span>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {posts.map((post) => {
          const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
          const pillarColor = getPillarColor(pillarIndex)
          const lines = post.content.split('\n').filter(l => l.trim())
          const preview = lines.slice(0, 3).join(' ').substring(0, 200)

          const scheduledForStr = post.scheduled_for ?? ''
          const statusText = formatScheduledTime(scheduledForStr)
          const countdownText = getCountdown(scheduledForStr)

          return (
            <div
              key={post.id}
              className={cn(
                'bg-surface rounded-2xl border border-stroke shadow-sm p-5 transition-all duration-300 flex items-center gap-4',
                removingIds.has(post.id) && 'opacity-0 scale-95 h-0 overflow-hidden'
              )}
            >
              {/* Left content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="mb-3">
                  <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
                    {post.topic_pillar}
                  </span>
                </div>

                {/* Content Preview */}
                <p className="text-sm text-text-primary line-clamp-2 mb-3">
                  {preview}
                </p>

                {/* Schedule Info */}
                <div className="bg-surface-2 border border-stroke rounded-xl p-3">
                  <div className="flex items-center gap-2 text-text-primary">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-semibold">
                      Scheduled: {statusText} {countdownText && `(${countdownText})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right actions - vertically centered */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <button
                  onClick={() => handlePublishNow(post.id)}
                  disabled={publishingId === post.id}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 accent-gradient text-bg rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed leading-none"
                >
                  {publishingId === post.id ? 'Publishing...' : 'Publish Now'}
                </button>

                <button
                  onClick={() => handleRemove(post.id)}
                  className="p-1.5 text-muted hover:text-red-300 transition-colors"
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
          {/* Schedule Mode */}
          <div className="space-y-3">
            <button
              onClick={() => setScheduleMode('default')}
              className={cn(
                'w-full px-4 py-3 rounded-xl font-medium transition-all text-left flex items-center gap-3',
                scheduleMode === 'default'
                  ? 'accent-gradient text-bg shadow-md'
                  : 'bg-surface-2 text-text-primary hover:bg-gray-200'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'default' ? 'border-white' : 'border-gray-400'
              )}>
                {scheduleMode === 'default' && <div className="w-2.5 h-2.5 bg-surface rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Default ({getDefaultSlotDisplay()})</div>
                <div className={cn('text-xs', scheduleMode === 'default' ? 'text-blue-100' : 'text-muted')}>
                  Auto-scheduled by system
                </div>
              </div>
            </button>

            <button
              onClick={() => setScheduleMode('custom')}
              className={cn(
                'w-full px-4 py-3 rounded-xl font-medium transition-all text-left flex items-center gap-3',
                scheduleMode === 'custom'
                  ? 'accent-gradient text-bg shadow-md'
                  : 'bg-surface-2 text-text-primary hover:bg-gray-200'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'custom' ? 'border-white' : 'border-gray-400'
              )}>
                {scheduleMode === 'custom' && <div className="w-2.5 h-2.5 bg-surface rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Custom time</div>
                <div className={cn('text-xs', scheduleMode === 'custom' ? 'text-blue-100' : 'text-muted')}>
                  Choose specific date and time
                </div>
              </div>
            </button>
          </div>

          {/* Custom Time Options */}
          {scheduleMode === 'custom' && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Date</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDate('today')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'today'
                        ? 'accent-gradient text-white'
                        : 'bg-surface-2 text-text-primary hover:bg-gray-200'
                    )}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedDate('tomorrow')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'tomorrow'
                        ? 'accent-gradient text-white'
                        : 'bg-surface-2 text-text-primary hover:bg-gray-200'
                    )}
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => setSelectedDate('day2')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'day2'
                        ? 'accent-gradient text-white'
                        : 'bg-surface-2 text-text-primary hover:bg-gray-200'
                    )}
                  >
                    +2 days
                  </button>
                </div>
              </div>

              {/* Time Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Time</label>
                <div className="grid grid-cols-2 gap-2">
                  {['09:00', '12:00', '18:00', '21:00'].map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={cn(
                        'px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                        selectedTime === time
                          ? 'accent-gradient text-white'
                          : 'bg-surface-2 text-text-primary hover:bg-gray-200'
                      )}
                    >
                      {time === '09:00' && '9:00 AM'}
                      {time === '12:00' && '12:00 PM'}
                      {time === '18:00' && '6:00 PM'}
                      {time === '21:00' && '9:00 PM'}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedTime('custom')}
                    className={cn(
                      'px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedTime === 'custom'
                        ? 'accent-gradient text-white'
                        : 'bg-surface-2 text-text-primary hover:bg-gray-200'
                    )}
                  >
                    Custom...
                  </button>
                </div>

                {selectedTime === 'custom' && (
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="mt-2 w-full px-3 py-2 border border-stroke rounded-lg focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setReschedulePost(null)}
              className="flex-1 px-4 py-3 bg-surface-2 text-text-primary rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveReschedule}
              className="flex-1 px-4 py-3 accent-gradient text-bg rounded-xl font-medium hover:accent-gradient transition-colors flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Reschedule
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
