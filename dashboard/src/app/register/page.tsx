'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (auth.isLoggedIn()) router.replace('/queue')
  }, [router])

  const handleRegister = async () => {
    setError('')
    if (!name || !email || !password) {
      setError('All fields are required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res = await api.register({
        name, email, password, niche: 'hr_professional'
      })
      if (res.status === 'ok') {
        auth.setToken(res.token, {
          name: res.name,
          client_id: res.client_id,
          role: res.role
        })
        // Fetch full profile
        try {
          const me = await api.getMe()
          if (me.status === 'ok') {
            // Update stored user with full profile
            auth.setToken(res.token, {
              name: res.name,
              client_id: res.client_id,
              role: res.role,
              job_title: me.user?.job_title || '',
              niche: me.user?.niche || ''
            })
          }
        } catch (e) {
          console.error('Failed to fetch profile:', e)
        }
        // Go to onboarding — new user needs to set up profile
        window.location.href = '/onboarding'
      } else {
        setError(res.message || 'Registration failed')
      }
    } catch {
      setError('Connection failed. Check your API server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display italic text-3xl accent-gradient-text font-semibold mb-2">
            Qalam
          </h1>
          <p className="text-muted text-sm mt-1">Start automating your LinkedIn presence</p>
        </div>

        <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Alex Jenki.."
              className="w-full px-4 py-2.5 bg-surface-2 border border-stroke text-text-primary placeholder:text-muted rounded-lg text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-2.5 bg-surface-2 border border-stroke text-text-primary placeholder:text-muted rounded-lg text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              placeholder="Min 8 characters"
              className="w-full px-4 py-2.5 bg-surface-2 border border-stroke text-text-primary placeholder:text-muted rounded-lg text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full accent-gradient text-bg py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </div>

        <p className="text-center text-sm text-muted mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-accent font-medium hover:text-accent-light">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
