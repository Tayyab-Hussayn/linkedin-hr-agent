'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Post, Stats } from '@/lib/types'
import { useToast } from '@/hooks/useToast'
import { getNextGenerationTime, formatRelativeTime, getPillarColor, cn } from '@/lib/utils'
import { Sparkles, Clock, Loader2, TrendingUp } from 'lucide-react'
import { getDailyPostLimit } from '@/lib/config'

export default function ContentPage() {
  const [approvedPosts, setApprovedPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [generatedToday, setGeneratedToday] = useState(0)
  const { showToast } = useToast()

  const DAILY_LIMIT = getDailyPostLimit()

  useEffect(() => {
    fetchData()

    const handleVisibility = () => {
      if (!document.hidden) fetchData()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [approved, statsData, allPosts, pendingPosts] = await Promise.all([
        api.getPosts('approved', 20),
        api.getStats(),
        api.getPosts('history', 50),
        api.getPosts('pending', 50),
      ])
      setApprovedPosts(approved)
      setStats(statsData)

      // Calculate posts generated TODAY only
      const allTodayPosts = [...allPosts, ...pendingPosts]
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let todayCount = allTodayPosts.filter(post => {
        const postDate = new Date(post.created_at)
        postDate.setHours(0, 0, 0, 0)
        return postDate.getTime() === today.getTime()
      }).length

      // Check for manual reset (testing only)
      const resetDate = localStorage.getItem('limit_reset_date')
      const todayString = new Date().toDateString()
      if (resetDate === todayString) {
        // User reset today — use 0 as effective count
        todayCount = 0
      }

      setGeneratedToday(todayCount)
    } catch (error) {
      showToast('Failed to load content data', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateNow = async () => {
    // Check daily limit
    if (generatedToday >= DAILY_LIMIT) {
      showToast(`Daily limit reached (${DAILY_LIMIT} posts per day)`, 'warning')
      return
    }

    setIsGenerating(true)
    try {
      await api.generateNow()
      showToast('Content generation started! Check queue in a moment.', 'success')
      setGeneratedToday(prev => prev + 1)

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
      await api.schedulePost(postId, new Date().toISOString())
      showToast('Post scheduled for immediate publishing', 'success')
      setApprovedPosts(prev => prev.filter(p => p.id !== postId))
    } catch (error) {
      showToast('Failed to schedule post', 'error')
    }
  }

  const handleResetLimit = () => {
    const todayString = new Date().toDateString()
    localStorage.setItem('limit_reset_date', todayString)
    localStorage.setItem('limit_reset_count', '0')
    showToast('Daily limit reset — you can generate more posts', 'success')
    fetchData()
  }

  const { hours, minutes } = getNextGenerationTime()
  const isLimitReached = generatedToday >= DAILY_LIMIT

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Content</h1>

      {/* Generation Controls Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Auto-Generation</h2>
            <p className="text-sm text-gray-500">Runs daily at 8:00 AM & 6:00 PM</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-green-700">Auto-generation is ON</span>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          <span>Next run in <span className="font-semibold text-blue-600">{hours}h {minutes}m</span></span>
        </div>

        {/* Daily Limit Info */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Generated today</span>
            <span className="font-semibold text-gray-900">{Math.min(generatedToday, DAILY_LIMIT)} / {DAILY_LIMIT}</span>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isLimitReached ? "bg-red-500" : "bg-blue-500"
              )}
              style={{ width: `${Math.min((generatedToday / DAILY_LIMIT) * 100, 100)}%` }}
            />
          </div>
          {isLimitReached && (
            <button
              onClick={handleResetLimit}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-500
                         hover:text-blue-600 transition-colors cursor-pointer
                         bg-gray-100 hover:bg-blue-50 px-3 py-1.5 rounded-full
                         border border-gray-200 hover:border-blue-200"
            >
              <span>↺</span>
              <span>Reset daily limit for testing</span>
            </button>
          )}
        </div>

        {/* Generate Now Button */}
        <button
          onClick={handleGenerateNow}
          disabled={isGenerating || isLimitReached}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-lg mb-4">Scheduled Posts</h2>

        {isLoading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : approvedPosts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
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
                <div key={post.id} className="p-4 border border-gray-200 rounded-xl hover:border-blue-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className={cn('inline-block px-2 py-1 text-xs font-semibold rounded-full border mb-2', pillarColor)}>
                        {post.topic_pillar}
                      </span>
                      <p className="font-serif text-sm font-bold text-gray-900 line-clamp-2">
                        {hook}
                      </p>
                    </div>
                    <button
                      onClick={() => handlePublishNow(post.id)}
                      className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-lg">This Week's Activity</h2>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-xs text-gray-600 mt-1">Generated</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-xs text-gray-600 mt-1">Approved</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
              <div className="text-xs text-gray-600 mt-1">Rejected</div>
            </div>
          </div>

          {stats.total > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Approval rate: <span className="font-semibold text-gray-900">
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
