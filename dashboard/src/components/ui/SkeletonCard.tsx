'use client'

export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl border border-stroke shadow-sm p-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="h-6 w-24 bg-surface-2 rounded-full" />
        <div className="w-2 h-2 bg-surface-2 rounded-full" />
      </div>

      {/* Hook */}
      <div className="space-y-2 mb-4">
        <div className="h-6 bg-surface-2 rounded w-3/4" />
        <div className="h-6 bg-surface-2 rounded w-1/2" />
      </div>

      {/* Body */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-surface-2 rounded w-full" />
        <div className="h-4 bg-surface-2 rounded w-full" />
        <div className="h-4 bg-surface-2 rounded w-2/3" />
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-16 bg-surface-2 rounded" />
        <div className="h-3 w-16 bg-surface-2 rounded" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-10 bg-surface-2 rounded-xl" />
        <div className="h-10 w-10 bg-surface-2 rounded-xl" />
        <div className="flex-1 h-10 bg-surface-2 rounded-xl" />
      </div>
    </div>
  )
}
