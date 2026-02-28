'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Stats, PillarStat, Post } from '@/lib/types'
import { useToast } from '@/hooks/useToast'
import { calcHealthScore, generateInsight, getPillarColor, formatRelativeTime, getStatusLabel, cn } from '@/lib/utils'
import { TrendingUp, AlertCircle, BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'week' | '30days' | 'all'>('week')
  const [stats, setStats] = useState<Stats | null>(null)
  const [pillarStats, setPillarStats] = useState<PillarStat[]>([])
  const [recentPosts, setRecentPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    setIsLoading(true)
    try {
      const [statsData, pillars, history] = await Promise.all([
        api.getStats(),
        api.getPillarStats(),
        api.getPosts('history', 10),
      ])
      setStats(statsData)
      setPillarStats(pillars)
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
        <div className="text-center py-12 text-gray-500">Loading analytics...</div>
      </div>
    )
  }

  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0
  const healthScore = calcHealthScore(stats, approvalRate)
  const insight = generateInsight(stats, approvalRate)

  const getHealthLabel = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-green-600' }
    if (score >= 70) return { label: 'Good', color: 'text-blue-600' }
    if (score >= 50) return { label: 'Needs Attention', color: 'text-orange-600' }
    return { label: 'Critical', color: 'text-red-600' }
  }

  const healthLabel = getHealthLabel(healthScore)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>

        {/* Period Selector */}
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
          {[
            { value: 'week', label: 'This Week' },
            { value: '30days', label: '30 Days' },
            { value: 'all', label: 'All Time' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value as any)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                period === option.value
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Health Banner */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold mb-1">{healthScore}</h2>
            <p className="text-sm opacity-80">Health Score</p>
          </div>
          <div className={cn('text-right', healthLabel.color.replace('text-', 'text-'))}>
            <div className="text-xl font-semibold">{healthLabel.label}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-1000 ease-out"
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Generated</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Approved</div>
          <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Published</div>
          <div className="text-3xl font-bold text-blue-600">{stats.published}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Rejected</div>
          <div className="text-3xl font-bold text-red-600">{stats.rejected}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Approval Rate</div>
          <div className="text-3xl font-bold text-purple-600">{approvalRate}%</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Pending</div>
          <div className="text-3xl font-bold text-orange-600">{stats.pending}</div>
        </div>
      </div>

      {/* Insight Box */}
      <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-900">{insight}</p>
      </div>

      {/* Daily Activity Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-lg">Daily Activity (Last 7 Days)</h2>
        </div>

        {/* Simple Bar Chart */}
        <div className="space-y-4">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
            // Mock data - in real app would come from API
            const generated = Math.floor(Math.random() * 5)
            const published = Math.floor(Math.random() * 3)
            const rejected = Math.floor(Math.random() * 2)
            const maxValue = 5

            return (
              <div key={day}>
                <div className="text-xs text-gray-500 mb-1">{day}</div>
                <div className="flex items-center gap-1 h-8">
                  {generated > 0 && (
                    <div
                      className="bg-blue-500 rounded h-full flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${(generated / maxValue) * 100}%`, minWidth: '24px' }}
                    >
                      {generated}
                    </div>
                  )}
                  {published > 0 && (
                    <div
                      className="bg-green-500 rounded h-full flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${(published / maxValue) * 100}%`, minWidth: '24px' }}
                    >
                      {published}
                    </div>
                  )}
                  {rejected > 0 && (
                    <div
                      className="bg-red-500 rounded h-full flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${(rejected / maxValue) * 100}%`, minWidth: '24px' }}
                    >
                      {rejected}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span className="text-gray-600">Generated</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 bg-green-500 rounded" />
            <span className="text-gray-600">Published</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-gray-600">Rejected</span>
          </div>
        </div>
      </div>

      {/* Pillar Performance */}
      {pillarStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
                    <span className="text-sm font-semibold text-gray-900">
                      {pillar.approval_rate_pct}% approval
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{pillar.total} total</span>
                    <span>•</span>
                    <span className="text-green-600">{pillar.approved} approved</span>
                    <span>•</span>
                    <span className="text-red-600">{pillar.rejected} rejected</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
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
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
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
                Rejected: 'bg-red-100 text-red-700 border-red-200',
                Pending: 'bg-orange-100 text-orange-700 border-orange-200',
              }

              return (
                <div key={post.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', pillarColor)}>
                        {post.topic_pillar}
                      </span>
                      <span className={cn('px-2 py-0.5 text-xs font-semibold rounded-full border', statusColors[statusLabel])}>
                        {statusLabel}
                      </span>
                    </div>
                    <p className="font-serif text-sm font-bold text-gray-900 line-clamp-2 mb-1">
                      {hook}
                    </p>
                    <p className="text-xs text-gray-500">{formatRelativeTime(post.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
