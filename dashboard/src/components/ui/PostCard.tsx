'use client'

import { useState, useEffect, useRef } from 'react'
import { ThumbsUp, Edit3, ThumbsDown, Loader2, Clock, Copy, Check, Paperclip, X } from 'lucide-react'
import { Post, PostImage } from '@/lib/types'
import { formatRelativeTime, getStatusColor, getPillarColor, cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAppContext } from '@/context/AppContext'
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
  const [copied, setCopied] = useState(false)
  const [showFullPost, setShowFullPost] = useState(false)

  const MAX_IMAGES_PER_POST = 4
  const [images, setImages] = useState<PostImage[]>(post.images || [])
  const [isUploading, setIsUploading] = useState(false)
  const { showToast } = useAppContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const remaining = MAX_IMAGES_PER_POST - images.length
    if (files.length > remaining) {
      showToast(`Can only add ${remaining} more image${remaining !== 1 ? 's' : ''}`, 'warning')
      return
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        showToast(`"${file.name}" exceeds 5MB limit`, 'error')
        return
      }
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        showToast(`"${file.name}" is not a supported format (JPEG, PNG, GIF)`, 'error')
        return
      }
    }

    setIsUploading(true)
    try {
      const result = await api.uploadPostImages(post.id, files)
      if (result.status === 'ok' && result.images) {
        setImages(prev => [...prev, ...result.images!])
        showToast(`${files.length} image${files.length > 1 ? 's' : ''} attached`, 'success')
      } else {
        showToast(result.message || 'Upload failed', 'error')
      }
    } catch {
      showToast('Failed to upload images', 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    const result = await api.deletePostImage(imageId)
    if (result.status === 'ok') {
      setImages(prev => prev.filter(img => img.id !== imageId))
    } else {
      showToast('Failed to remove image', 'error')
    }
  }

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(post.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = post.content
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Silent fail
      }
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

  // Calculate actual word count
  const wordCount = post.content?.trim().split(/\s+/).length || 0

  // Get pillar color based on pillar name hash
  const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const pillarColor = getPillarColor(pillarIndex)

  const statusColor = getStatusColor(post.approval_status)

  return (
    <div
      className={cn(
        'relative bg-surface rounded-2xl border border-stroke shadow-sm p-5 transition-all duration-300',
        isRemoving && 'opacity-0 scale-95 h-0 overflow-hidden'
      )}
    >
      {/* Copy Button - Top Right */}
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-text-primary transition-colors"
        title="Copy content"
      >
        {copied ? (
          <span className="text-xs text-green-500 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" />
            Copied!
          </span>
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>

      {/* Header: Pillar & Status */}
      <div className="flex items-start justify-between mb-3 pr-20">
        <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
          {post.topic_pillar}
        </span>
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', statusColor)} style={{ boxShadow: `0 0 8px ${statusColor}` }} />
        </div>
      </div>

      {/* Hook */}
      <h3 className="font-display text-lg font-bold leading-snug mb-2 text-text-primary">
        {hook}
      </h3>

      {/* Body Preview */}
      {bodyPreview && (
        <div className="mb-4">
          <p className="text-sm text-muted line-clamp-3">
            {bodyPreview}
          </p>
          <button
            onClick={() => setShowFullPost(true)}
            className="text-sm text-accent hover:text-accent-light mt-1 font-medium"
          >
            View full post
          </button>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-muted mb-4">
        <span>{formatRelativeTime(post.created_at)}</span>
        <span>{wordCount} words</span>
      </div>

      {/* Image Attachments */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {images.map((img) => (
            <div key={img.id} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-stroke">
              <img
                src={`${typeof window !== 'undefined' ? localStorage.getItem('api_url') || process.env.NEXT_PUBLIC_API_URL || 'https://api.byqalam.com' : ''}${img.url}`}
                alt={img.original_name}
                className="w-full h-full object-cover"
              />
              {showActions && (
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Actions */}
      {showActions && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleApproveClick}
            disabled={isApproving || isRejecting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 accent-gradient text-bg rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed leading-none"
          >
            {isApproving ? (
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            ) : (
              <ThumbsUp className="w-4 h-4 flex-shrink-0" />
            )}
            <span>Approve</span>
          </button>

          <button
            onClick={() => onEdit?.(post)}
            disabled={isApproving || isRejecting}
            className="px-4 py-2.5 border border-stroke text-muted hover:border-accent/50 hover:text-accent rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit3 className="w-4 h-4" />
          </button>

          <button
            onClick={handleAttachClick}
            disabled={isApproving || isRejecting || isUploading || images.length >= MAX_IMAGES_PER_POST}
            className="relative px-4 py-2.5 border border-stroke text-muted hover:border-accent/50 hover:text-accent rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={images.length >= MAX_IMAGES_PER_POST ? 'Max 4 images' : 'Attach images'}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
            {images.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent text-bg text-xs rounded-full flex items-center justify-center font-bold">
                {images.length}
              </span>
            )}
          </button>

          <button
            onClick={handleReject}
            disabled={isApproving || isRejecting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-stroke text-muted hover:border-red-500/50 hover:text-red-300 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed leading-none"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            ) : (
              <ThumbsDown className="w-4 h-4 flex-shrink-0" />
            )}
            <span>Reject</span>
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
                  ? 'bg-accent text-bg shadow-md'
                  : 'bg-surface-2 text-text-primary hover:bg-surface-2/80'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'default' ? 'border-bg' : 'border-stroke'
              )}>
                {scheduleMode === 'default' && <div className="w-2.5 h-2.5 bg-bg rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Default ({getDefaultSlotDisplay()})</div>
                <div className={cn('text-xs', scheduleMode === 'default' ? 'text-bg/70' : 'text-muted')}>
                  Auto-scheduled by system
                </div>
              </div>
            </button>

            <button
              onClick={() => setScheduleMode('custom')}
              className={cn(
                'w-full px-4 py-3 rounded-xl font-medium transition-all text-left flex items-center gap-3',
                scheduleMode === 'custom'
                  ? 'bg-accent text-bg shadow-md'
                  : 'bg-surface-2 text-text-primary hover:bg-surface-2/80'
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                scheduleMode === 'custom' ? 'border-bg' : 'border-stroke'
              )}>
                {scheduleMode === 'custom' && <div className="w-2.5 h-2.5 bg-bg rounded-full" />}
              </div>
              <div>
                <div className="font-semibold">Custom time</div>
                <div className={cn('text-xs', scheduleMode === 'custom' ? 'text-bg/70' : 'text-muted')}>
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
                        ? 'bg-accent text-bg'
                        : 'bg-surface-2 text-muted hover:bg-surface-2/80'
                    )}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setSelectedDate('tomorrow')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'tomorrow'
                        ? 'bg-accent text-bg'
                        : 'bg-surface-2 text-muted hover:bg-surface-2/80'
                    )}
                  >
                    Tomorrow
                  </button>
                  <button
                    onClick={() => setSelectedDate('day2')}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors',
                      selectedDate === 'day2'
                        ? 'bg-accent text-bg'
                        : 'bg-surface-2 text-muted hover:bg-surface-2/80'
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
                            ? 'bg-accent text-bg'
                            : isPast
                            ? 'bg-surface-2 text-muted opacity-40 cursor-not-allowed'
                            : 'bg-surface-2 text-muted hover:bg-surface-2/80 cursor-pointer'
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
                        ? 'bg-accent text-bg'
                        : 'bg-surface-2 text-muted hover:bg-surface-2/80'
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
                    className="mt-2 w-full px-3 py-2 bg-surface-2 border border-stroke text-text-primary rounded-lg focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowScheduler(false)}
              className="flex-1 px-4 py-3 border border-stroke text-muted rounded-xl font-medium hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSchedule}
              className="flex-1 px-4 py-3 accent-gradient text-bg rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Confirm Schedule
            </button>
          </div>
        </div>
      </Sheet>

      {/* Full Post Modal */}
      {showFullPost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFullPost(false)}>
          <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-stroke" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-stroke">
              <span className="font-semibold text-text-primary">Full Post</span>
              <button
                onClick={() => setShowFullPost(false)}
                className="text-muted hover:text-text-primary text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Topic badge and word count */}
            <div className="px-4 pt-3 flex items-center justify-between">
              <span className={cn('text-xs px-2 py-1 rounded-full font-semibold border', pillarColor)}>
                {post.topic_pillar}
              </span>
              <span className="text-xs text-muted">{wordCount} words</span>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-text-primary whitespace-pre-wrap leading-relaxed text-sm">
                {post.content}
              </p>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {images.map((img) => (
                    <div key={img.id} className="rounded-lg overflow-hidden border border-stroke">
                      <img
                        src={`${typeof window !== 'undefined' ? localStorage.getItem('api_url') || process.env.NEXT_PUBLIC_API_URL || 'https://api.byqalam.com' : ''}${img.url}`}
                        alt={img.original_name}
                        className="max-h-48 object-contain"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-stroke flex gap-2">
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 border border-stroke text-muted rounded-xl font-medium hover:bg-surface-2 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowFullPost(false)
                  handleApproveClick()
                }}
                disabled={isApproving || isRejecting}
                className="flex-1 accent-gradient text-bg px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isApproving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ThumbsUp className="w-4 h-4" />
                )}
                Approve
              </button>
              <button
                onClick={() => {
                  setShowFullPost(false)
                  handleReject()
                }}
                disabled={isApproving || isRejecting}
                className="flex-1 border border-stroke text-muted px-4 py-2.5 rounded-xl font-medium hover:border-red-500/50 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRejecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ThumbsDown className="w-4 h-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
