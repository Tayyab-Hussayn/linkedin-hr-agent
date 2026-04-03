'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'
import { useRouter } from 'next/navigation'

type Tab = 'account' | 'content'

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Account fields
  const [name, setName] = useState('')
  const [linkedinEmail, setLinkedinEmail] = useState('')
  const [linkedinPassword, setLinkedinPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [apiUrl, setApiUrl] = useState('')

  // Content profile fields
  const [niche, setNiche] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [yearsExp, setYearsExp] = useState(5)
  const [tone, setTone] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [writingStyle, setWritingStyle] = useState('')
  const [uniqueAngle, setUniqueAngle] = useState('')
  const [pillars, setPillars] = useState<string[]>([])
  const [newPillar, setNewPillar] = useState('')
  const [availableNiches, setAvailableNiches] = useState<Record<string, any>>({})

  // Publishing
  const [publishingSlots, setPublishingSlots] = useState<string[]>(['18:00'])

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.replace('/login')
      return
    }
    loadProfile()
  }, [router])

  const loadProfile = async () => {
    setLoading(true)
    try {
      // Load API URL from localStorage
      if (typeof window !== 'undefined') {
        const storedApiUrl = localStorage.getItem('api_url') ||
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'
        setApiUrl(storedApiUrl)
      }

      const user = auth.getUser()
      const clientId = user?.client_id
      if (!clientId) return

      const [profileRes, nichesRes] = await Promise.all([
        api.getClientProfile(clientId),
        api.getNiches()
      ])

      if (profileRes.status === 'ok') {
        const p = profileRes.profile_summary
        setName(profileRes.name || '')
        setNiche(p.niche || '')
        setJobTitle(p.job_title || '')
        setCompanyName(p.company_name || '')
        setYearsExp(p.years_experience || 5)
        setPillars(p.topic_pillars || [])
      }

      if (nichesRes.niches) {
        setAvailableNiches(nichesRes.niches)
      }

    } catch(e) {
      console.error('Failed to load profile:', e)
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const saveAccountSettings = async () => {
    setSaving(true)
    try {
      // Save API URL to localStorage
      if (typeof window !== 'undefined' && apiUrl) {
        localStorage.setItem('api_url', apiUrl)
      }

      const updates: Record<string, any> = {}
      if (linkedinEmail) updates.linkedin_email = linkedinEmail
      if (linkedinPassword) updates.linkedin_password = linkedinPassword

      if (Object.keys(updates).length > 0) {
        await api.updateProfile(updates)
      }

      if (newPassword) {
        if (!currentPassword) {
          showMessage('error', 'Enter your current password')
          setSaving(false)
          return
        }
        const res = await api.changePassword(currentPassword, newPassword)
        if (res.status !== 'ok') {
          showMessage('error', res.message || 'Failed to change password')
          setSaving(false)
          return
        }
        setCurrentPassword('')
        setNewPassword('')
      }

      showMessage('success', 'Account settings saved successfully')
    } catch {
      showMessage('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const saveContentProfile = async () => {
    setSaving(true)
    try {
      await api.updateProfile({
        niche,
        job_title: jobTitle,
        company_name: companyName,
        years_experience: yearsExp,
        tone,
        target_audience: targetAudience,
        writing_style: writingStyle,
        unique_angle: uniqueAngle,
        topic_pillars: pillars,
        publishing_slots: publishingSlots
      })
      showMessage('success', 'Content profile saved — AI will use your updated settings next generation')
    } catch {
      showMessage('error', 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const removePillar = (p: string) => setPillars(prev => prev.filter(x => x !== p))
  const addPillar = () => {
    if (newPillar.trim() && !pillars.includes(newPillar.trim())) {
      setPillars(prev => [...prev, newPillar.trim()])
      setNewPillar('')
    }
  }

  const toggleSlot = (slot: string) => {
    setPublishingSlots(prev =>
      prev.includes(slot)
        ? prev.length > 1 ? prev.filter(s => s !== slot) : prev
        : [...prev, slot].sort()
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted text-sm">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Settings</h1>

      {/* Message */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-500/10 text-red-800 border border-red-500/20'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-2 p-1 rounded-xl mb-6">
        {(['account', 'content'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-muted hover:text-text-primary'
            }`}
          >
            {tab === 'account' ? 'Account' : 'Content Profile'}
          </button>
        ))}
      </div>

      {/* Account Tab */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">LinkedIn Credentials</h2>
            <p className="text-xs text-muted -mt-2">
              Used to publish posts on your behalf. Leave blank to keep existing.
            </p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                LinkedIn Email
              </label>
              <input
                type="email"
                value={linkedinEmail}
                onChange={e => setLinkedinEmail(e.target.value)}
                placeholder="your@linkedin-email.com"
                className="w-full px-4 py-2.5 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                LinkedIn Password
              </label>
              <input
                type="password"
                value={linkedinPassword}
                onChange={e => setLinkedinPassword(e.target.value)}
                placeholder="Enter new password to update"
                className="w-full px-4 py-2.5 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Change Password</h2>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-4 py-2.5 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">API Server</h2>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                API Server URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://localhost:5050"
                className="w-full px-4 py-2.5 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">
                URL of your PostFlow API server
              </p>
            </div>
            <button
              onClick={async () => {
                const ok = await api.testConnection()
                showMessage(ok ? 'success' : 'error',
                  ok ? 'Connection successful' : 'Connection failed')
              }}
              className="w-full py-2 border border-stroke rounded-lg text-sm font-medium text-text-primary hover:bg-bg"
            >
              Test Connection
            </button>
          </div>

          <button
            onClick={saveAccountSettings}
            disabled={saving}
            className="w-full py-3 accent-gradient text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Account Settings'}
          </button>
        </div>
      )}

      {/* Content Profile Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Your Niche</h2>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(availableNiches).map(([key, val]: [string, any]) => (
                <button
                  key={key}
                  onClick={() => {
                    setNiche(key)
                    if (!pillars.length) setPillars(val.default_pillars || [])
                  }}
                  className={`p-3 rounded-xl border-2 text-left text-sm transition-all ${
                    niche === key
                      ? 'border-blue-600 bg-accent/5 text-blue-900'
                      : 'border-stroke text-text-primary hover:border-stroke'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Professional Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. HR Director"
                  className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Company</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Years of Experience
              </label>
              <input
                type="number"
                value={yearsExp}
                onChange={e => setYearsExp(parseInt(e.target.value) || 1)}
                min="1"
                max="50"
                className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Topic Pillars</h2>
            <p className="text-xs text-muted -mt-2">Topics the AI rotates between when generating posts</p>
            <div className="flex flex-wrap gap-2">
              {pillars.map(p => (
                <span key={p} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-3 py-1.5 rounded-full">
                  {p}
                  <button onClick={() => removePillar(p)} className="text-accent hover:text-accent-light ml-1 font-bold">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPillar}
                onChange={e => setNewPillar(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPillar()}
                placeholder="Add a topic..."
                className="flex-1 px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={addPillar}
                className="px-4 py-2 accent-gradient text-white rounded-lg text-sm font-medium hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Voice & Style</h2>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Your Tone</label>
              <input
                type="text"
                value={tone}
                onChange={e => setTone(e.target.value)}
                placeholder="e.g. Empathetic, data-driven, direct"
                className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                placeholder="e.g. HR managers, startup founders"
                className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Writing Style</label>
              <input
                type="text"
                value={writingStyle}
                onChange={e => setWritingStyle(e.target.value)}
                placeholder="e.g. Story-driven with actionable insights"
                className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Unique Angle</label>
              <input
                type="text"
                value={uniqueAngle}
                onChange={e => setUniqueAngle(e.target.value)}
                placeholder="e.g. Bridges people strategy with business results"
                className="w-full px-3 py-2 border border-stroke rounded-lg text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-stroke p-6 space-y-4">
            <h2 className="font-semibold text-text-primary">Publishing Schedule</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { time: '09:00', label: '9:00 AM' },
                { time: '12:00', label: '12:00 PM' },
                { time: '18:00', label: '6:00 PM' },
                { time: '21:00', label: '9:00 PM' }
              ].map(({ time, label }) => (
                <button
                  key={time}
                  onClick={() => toggleSlot(time)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    publishingSlots.includes(time)
                      ? 'border-blue-600 bg-accent/5 text-blue-900'
                      : 'border-stroke text-text-primary hover:border-stroke'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={saveContentProfile}
            disabled={saving}
            className="w-full py-3 accent-gradient text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Content Profile'}
          </button>
        </div>
      )}
    </div>
  )
}
