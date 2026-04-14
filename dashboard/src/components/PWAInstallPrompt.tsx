'use client'
import { useEffect, useState } from 'react'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    // Don't show in Tauri desktop app
    if ('__TAURI__' in window) {
      setIsTauri(true)
      return
    }

    // Check if mobile device
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || window.innerWidth < 768
    setIsMobile(mobile)

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios)
    setIsStandalone(standalone)

    if (!standalone && !ios) {
      window.addEventListener('beforeinstallprompt', (e: any) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setShowBanner(true)
      })
    }

    // Show iOS instructions if on iOS and not installed
    if (ios && !standalone) {
      setShowBanner(true)
    }
  }, [])

  if (isTauri || isStandalone || !showBanner || !isMobile) return null

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setShowBanner(false)
    }
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4
                    md:w-80 bg-surface rounded-2xl shadow-xl border border-stroke
                    p-4 z-50 flex items-start gap-3">
      <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center
                      justify-center flex-shrink-0">
        <span className="text-white text-lg">⚡</span>
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm text-text-primary">Install Qalam</p>
        {isIOS ? (
          <p className="text-xs text-muted mt-0.5">
            Tap the Share button then &quot;Add to Home Screen&quot;
          </p>
        ) : (
          <p className="text-xs text-muted mt-0.5">
            Install for faster access and offline use
          </p>
        )}
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="mt-2 bg-blue-500 text-white text-xs font-semibold
                       px-3 py-1.5 rounded-lg"
          >
            Install App
          </button>
        )}
      </div>
      <button
        onClick={() => setShowBanner(false)}
        className="text-muted hover:text-text-primary text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
