'use client'

interface StatCardProps {
  label: string
  value: number
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple'
  icon?: React.ReactNode
}

export function StatCard({ label, value, color, icon }: StatCardProps) {
  const colors = {
    blue: 'bg-accent/10 text-accent border-accent/30',
    green: 'bg-green-500/10 text-green-500 border-green-500/30',
    orange: 'bg-accent/10 text-accent border-accent/30',
    red: 'bg-red-600/10 text-red-300 border-red-600/30',
    purple: 'bg-accent/10 text-accent border-accent/30',
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
