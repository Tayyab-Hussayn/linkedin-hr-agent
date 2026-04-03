'use client'

import { StatCard } from './StatCard'
import { Clock, CheckCircle, Globe } from 'lucide-react'

interface StatStripProps {
  pending: number
  approved: number
  published: number
}

export function StatStrip({ pending, approved, published }: StatStripProps) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <StatCard label="Pending" value={pending} color="orange" icon={<Clock className="w-4 h-4" />} />
      <StatCard label="Approved" value={approved} color="green" icon={<CheckCircle className="w-4 h-4" />} />
      <StatCard label="Published" value={published} color="blue" icon={<Globe className="w-4 h-4" />} />
    </div>
  )
}
