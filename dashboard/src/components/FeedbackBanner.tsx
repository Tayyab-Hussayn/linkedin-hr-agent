'use client'
import { useState, useEffect } from 'react'
import { auth } from '@/lib/auth'
import { APP_VERSION } from '@/lib/version'
const FEEDBACK_INTERVAL_DAYS = 60
const FIRST_SHOW_AFTER_DAYS = 30

export default function FeedbackBanner() {
  const [visible, setVisible] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!auth.isLoggedIn()) return

    // Track install date
    if (!localStorage.getItem('qalam_install_date')) {
      localStorage.setItem('qalam_install_date', Date.now().toString())
      return
    }

    const installDate = parseInt(
      localStorage.getItem('qalam_install_date') || '0'
    )
    const lastShown = parseInt(
      localStorage.getItem('qalam_feedback_shown') || '0'
    )
    const now = Date.now()
    const daysSinceInstall = (now - installDate) / (1000 * 60 * 60 * 24)
    const daysSinceLastShown = (now - lastShown) / (1000 * 60 * 60 * 24)

    const shouldShow =
      daysSinceInstall >= FIRST_SHOW_AFTER_DAYS &&
      (lastShown === 0 || daysSinceLastShown >= FEEDBACK_INTERVAL_DAYS)

    if (shouldShow) {
      setTimeout(() => setVisible(true), 3000)
    }
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('qalam_feedback_shown', Date.now().toString())
    setVisible(false)
  }

  const handleSubmit = async () => {
    if (!rating && !message.trim()) return
    setSubmitting(true)

    try {
      const apiUrl =
        localStorage.getItem('api_url') ||
        process.env.NEXT_PUBLIC_API_URL ||
        'https://api.byqalam.com'
      const token = localStorage.getItem('postflow_token')

      await fetch(`${apiUrl}/api/feedback/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          rating,
          message,
          app_version: APP_VERSION
        })
      })

      setSubmitted(true)
      localStorage.setItem('qalam_feedback_shown', Date.now().toString())
      setTimeout(() => setVisible(false), 2000)
    } catch {
      setVisible(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-surface border border-stroke rounded-2xl shadow-glow p-4 animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            How's Qalam working for you?
          </p>
          <p className="text-xs text-muted mt-0.5">
            Takes 10 seconds — helps us improve
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted hover:text-text-primary text-lg leading-none ml-2 flex-shrink-0"
        >
          ×
        </button>
      </div>

      {submitted ? (
        <div className="text-center py-2">
          <p className="text-accent text-sm font-medium">
            ✨ Thank you for your feedback!
          </p>
        </div>
      ) : (
        <>
          {/* Star rating */}
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`text-2xl transition-transform hover:scale-110 ${
                  rating && star <= rating
                    ? 'text-accent'
                    : 'text-stroke hover:text-accent/50'
                }`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Optional message */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Any suggestions? (optional)"
            rows={2}
            className="w-full bg-surface-2 border border-stroke rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-muted resize-none focus:outline-none focus:border-accent mb-3"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 text-xs text-muted hover:text-text-primary transition-colors"
            >
              Maybe later
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!rating && !message.trim())}
              className="flex-1 py-2 accent-gradient text-bg text-xs font-medium rounded-lg disabled:opacity-40"
            >
              {submitting ? 'Sending...' : 'Send feedback'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
