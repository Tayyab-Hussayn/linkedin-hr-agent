'use client'
import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' &&
        !('__TAURI__' in window) &&
        'serviceWorker' in navigator) {
      // Unregister old service workers to clear cache
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister())
      }).then(() => {
        // Register the new service worker
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => {})
          .catch((err) => console.error('SW registration failed:', err))
      })
    }
  }, [])
  return null
}
