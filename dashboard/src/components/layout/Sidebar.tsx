'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, CalendarClock, Sparkles, BarChart3, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppContext } from '@/context/AppContext'
import { auth } from '@/lib/auth'

interface SidebarProps {
  pendingCount?: number
  publishedCount?: number
}

export function Sidebar({ pendingCount = 0, publishedCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { scheduledPulse, scheduledCount } = useAppContext()
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<{ name: string, client_id: string, role: string, job_title?: string, niche?: string } | null>(null)

  useEffect(() => {
    setMounted(true)
    setUser(auth.getUser())
  }, [])

  const navItems = [
    { href: '/queue', label: 'Queue', icon: Clock, badge: pendingCount },
    { href: '/scheduled', label: 'Scheduled', icon: CalendarClock, badge: scheduledCount, isPulsing: scheduledPulse },
    { href: '/content', label: 'Content', icon: Sparkles },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[220px] bg-surface border-r border-stroke flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-stroke">
        <span className="font-display italic text-xl accent-gradient-text font-semibold">
          Qalam
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative',
                isActive
                  ? 'bg-surface-2 text-accent border-l-2 border-accent pl-[10px]'
                  : 'text-muted hover:bg-surface-2 hover:text-text-primary',
                item.isPulsing && 'scheduled-pulse'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-accent text-bg text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
              {/* Pulse notification dot */}
              {item.isPulsing && (
                <span className="pulse-dot absolute top-2 right-2 w-2 h-2 bg-accent rounded-full" />
              )}
              {/* Nav glow background */}
              {item.isPulsing && <span className="nav-glow absolute inset-0 rounded-lg -z-10" />}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-stroke space-y-2">
        {mounted && user && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
            <p className="text-xs text-muted">Free Plan</p>
          </div>
        )}
        <button
          onClick={() => auth.logout()}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-red-300 hover:bg-red-500/5 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
