import { auth } from './auth'
import { APP_VERSION } from './version'

// Rate-limit: at most one error report per 30 seconds.
// Prevents cascade floods when the server is down/restarting.
let _lastReportTime = 0
const REPORT_COOLDOWN_MS = 30_000

export async function reportError(
  message: string,
  details: Record<string, unknown> = {}
) {
  if (!auth.isLoggedIn()) return
  const now = Date.now()
  if (now - _lastReportTime < REPORT_COOLDOWN_MS) return
  _lastReportTime = now
  try {
    const apiUrl =
      (typeof window !== 'undefined' && localStorage.getItem('api_url')) ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.byqalam.com'

    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('postflow_token')
        : null

    await fetch(`${apiUrl}/api/feedback/error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        message,
        details,
        app_version: APP_VERSION,
        os_info: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      })
    })
  } catch {
    // Never let error reporting break the app
  }
}
