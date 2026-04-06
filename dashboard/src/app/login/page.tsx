'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (auth.isLoggedIn()) router.replace('/queue')
  }, [router])

  const handleLogin = async () => {
    setError('')
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    setLoading(true)
    try {
      const res = await api.login(email, password)
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
        window.location.href = '/queue'
      } else {
        setError(res.message || 'Login failed')
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
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display italic text-3xl accent-gradient-text font-semibold mb-2">
            Qalam
          </h1>
          <p className="text-muted text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Form */}
        <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@company.com"
              className="w-full text-sm text-text-primary placeholder:text-muted bg-surface-2 border border-stroke rounded-lg focus:outline-none focus:border-accent"
              style={{ padding: '12px 16px', height: '44px' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
                className="w-full text-sm text-text-primary placeholder:text-muted bg-surface-2 border border-stroke rounded-lg focus:outline-none focus:border-accent"
                style={{ padding: '12px 16px', paddingRight: '44px', height: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full accent-gradient text-bg py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>

        <p className="text-center text-sm text-muted mt-6">
          Don't have an account?{' '}
          <a href="/register" className="text-accent font-medium hover:text-accent-light">
            Create one
          </a>
        </p>
      </div>
    </div>
  )
}
