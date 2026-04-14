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
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-[220px] bg-surface border-r border-stroke z-40">
      {/* Logo — top */}
      <div className="px-5 py-5 border-b border-stroke/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg accent-gradient flex items-center justify-center">
            <span className="text-bg text-xs font-bold">Q</span>
          </div>
          <span className="font-display italic text-xl accent-gradient-text font-semibold">
            Qalam
          </span>
        </div>
      </div>

      {/* Navigation — takes all remaining space */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
        <p className="text-xs text-muted/50 uppercase tracking-widest pl-5 mb-2 text-left">
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 w-full pl-5 pr-3 py-2.5 text-sm font-medium transition-all duration-150 relative justify-start',
                isActive
                  ? 'bg-accent/10 text-accent border-l-2 border-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-text-primary border-l-2 border-transparent',
                item.isPulsing && 'scheduled-pulse'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto flex items-center justify-center bg-accent text-bg text-xs font-bold min-w-[20px] h-5 px-1.5 rounded-full leading-none">
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

      {/* User profile — always at bottom */}
      <div className="flex-shrink-0 py-4 border-t border-stroke/50 space-y-1">
        {mounted && user && (
          <div className="pl-5 pr-3 py-2 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent text-xs font-bold">{user.name?.charAt(0)?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-xs text-muted">{typeof window !== 'undefined' ? localStorage.getItem('plan_name') || 'Free' : 'Free'} Plan</p>
            </div>
          </div>
        )}
        <button
          onClick={() => auth.logout()}
          className="w-full flex items-center justify-start gap-2 pl-5 pr-3 py-2 text-sm text-muted hover:text-red-300 hover:bg-red-500/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
