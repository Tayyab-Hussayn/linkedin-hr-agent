'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post, Stats } from '@/lib/types'
import { useToast } from '@/hooks/useToast'
import { getNextGenerationTime, formatRelativeTime, getPillarColor, cn } from '@/lib/utils'
import { Sparkles, Clock, Loader2, TrendingUp } from 'lucide-react'

export default function ContentPage() {
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    fetchData()
    fetchStats()

    // Auto-refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Refresh when page becomes visible
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchStats()
        fetchData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const fetchStats = async () => {
    try {
      const data = await api.getStats()
      setStats(data)
      // Sync to localStorage as cache only
      localStorage.setItem('daily_post_limit', String(data.daily_post_limit))
      localStorage.setItem('plan_name', data.plan_name)
    } catch(e) {
      console.error('fetchStats failed:', e)
    }
  }

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [approved, statsData] = await Promise.all([
        api.getPosts('approved', 20),
        api.getStats(),
      ])
      setApprovedPosts(approved)
      setStats(statsData)
    } catch (error) {
      showToast('Failed to load content data', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateNow = async () => {
    // Check if generation is allowed by plan
    if (!stats?.can_generate_now) {
      showToast('Manual generation not available in your plan', 'warning')
      return
    }

    // Check daily limit
    if (stats && stats.generated_today >= stats.daily_post_limit) {
      showToast(`Daily limit reached (${stats.daily_post_limit} posts per day)`, 'warning')
      return
    }

    setIsGenerating(true)
    try {
      await api.generateNow()
      showToast('Content generation started! Check queue in a moment.', 'success')

      // Refresh stats immediately
      await fetchStats()

      // Refresh queue after 3 seconds
      setTimeout(() => {
        fetchData()
      }, 3000)
    } catch (error) {
      showToast('Failed to generate content', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePublishNow = async (postId: string) => {
    try {
      // Schedule for next 6PM local time slot
      const now = new Date()
      const today6PM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0)

      let scheduledTime: string
      if (today6PM.getTime() > now.getTime() + 2 * 60 * 1000) {
        // Today at 6PM is still in the future
        scheduledTime = today6PM.toISOString()
      } else {
        // Schedule for tomorrow at 6PM
        const tomorrow6PM = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0, 0, 0)
        scheduledTime = tomorrow6PM.toISOString()
      }

      await api.schedulePost(postId, scheduledTime)
      showToast('Post scheduled for immediate publishing', 'success')
      setApprovedPosts(prev => prev.filter(p => p.id !== postId))
    } catch (error) {
      showToast('Failed to schedule post', 'error')
    }
  }

  const handleResetLimit = async () => {
    try {
      // Step 1: Delete today's posts from DB via n8n webhook
      await api.resetDailyLimit()

      // Step 2: Clear localStorage reset flags
      localStorage.removeItem('limit_reset_date')
      localStorage.removeItem('limit_reset_count')

      // Step 3: Refetch fresh count from DB
      await fetchData()

      // Step 4: Show success toast
      showToast('Daily limit reset — you can generate new posts', 'success')

    } catch(e) {
      showToast('Reset failed — try again', 'error')
    }
  }

  const { hours, minutes } = getNextGenerationTime()
  const isLimitReached = stats ? stats.generated_today >= stats.daily_post_limit : false
  const progress = stats ? (stats.generated_today / stats.daily_post_limit) * 100 : 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Content</h1>

      {/* Generation Controls Card */}
      <div className="bg-surface rounded-2xl border border-stroke shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Auto-Generation</h2>
            <p className="text-sm text-muted">Runs daily at 8:00 AM & 6:00 PM</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="w-2 h-2 accent-gradient rounded-full animate-pulse" />
          <span className="text-sm font-medium text-green-700">Auto-generation is ON</span>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-2 mb-4 text-sm text-muted">
          <Clock className="w-4 h-4" />
          <span>Next run in <span className="font-semibold text-accent">{hours}h {minutes}m</span></span>
        </div>

        {/* Daily Limit Info */}
        <div className="mb-4 p-3 bg-bg rounded-lg">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted">Generated today</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">
                {mounted && stats ? `${stats.generated_today} / ${stats.daily_post_limit}` : '...'}
              </span>
              {mounted && stats && (
                <span className="text-xs text-muted">{stats.plan_name} Plan</span>
              )}
            </div>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isLimitReached ? "bg-red-500/100" : "accent-gradient"
              )}
              style={{
                width: mounted && stats
                  ? `${Math.min(progress, 100)}%`
                  : '0%'
              }}
            />
          </div>
          {isLimitReached && (
            <button
              onClick={handleResetLimit}
              className="mt-2 flex items-center gap-1.5 text-xs text-muted
                         hover:text-accent transition-colors cursor-pointer
                         bg-surface-2 hover:bg-accent/5 px-3 py-1.5 rounded-full
                         border border-stroke hover:border-blue-200"
            >
              <span>↺</span>
              <span>Reset daily limit for testing</span>
            </button>
          )}
        </div>

        {/* Generate Now Button */}
        <button
          onClick={handleGenerateNow}
          disabled={isGenerating || !stats?.can_generate_now || (mounted && isLimitReached)}
          className="w-full px-4 py-3 accent-gradient text-white rounded-xl font-medium hover:accent-gradient transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : !stats?.can_generate_now ? (
            'Manual generation not available'
          ) : isLimitReached ? (
            'Daily limit reached'
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Now
            </>
          )}
        </button>
      </div>

      {/* Scheduled Posts Card */}
      <div className="bg-surface rounded-2xl border border-stroke shadow-sm p-6">
        <h2 className="font-semibold text-lg mb-4">Scheduled Posts</h2>

        {isLoading ? (
          <div className="text-sm text-muted">Loading...</div>
        ) : approvedPosts.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <p className="text-sm">No approved posts yet</p>
            <p className="text-xs mt-1">Approve posts from the Queue to see them here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvedPosts.map((post) => {
              const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
              const pillarColor = getPillarColor(pillarIndex)
              const hook = post.content.split('\n').filter(l => l.trim())[0] || post.content.substring(0, 100)

              return (
                <div key={post.id} className="p-4 border border-stroke rounded-xl hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className={cn('inline-block px-2 py-1 text-xs font-semibold rounded-full border mb-2', pillarColor)}>
                        {post.topic_pillar}
                      </span>
                      <p className="font-serif text-sm font-bold text-text-primary line-clamp-2">
                        {hook}
                      </p>
                    </div>
                    <button
                      onClick={() => handlePublishNow(post.id)}
                      className="px-3 py-1.5 accent-gradient text-white text-xs font-medium rounded-lg hover:accent-gradient transition-colors whitespace-nowrap"
                    >
                      Publish Now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* This Week's Activity Card */}
      {stats && (
        <div className="bg-surface rounded-2xl border border-stroke shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-muted" />
            <h2 className="font-semibold text-lg">This Week's Activity</h2>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-accent/5 rounded-lg">
              <div className="text-2xl font-bold text-accent">{stats.total}</div>
              <div className="text-xs text-muted mt-1">Generated</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-xs text-muted mt-1">Approved</div>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold text-red-300">{stats.rejected}</div>
              <div className="text-xs text-muted mt-1">Rejected</div>
            </div>
          </div>

          {stats.total > 0 && (
            <div className="pt-4 border-t border-stroke">
              <div className="text-sm text-muted">
                Approval rate: <span className="font-semibold text-text-primary">
                  {Math.round((stats.approved / stats.total) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
