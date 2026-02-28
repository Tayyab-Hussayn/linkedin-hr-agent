'use client'

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="h-6 w-24 bg-gray-200 rounded-full" />
        <div className="w-2 h-2 bg-gray-200 rounded-full" />
      </div>

      {/* Hook */}
      <div className="space-y-2 mb-4">
        <div className="h-6 bg-gray-200 rounded w-3/4" />
        <div className="h-6 bg-gray-200 rounded w-1/2" />
      </div>

      {/* Body */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-3 w-16 bg-gray-200 rounded" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-10 bg-gray-200 rounded-xl" />
        <div className="h-10 w-10 bg-gray-200 rounded-xl" />
        <div className="flex-1 h-10 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}
