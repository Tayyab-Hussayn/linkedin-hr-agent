'use client'

import { getNextGenerationTime } from '@/lib/utils'
import { Clock } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  showCountdown?: boolean
  action?: React.ReactNode
}

export function EmptyState({ title, description, showCountdown = false, action }: EmptyStateProps) {
  const { hours, minutes } = showCountdown ? getNextGenerationTime() : { hours: 0, minutes: 0 }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Clock className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-md">{description}</p>

      {showCountdown && (
        <div className="text-sm text-gray-600 mb-4">
          Next generation in <span className="font-semibold text-blue-600">{hours}h {minutes}m</span>
        </div>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
