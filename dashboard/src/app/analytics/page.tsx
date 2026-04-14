'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Stats, PillarStat, DailyActivity, Post } from '@/lib/types'
import { useAppContext } from '@/context/AppContext'
import { calcHealthScore, generateInsight, getPillarColor, formatRelativeTime, getStatusLabel, cn } from '@/lib/utils'
import { TrendingUp, AlertCircle, BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [pillarStats, setPillarStats] = useState<PillarStat[]>([])
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])
  const [recentPosts, setRecentPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useAppContext()

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    setIsLoading(true)
    try {
      const [statsData, pillars, activity, history] = await Promise.all([
        api.getStats(),
        api.getPillarStats(),
        api.getDailyActivity(7),
        api.getPosts('history', 10),
      ])
      setStats(statsData)
      setPillarStats(pillars)
      setDailyActivity(activity)
      setRecentPosts(history)
    } catch (error) {
      showToast('Failed to load analytics', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="text-center py-12 text-muted">Loading analytics...</div>
      </div>
    )
  }

  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0
  const healthScore = calcHealthScore(stats, approvalRate)
  const insight = generateInsight(stats, approvalRate)

  const getHealthLabel = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-green-600' }
    if (score >= 70) return { label: 'Good', color: 'text-accent' }
    if (score >= 50) return { label: 'Needs Attention', color: 'text-orange-600' }
    return { label: 'Critical', color: 'text-red-300' }
  }

  const healthLabel = getHealthLabel(healthScore)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <span className="text-sm text-muted">All time</span>
      </div>

      {/* Health Banner */}
      <div className="bg-surface rounded-2xl border border-stroke p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-4xl font-bold mb-1 text-text-primary">{healthScore}</h2>
            <p className="text-sm font-medium text-muted">Health Score</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: healthScore >= 70 ? '#4a9e4a' : healthScore >= 50 ? '#C9A84C' : '#e04a4a' }}>{healthLabel.label}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-1000 ease-out"
            style={{ width: `${healthScore}%`, background: 'linear-gradient(90deg, #C9A84C, #E8C97A)' }}
          />
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Generated</div>
          <div className="text-3xl font-bold text-text-primary">{stats.total}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Approved</div>
          <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Published</div>
          <div className="text-3xl font-bold text-accent">{stats.published}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Rejected</div>
          <div className="text-3xl font-bold text-red-300">{stats.rejected}</div>
        </div>
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Approval Rate</div>
          <div className="text-3xl font-bold text-purple-600">{approvalRate}%</div>
        </div>
        <div className="bg-surface rounded-2xl border border-stroke p-4">
          <div className="text-sm text-muted mb-1">Pending</div>
          <div className="text-3xl font-bold text-orange-600">{stats.pending}</div>
        </div>
      </div>

      {/* Insight Box */}
      <div className="bg-accent/5 border-l-4 border-blue-500 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900">{insight}</p>
      </div>

      {/* Daily Activity Chart */}
      <div className="bg-surface rounded-2xl border border-stroke p-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-5 h-5 text-muted" />
          <h2 className="font-semibold text-lg">Daily Activity (Last 7 Days)</h2>
        </div>

        {/* Simple Bar Chart */}
        <div className="space-y-4">
          {(() => {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

            // Build lookup keyed by day abbreviation from API data
            const dayLookup: Record<string, DailyActivity> = {}
            for (const d of dailyActivity) {
              if (d.day) dayLookup[d.day] = d
            }

            const maxValue = dailyActivity.length > 0
              ? Math.max(...dailyActivity.map(d => (d.generated || 0) + (d.published || 0) + (d.rejected || 0)), 1)
              : 1

            return days.map((day) => {
              const dayData = dayLookup[day]
              const generated = dayData?.generated || 0
              const published = dayData?.published || 0
              const rejected = dayData?.rejected || 0

              return (
                <div key={day}>
                  <div className="text-xs text-muted mb-1">{day}</div>
                  <div className="flex items-center gap-1 h-8">
                    {generated > 0 && (
                      <div
                        className="accent-gradient rounded h-full flex items-center justify-center text-xs text-bg font-medium"
                        style={{ width: `${(generated / maxValue) * 100}%`, minWidth: '24px' }}
                      >
                        {generated}
                      </div>
                    )}
                    {published > 0 && (
                      <div
                        className="accent-gradient rounded h-full flex items-center justify-center text-xs text-bg font-medium"
                        style={{ width: `${(published / maxValue) * 100}%`, minWidth: '24px' }}
                      >
                        {published}
                      </div>
                    )}
                    {rejected > 0 && (
                      <div
                        className="bg-red-500/100 rounded h-full flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${(rejected / maxValue) * 100}%`, minWidth: '24px' }}
                      >
                        {rejected}
                      </div>
                    )}
                    {generated === 0 && published === 0 && rejected === 0 && (
                      <div className="text-xs text-muted">—</div>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-stroke">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 accent-gradient rounded" />
            <span className="text-muted">Generated</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 accent-gradient rounded" />
            <span className="text-muted">Published</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 bg-red-500/100 rounded" />
            <span className="text-muted">Rejected</span>
          </div>
        </div>
      </div>

      {/* Pillar Performance */}
      {pillarStats.length > 0 && (
        <div className="bg-surface rounded-2xl border border-stroke p-6">
          <h2 className="font-semibold text-lg mb-4">Content Pillar Performance</h2>
          <div className="space-y-4">
            {pillarStats.map((pillar, index) => {
              const pillarColor = getPillarColor(index)
              return (
                <div key={pillar.topic_pillar} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={cn('px-3 py-1 text-xs font-semibold rounded-full border', pillarColor)}>
                      {pillar.topic_pillar}
                    </span>
                    <span className="text-sm font-semibold text-text-primary">
                      {pillar.approval_rate_pct}% approval
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>{pillar.total} total</span>
                    <span>•</span>
                    <span className="text-green-600">{pillar.approved} approved</span>
                    <span>•</span>
                    <span className="text-red-300">{pillar.rejected} rejected</span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full accent-gradient transition-all duration-500"
                      style={{ width: `${pillar.approval_rate_pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <div className="bg-surface rounded-2xl border border-stroke p-6">
          <h2 className="font-semibold text-lg mb-4">Recent Posts</h2>
          <div className="space-y-3">
            {recentPosts.map((post) => {
              const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
              const pillarColor = getPillarColor(pillarIndex)
              const hook = post.content.split('\n').filter(l => l.trim())[0] || post.content.substring(0, 100)
              const statusLabel = getStatusLabel(post)
              const statusColors: Record<string, string> = {
                Published: 'bg-blue-100 text-blue-700 border-blue-200',
                Approved: 'bg-green-100 text-green-700 border-green-200',
                Rejected: 'bg-red-100 text-red-300 border-red-500/20',
                Pending: 'bg-orange-100 text-orange-700 border-orange-200',
              }

              return (
                <div key={post.id} className="flex items-start gap-3 p-3 border border-stroke rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', pillarColor)}>
                        {post.topic_pillar}
                      </span>
                      <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', statusColors[statusLabel])}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="font-serif text-sm font-bold text-text-primary line-clamp-2 mb-1">
                      {hook}
                    </p>
                    <p className="text-xs text-muted">{formatRelativeTime(post.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Post History Section */}
      <div className="bg-surface rounded-2xl border border-stroke p-6">
        <h2 className="font-semibold text-lg mb-4">Post History</h2>
        <p className="text-sm text-muted mb-4">Complete history of all posts with their current status</p>

        <HistorySection posts={recentPosts} />
      </div>
    </div>
  )
}

function HistorySection({ posts: historyPosts }: { posts: Post[] }) {
  if (historyPosts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted">No post history yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {historyPosts.map((post) => {
        const pillarIndex = post.topic_pillar.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
        const pillarColor = getPillarColor(pillarIndex)
        const hook = post.content.split('\n').filter(l => l.trim())[0] || post.content.substring(0, 100)
        const statusLabel = getStatusLabel(post)
        const statusColors: Record<string, string> = {
          Published: 'bg-blue-100 text-blue-700 border-blue-200',
          Approved: 'bg-green-100 text-green-700 border-green-200',
          Rejected: 'bg-red-100 text-red-300 border-red-500/20',
          Pending: 'bg-orange-100 text-orange-700 border-orange-200',
        }

        return (
          <div key={post.id} className="flex items-start gap-3 p-3 border border-stroke rounded-lg hover:bg-bg transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', pillarColor)}>
                  {post.topic_pillar}
                </span>
                <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', statusColors[statusLabel])}>
                  {statusLabel}
                </span>
              </div>
              <p className="font-serif text-sm font-bold text-text-primary line-clamp-1 mb-1">
                {hook}
              </p>
              <p className="text-xs text-muted">{formatRelativeTime(post.created_at)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
