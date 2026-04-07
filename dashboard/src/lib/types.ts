export interface Post {
  id: string
  client_id: string
  client_name: string
  content: string
  topic_pillar: string
  post_format: string
  approval_status: 'pending' | 'approved' | 'rejected'
  post_status: 'draft' | 'publishing' | 'published' | 'failed' | 'skipped'
  approval_note: string | null
  estimated_words: number
  created_at: string
  approved_at: string | null
  published_at: string | null
  scheduled_for: string | null
}

export interface Stats {
  type: string
  pending: number
  approved: number
  published: number
  rejected: number
  total: number
  generated_today: number
  daily_post_limit: number
  plan_name: string
  can_schedule: boolean
  can_analytics: boolean
  can_generate_now: boolean
  ai_model: string
  monthly_post_limit: number
}

export interface PillarStat {
  topic_pillar: string
  total: number
  approved: number
  rejected: number
  published: number
  approval_rate_pct: number
}

export interface DailyActivity {
  day: string
  generated: number
  published: number
  rejected: number
}

export interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'warning'
}
