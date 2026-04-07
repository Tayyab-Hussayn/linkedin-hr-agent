const TOKEN_KEY = 'postflow_token'
const USER_KEY = 'postflow_user'

export const auth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(TOKEN_KEY)
  },

  setToken(token: string, user: {
    name: string,
    client_id: string,
    role: string,
    job_title?: string,
    niche?: string
  }) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  getUser(): { name: string, client_id: string, role: string, job_title?: string, niche?: string } | null {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem('daily_post_limit')
    localStorage.removeItem('plan_name')
    localStorage.removeItem('api_url')
    localStorage.removeItem('publishing_slots')
    localStorage.removeItem('posts_per_page')
    window.location.href = '/login'
  },

  isLoggedIn(): boolean {
    return !!this.getToken()
  }
}
