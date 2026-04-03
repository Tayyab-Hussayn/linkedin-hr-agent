self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept API calls — let them go directly
  if (url.hostname === 'localhost' ||
      url.port === '5050' ||
      url.port === '5678' ||
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/webhook/') ||
      url.pathname.startsWith('/updater/')) {
    return // Don't intercept — browser handles normally
  }

  // For static assets and pages, use network-first strategy
  event.respondWith(fetch(event.request))
})
