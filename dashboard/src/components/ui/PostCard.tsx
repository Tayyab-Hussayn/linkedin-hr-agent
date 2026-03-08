'use client'

import { useState, useEffect } from 'react'
import { ThumbsUp, Edit3, ThumbsDown, Loader2, Clock } from 'lucide-react'
import { Post } from '@/lib/types'
import { formatRelativeTime, getStatusColor, getPillarColor, cn } from '@/lib/utils'
import { Sheet } from './Sheet'

interface PostCardProps {
  post: Post
  onApprove?: (postId: string, scheduledFor?: string | null) => Promise<void>
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
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'default' | 'custom'>('default')
  const [selectedDate, setSelectedDate] = useState<'today' | 'tomorrow' | 'day2'>('today')
  const [selectedTime, setSelectedTime] = useState('21:00')
  const [customTime, setCustomTime] = useState('')

  function getDefaultSlotDisplay(): string {
    const now = new Date()
    const sixPM = new Date()
    sixPM.setHours(18, 0, 0, 0)
    if (sixPM.getTime() > now.getTime() + 2 * 60 * 1000) {
      return 'Today at 6:00 PM'
    }
    return 'Tomorrow at 6:00 PM'
  }

  function getDateStr(mode: 'today' | 'tomorrow' | 'day2'): string {
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
    console.log('buildScheduledISO:', dateStr, time24h, '→', localDate.toISOString())
    return localDate.toISOString()
  }

  const isSlotPast = (dateMode: string, timeStr: string): boolean => {
    if (dateMode !== 'today') return false
    const [hour, minute] = timeStr.split(':').map(Number)
    const slot = new Date()
    slot.setHours(hour, minute, 0, 0)
    return slot.getTime() <= new Date().getTime() + 2 * 60 * 1000
  }

  function getDefaultSlot(): { date: 'today' | 'tomorrow', time: string } {
    const now = new Date()
    const slots = ['09:00', '12:00', '15:00', '18:00', '21:00']

    for (const slot of slots) {
      const [hour, minute] = slot.split(':').map(Number)
      const slotTime = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        hour, minute, 0, 0
      )
      // Slot must be more than 2 minutes in future
      if (slotTime.getTime() > now.getTime() + 2 * 60 * 1000) {
        return { date: 'today', time: slot }
      }
    }
    // All slots passed today — tomorrow 9am
    return { date: 'tomorrow', time: '09:00' }
  }

  const handleApproveClick = () => {
    setShowScheduler(true)
  }

  useEffect(() => {
    if (showScheduler) {
      const def = getDefaultSlot()
      setSelectedDate(def.date)
      setSelectedTime(def.time)
      setScheduleMode('default')
    }
  }, [showScheduler])

  const handleConfirmSchedule = async () => {
    if (!onApprove) return
    setIsApproving(true)
    setShowScheduler(false)

    try {
      if (scheduleMode === 'default') {
        await onApprove(post.id, null)
      } else {
        const timeStr = selectedTime === 'custom' ? customTime : selectedTime
        const dateStr = getDateStr(selectedDate)
        const isoStr = buildScheduledISO(dateStr, timeStr)

        console.log('Schedule debug:', {
          selectedDate,
          selectedTime,
          customTime,
          timeStr,
          dateStr,
          isoStr
        })

        await onApprove(post.id, isoStr)
      }
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
            onClick={handleApproveClick}
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

      {/* Scheduling Sheet */}
      <Sheet
        isOpen={showScheduler}
        onClose={() => setShowScheduler(false)}
        title="Schedule this post"
      >
        <div className="space-y-6">
          {/* Schedule Mode */}
          <div className="space-y-3">
            <button
              onClick={() => setScheduleMode('default')}
              className={cn(
                'w-full px-4 py-3 rounded-xl font-medium transition-all text-left flex items-center gap-3',
                scheduleMode === 'default'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'default' ? 'border-white' : 'border-gray-400'
              )}>
                {scheduleMode === 'default' && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Default ({getDefaultSlotDisplay()})</div>
                <div className={cn('text-xs', scheduleMode === 'default' ? 'text-blue-100' : 'text-gray-500')}>
                  Auto-scheduled by system
                </div>
              </div>
            </button>

            <button
              onClick={() => setScheduleMode('custom')}
              className={cn(
                'w-full px-4 py-3 rounded-xl font-medium transition-all text-left flex items-center gap-3',
                scheduleMode === 'custom'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'custom' ? 'border-white' : 'border-gray-400'
              )}>
                {scheduleMode === 'custom' && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Custom time</div>
                <div className={cn('text-xs', scheduleMode === 'custom' ? 'text-blue-100' : 'text-gray-500')}>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDate('today')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
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
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'tomorrow'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => setSelectedDate('day2')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'day2'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    +2 days
                  </button>
                </div>
              </div>

              {/* Time Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                <div className="grid grid-cols-2 gap-2">
                  {['09:00', '12:00', '18:00', '21:00'].map((time) => {
                    const isPast = isSlotPast(selectedDate, time)
                    return (
                      <button
                        key={time}
                        onClick={() => !isPast && setSelectedTime(time)}
                        disabled={isPast}
                        className={cn(
                          'px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                          selectedTime === time && !isPast
                            ? 'bg-blue-500 text-white'
                            : isPast
                            ? 'bg-gray-100 text-gray-400 opacity-40 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                        )}
                      >
                        {time === '09:00' && '9:00 AM'}
                        {time === '12:00' && '12:00 PM'}
                        {time === '18:00' && '6:00 PM'}
                        {time === '21:00' && '9:00 PM'}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setSelectedTime('custom')}
                    className={cn(
                      'px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedTime === 'custom'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    Custom...
                  </button>
                </div>

                {selectedTime === 'custom' && (
                  <input
                    type="time"
                    value={customTime}
                    onChange={e => {
                      const val = e.target.value // e.g. "22:19"
                      setCustomTime(val)
                      setSelectedTime('custom')

                      if (val && val.includes(':')) {
                        const [hour, minute] = val.split(':').map(Number)
                        const now = new Date()
                        const todaySlot = new Date(
                          now.getFullYear(), now.getMonth(), now.getDate(),
                          hour, minute, 0, 0
                        )
                        // If this custom time is still 2+ minutes in future today
                        // automatically switch date to today
                        if (todaySlot.getTime() > now.getTime() + 2 * 60 * 1000) {
                          setSelectedDate('today')
                        } else {
                          setSelectedDate('tomorrow')
                        }
                      }
                    }}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowScheduler(false)}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSchedule}
              className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Confirm Schedule
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
