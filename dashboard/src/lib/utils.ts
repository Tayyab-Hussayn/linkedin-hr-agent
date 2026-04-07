import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Post, Stats } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format relative time
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

// Format date
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Get next generation time (8am or 6pm)
export function getNextGenerationTime(): { hours: number; minutes: number } {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  let targetHour: number
  if (currentHour < 8) {
    targetHour = 8
  } else if (currentHour < 18) {
    targetHour = 18
  } else {
    targetHour = 8 + 24 // Next day 8am
  }

  const target = new Date(now)
  target.setHours(targetHour % 24, 0, 0, 0)
  if (targetHour >= 24) {
    target.setDate(target.getDate() + 1)
  }

  const diffMs = target.getTime() - now.getTime()
  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)

  return { hours, minutes }
}

// Calculate health score
export function calcHealthScore(stats: Stats, approvalRate: number): number {
  let score = 0

  // +25 if generated >= 3
  if (stats.total >= 3) score += 25

  // +25 if approval rate >= 70%
  if (approvalRate >= 70) score += 25

  // +25 if published >= 1
  if (stats.published >= 1) score += 25

  // +25 if no failed posts (assuming failed is tracked separately)
  score += 25 // Default since we don't track failed in Stats interface

  return score
}

// Generate insight based on stats
export function generateInsight(stats: Stats, approvalRate: number): string {
  if (approvalRate >= 80) {
    return "Excellent! Your content is consistently hitting the mark. Keep up the great work!"
  } else if (approvalRate >= 60) {
    return "Good progress! Consider reviewing rejected posts to identify patterns for improvement."
  } else if (approvalRate >= 40) {
    return "Your approval rate could use some attention. Review your content strategy and tone settings."
  } else {
    return "Critical: Most posts are being rejected. Consider adjusting your content pillars or generation settings."
  }
}

// Get pillar color
export function getPillarColor(index: number): string {
  const colors = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-orange-100 text-orange-700 border-orange-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
  ]
  return colors[index % colors.length]
}

// Truncate text safely
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

// Get status color
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-orange-500',
    approved: 'bg-green-500',
    published: 'bg-blue-500',
    rejected: 'bg-red-500',
    draft: 'bg-gray-400',
    publishing: 'bg-blue-400',
    failed: 'bg-red-600',
    skipped: 'bg-gray-500',
  }
  return colors[status] || 'bg-gray-400'
}

// Get status label
export function getStatusLabel(post: Post): string {
  if (post.post_status === 'published') return 'Published'
  if (post.approval_status === 'approved') return 'Approved'
  if (post.approval_status === 'rejected') return 'Rejected'
  return 'Pending'
}
