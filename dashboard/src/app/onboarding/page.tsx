'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { auth } from '@/lib/auth'

const NICHE_ICONS: Record<string, string> = {
  hr_professional: '👥',
  digital_marketer: '📈',
  web_developer: '💻',
  ceo_founder: '🚀',
  consultant: '🎯',
  sales_professional: '💼',
  finance_professional: '💰',
  product_manager: '📋'
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [niches, setNiches] = useState<Record<string, any>>({})
  const [selectedNiche, setSelectedNiche] = useState('')
  const [pillars, setPillars] = useState<string[]>([])
  const [newPillar, setNewPillar] = useState('')
  const [tone, setTone] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [publishingSlot, setPublishingSlot] = useState('18:00')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.replace('/login')
      return
    }
    api.getNiches().then(res => {
      if (res.niches) setNiches(res.niches)
    })
  }, [router])

  const selectNiche = (nicheKey: string) => {
    setSelectedNiche(nicheKey)
    const niche = niches[nicheKey]
    if (niche) {
      setPillars(niche.default_pillars || [])
      setTone(niche.default_tone || '')
    }
  }

  const removePillar = (p: string) => setPillars(prev => prev.filter(x => x !== p))
  const addPillar = () => {
    if (newPillar.trim() && !pillars.includes(newPillar.trim())) {
      setPillars(prev => [...prev, newPillar.trim()])
      setNewPillar('')
    }
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.updateProfile({
        niche: selectedNiche,
        topic_pillars: pillars,
        tone,
        target_audience: targetAudience,
        publishing_slots: [publishingSlot]
      })
      router.replace('/queue')
    } catch {
      alert('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Step {step} of 4</span>
            <span className="text-sm text-gray-500">{Math.round((step/4)*100)}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full">
            <div
              className="h-1.5 bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(step/4)*100}%` }}
            />
          </div>
        </div>

        {/* Step 1 — Pick niche */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">What do you do?</h2>
            <p className="text-gray-500 text-sm mb-6">Pick the niche that best describes your work</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(niches).map(([key, val]: [string, any]) => (
                <button
                  key={key}
                  onClick={() => selectNiche(key)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedNiche === key
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-2">{NICHE_ICONS[key] || '💡'}</div>
                  <div className="text-sm font-medium text-gray-900">{val.label}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => selectedNiche && setStep(2)}
              disabled={!selectedNiche}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 — Topic pillars */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Your content pillars</h2>
            <p className="text-gray-500 text-sm mb-6">Topics you'll post about. Edit to match your focus.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {pillars.map(p => (
                <span key={p} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-3 py-1.5 rounded-full">
                  {p}
                  <button onClick={() => removePillar(p)} className="text-blue-500 hover:text-blue-800 ml-1">×</button>
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
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addPillar}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50">Back</button>
              <button
                onClick={() => pillars.length > 0 && setStep(3)}
                disabled={pillars.length === 0}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700"
              >Continue</button>
            </div>
          </div>
        )}

        {/* Step 3 — Tone */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Your voice & audience</h2>
            <p className="text-gray-500 text-sm mb-6">Helps the AI write in your style</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your tone</label>
                <input
                  type="text"
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  placeholder="e.g. Empathetic, data-driven, direct"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target audience</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  placeholder="e.g. HR managers, startup founders, developers"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50">Back</button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
              >Continue</button>
            </div>
          </div>
        )}

        {/* Step 4 — Publishing time */}
        {step === 4 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">When to publish?</h2>
            <p className="text-gray-500 text-sm mb-6">Posts will be scheduled at this time by default</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { time: '09:00', label: '9:00 AM', desc: 'Morning commute' },
                { time: '12:00', label: '12:00 PM', desc: 'Lunch break' },
                { time: '18:00', label: '6:00 PM', desc: 'After work' },
                { time: '21:00', label: '9:00 PM', desc: 'Evening' }
              ].map(({ time, label, desc }) => (
                <button
                  key={time}
                  onClick={() => setPublishingSlot(time)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    publishingSlot === time
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold text-gray-900 text-sm">{label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(3)} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50">Back</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700"
              >
                {saving ? 'Setting up...' : 'Start posting'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
