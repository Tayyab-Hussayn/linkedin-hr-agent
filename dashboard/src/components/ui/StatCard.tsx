'use client'

interface StatCardProps {
  label: string
  value: number
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple'
  icon?: React.ReactNode
}

export function StatCard({ label, value, color, icon }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }

  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{label}</span>
        {icon && <div className="opacity-60">{icon}</div>}
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  )
}
