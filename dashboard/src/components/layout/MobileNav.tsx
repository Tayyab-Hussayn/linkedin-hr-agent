'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, CalendarClock, Sparkles, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppContext } from '@/context/AppContext'

interface MobileNavProps {
  pendingCount?: number
}

export function MobileNav({ pendingCount = 0 }: MobileNavProps) {
  const pathname = usePathname()
  const { scheduledPulse, scheduledCount } = useAppContext()

  const navItems = [
    { href: '/queue', label: 'Queue', icon: Clock, badge: pendingCount },
    { href: '/scheduled', label: 'Scheduled', icon: CalendarClock, badge: scheduledCount, isPulsing: scheduledPulse },
    { href: '/content', label: 'Content', icon: Sparkles },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-stroke z-50">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 flex-1 relative',
                isActive ? 'text-accent' : 'text-muted',
                item.isPulsing && 'scheduled-pulse'
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-bg text-[10px] font-bold rounded-full flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                {/* Pulse notification dot */}
                {item.isPulsing && (
                  <span className="pulse-dot absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full" />
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
              {/* Nav glow background */}
              {item.isPulsing && <span className="nav-glow absolute inset-0 rounded-lg -z-10" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
