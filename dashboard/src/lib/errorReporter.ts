const APP_VERSION = '1.2.0'

export async function reportError(
  message: string,
  details: Record<string, unknown> = {}
) {
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
