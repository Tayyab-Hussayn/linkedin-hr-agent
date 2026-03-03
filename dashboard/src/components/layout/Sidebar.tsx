'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, CalendarClock, Sparkles, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppContext } from '@/context/AppContext'

interface SidebarProps {
  pendingCount?: number
  publishedCount?: number
}

export function Sidebar({ pendingCount = 0, publishedCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { scheduledPulse, scheduledCount } = useAppContext()

  const navItems = [
    { href: '/queue', label: 'Queue', icon: Clock, badge: pendingCount },
    { href: '/scheduled', label: 'Scheduled', icon: CalendarClock, badge: scheduledCount, isPulsing: scheduledPulse },
    { href: '/content', label: 'Content', icon: Sparkles },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  ]

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-gray-200 flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-lg">PostFlow</span>
        </div>
      </div>

      {/* Client Info */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="text-sm font-medium text-gray-900">Moeez Ahmad</div>
        <div className="text-xs text-gray-500">HR Director</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100',
                item.isPulsing && 'scheduled-pulse'
              )}
            >
              <div className="flex items-center gap-3 relative">
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {/* Pulse notification dot */}
                {item.isPulsing && (
                  <span className="pulse-dot absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500 text-white rounded-full min-w-5 text-center">
                  {item.badge}
                </span>
              )}
              {/* Nav glow background */}
              {item.isPulsing && <span className="nav-glow absolute inset-0 rounded-lg -z-10" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Stats */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Pending</span>
          <span className="font-semibold text-orange-600">{pendingCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Published</span>
          <span className="font-semibold text-blue-600">{publishedCount}</span>
        </div>
      </div>

      {/* Settings */}
      <div className="p-3 border-t border-gray-200">
        <button className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
