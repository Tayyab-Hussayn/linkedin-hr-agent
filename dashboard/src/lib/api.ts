import { Post, Stats, PillarStat, DailyActivity } from './types'
import { reportError } from './errorReporter'

function getN8nUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('n8n_url')
    if (stored && stored.trim() !== '') return stored.trim()
  }
  return process.env.NEXT_PUBLIC_N8N_URL || 'http://localhost:5678'
}

export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('api_url')
    if (stored && stored.trim() !== '') {
      return stored.trim()
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.byqalam.com'
}

function getHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('postflow_token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }
  return headers
}

function getCurrentClientId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('postflow_user')
  if (!raw) return null
  try {
    const user = JSON.parse(raw)
    return user.client_id || null
  } catch {
    return null
  }
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, options)
    if (res.status === 401) {
      localStorage.removeItem('postflow_token')
      localStorage.removeItem('postflow_user')
      window.location.href = '/login'
      throw new Error('Session expired')
    }
    return res
  } catch (error) {
    reportError('API fetch failed', {
      url,
      error: String(error)
    })
    throw error
  }
}

export const api = {
  // Get posts by status
  getPosts: async (status: string, limit = 20): Promise<Post[]> => {
    try {
      const res = await apiFetch(
        `${getApiUrl()}/api/posts?status=${status}&limit=${limit}`,
        { cache: 'no-store', headers: getHeaders() }
      )

      if (!res.ok) return []

      const text = await res.text()

      // Handle empty response
      if (!text || text.trim() === '') return []

      let data
      try {
        data = JSON.parse(text)
      } catch {
        return []
      }

      // Handle Flask response format: { status: 'ok', posts: [...], count: N }
      // Also handle legacy array format for backwards compatibility
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.posts)) return data.posts
      if (data && Array.isArray(data.data)) return data.data

      return []

    } catch(error) {
      console.error('Error fetching posts:', error)
      return []
    }
  },

  // Get scheduled posts (approved, not yet published, with future scheduled_for)
  getScheduledPosts: async (): Promise<Post[]> => {
    try {
      // Use history endpoint and filter for scheduled posts
      const allPosts = await api.getPosts('history', 100)
      // Show all scheduled posts that are approved, draft, and have scheduled_for
      return allPosts.filter(p =>
        p.approval_status === 'approved' &&
        p.post_status === 'draft' &&
        p.scheduled_for != null
      ).sort((a, b) => {
        // Sort by scheduled_for ascending (earliest first)
        const dateA = new Date(a.scheduled_for!).getTime()
        const dateB = new Date(b.scheduled_for!).getTime()
        return dateA - dateB
      })
    } catch(e) {
      console.error('Error fetching scheduled posts:', e)
      return []
    }
  },

  // Get stats
  getStats: async (): Promise<Stats> => {
    const defaultStats: Stats = {
      type: 'stats',
      pending: 0,
      approved: 0,
      published: 0,
      rejected: 0,
      total: 0,
      generated_today: 0,
      daily_post_limit: 3,
      plan_name: 'Starter',
      can_schedule: true,
      can_analytics: true,
      can_generate_now: true,
      ai_model: 'deepseek-v3.2',
      monthly_post_limit: 90
    }

    try {
      const res = await apiFetch(
        `${getApiUrl()}/api/stats`,
        { cache: 'no-store', headers: getHeaders() }
      )

      if (!res.ok) return defaultStats

      const text = await res.text()
      if (!text || text.trim() === '') return defaultStats

      try {
        const data = JSON.parse(text)
        return { ...defaultStats, ...data }
      } catch {
        return defaultStats
      }

    } catch(error) {
      console.error('Error fetching stats:', error)
      return defaultStats
    }
  },

  // Get pillar stats
  getPillarStats: async (): Promise<PillarStat[]> => {
    try {
      const res = await apiFetch(
        `${getN8nUrl()}/webhook/get-posts?status=pillar_stats`,
        { cache: 'no-store', headers: getHeaders() }
      )
      if (!res.ok) return []
      const text = await res.text()
      if (!text || text.trim() === '') return []
      try {
        const data = JSON.parse(text)
        return Array.isArray(data) ? data : []
      } catch {
        return []
      }
    } catch(error) {
      console.error('Error fetching pillar stats:', error)
      return []
    }
  },

  // Get daily activity
  getDailyActivity: async (days = 7): Promise<DailyActivity[]> => {
    try {
      const res = await apiFetch(
        `${getN8nUrl()}/webhook/get-posts?status=daily_activity&days=${days}`,
        { cache: 'no-store', headers: getHeaders() }
      )
      if (!res.ok) return []
      const text = await res.text()
      if (!text || text.trim() === '') return []
      try {
        const data = JSON.parse(text)
        return Array.isArray(data) ? data : []
      } catch {
        return []
      }
    } catch(error) {
      console.error('Error fetching daily activity:', error)
      return []
    }
  },

  // Approve or reject a post
  submitDecision: async (
    postId: string,
    decision: 'approved' | 'rejected',
    content?: string,
    scheduledFor?: string | null
  ) => {
    try {
      const res = await apiFetch(`${getApiUrl()}/api/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          post_id: postId,
          decision,
          content: content || undefined,
          scheduled_for: scheduledFor || undefined,
          approval_note: decision === 'rejected' ? 'Rejected by user' : undefined
        })
      })
      if (!res.ok) throw new Error('Failed to submit decision')
      const text = await res.text()
      if (!text || text.trim() === '') return { status: 'ok' }
      try {
        const data = JSON.parse(text)
        // Flask returns { status: 'ok', decision: '...', scheduled_for: '...' }
        if (data.status === 'ok') return data
        throw new Error(data.message || 'Unknown error')
      } catch {
        return { status: 'ok' }
      }
    } catch (error) {
      console.error('Error submitting decision:', error)
      throw error
    }
  },

  // Trigger content generation
  generateNow: async (clientId?: string) => {
    const cid = clientId || getCurrentClientId()
    if (!cid) return { status: 'error', message: 'Not authenticated' }
    try {
      const res = await apiFetch(`${getApiUrl()}/api/generate-now`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ client_id: cid })
      })
      if (!res.ok) throw new Error('Failed to generate content')
      const text = await res.text()
      if (!text || text.trim() === '') return {}
      try {
        return JSON.parse(text)
      } catch {
        return {}
      }
    } catch (error) {
      console.error('Error generating content:', error)
      throw error
    }
  },

  // Schedule a post
  async schedulePost(postId: string, scheduledFor: string) {
    const res = await apiFetch(`${getApiUrl()}/api/approve`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        post_id: postId,
        decision: 'approved',
        scheduled_for: scheduledFor
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Failed to schedule post')
    }
    return res.json()
  },

  // Reset daily limit
  resetDailyLimit: async (clientId?: string): Promise<void> => {
    const cid = clientId || getCurrentClientId()
    if (!cid) return
    try {
      await apiFetch(`${getN8nUrl()}/webhook/reset-daily-limit`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ client_id: cid })
      })
    } catch(e) {
      console.error('Reset limit failed:', e)
    }
  },

  // Test connection
  testConnection: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${getApiUrl()}/api/stats`, {
        method: 'GET',
        headers: getHeaders()
      })
      return res.ok
    } catch (error) {
      console.error('Connection test failed:', error)
      return false
    }
  },

  // Update client settings in DB
  updateClientSettings: async (
    clientId?: string,
    settings: { daily_post_limit?: number; publishing_slots?: string[]; auto_gen_enabled?: boolean } = {}
  ) => {
    const cid = clientId || getCurrentClientId()
    if (!cid) return { status: 'error', message: 'Not authenticated' }
    try {
      const payload: Record<string, unknown> = { client_id: cid }
      if (settings.daily_post_limit !== undefined) payload.daily_post_limit = settings.daily_post_limit
      if (settings.publishing_slots !== undefined) payload.publishing_slots = settings.publishing_slots
      if (settings.auto_gen_enabled !== undefined) payload.auto_gen_enabled = settings.auto_gen_enabled
      const res = await apiFetch(`${getApiUrl()}/api/settings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      })
      const text = await res.text()
      if (!text || text.trim() === '') return { status: 'ok' }
      try {
        const data = JSON.parse(text)
        return data
      } catch {
        return { status: 'ok' }
      }
    } catch(e) {
      console.error('Update settings failed:', e)
      return { status: 'error' }
    }
  },

  // Publish now (update scheduled_for to NOW())
  async publishNow(postId: string) {
    const res = await apiFetch(`${getApiUrl()}/api/publish-now`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ post_id: postId })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Failed to publish')
    }
    return res.json()
  },

  // Auth endpoints
  async login(email: string, password: string) {
    try {
      const res = await fetch(`${getApiUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: 'error', message: err.message || 'Login failed' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed. Check your API server.' }
    }
  },

  async register(data: { name: string, email: string, password: string, niche?: string }) {
    try {
      const res = await fetch(`${getApiUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: 'error', message: err.message || 'Registration failed' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed. Check your API server.' }
    }
  },

  async getMe() {
    try {
      const res = await apiFetch(`${getApiUrl()}/auth/me`, {
        headers: getHeaders()
      })
      if (!res.ok) {
        return { status: 'error', message: 'Failed to fetch profile' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed' }
    }
  },

  async updateProfile(data: Record<string, unknown>) {
    try {
      const clientId = getCurrentClientId()
      if (!clientId) return { status: 'error', message: 'Not authenticated' }
      const res = await apiFetch(`${getApiUrl()}/api/client-profile/${clientId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: 'error', message: err.message || 'Failed to update profile' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed' }
    }
  },

  async getNiches() {
    try {
      const res = await apiFetch(`${getApiUrl()}/api/niches`, {
        headers: getHeaders()
      })
      if (!res.ok) {
        return { status: 'error', message: 'Failed to fetch niches' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed' }
    }
  },

  async getClientProfile(clientId: string) {
    try {
      const res = await apiFetch(
        `${getApiUrl()}/api/client-profile/${clientId}`,
        { headers: getHeaders() }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: 'error', message: err.message || 'Failed to fetch profile' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed' }
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    try {
      const res = await apiFetch(`${getApiUrl()}/auth/change-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: 'error', message: err.message || 'Failed to change password' }
      }
      return res.json()
    } catch {
      return { status: 'error', message: 'Connection failed' }
    }
  }
}
