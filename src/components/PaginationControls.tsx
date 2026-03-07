'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationControlsProps {
  currentPage: number
  pageSize: number
  totalItems: number
  currentCount?: number
  isLoading?: boolean
  onPageChange: (page: number) => void
}

export default function PaginationControls({
  currentPage,
  pageSize,
  totalItems,
  currentCount,
  isLoading = false,
  onPageChange
}: PaginationControlsProps) {
  if (totalItems <= pageSize) return null

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const pageStart = currentPage * pageSize + 1
  const pageEnd = Math.min((currentPage + 1) * pageSize, totalItems)
  const canGoPrevious = currentPage > 0 && !isLoading
  const canGoNext = currentPage < totalPages - 1 && !isLoading

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1 text-sm text-gray-600">
        <p>
          صفحة {currentPage + 1} من {totalPages}
        </p>
        <p>
          عرض {pageStart}-{pageEnd} من أصل {totalItems} سجل
        </p>
        {typeof currentCount === 'number' && currentCount !== (pageEnd - pageStart + 1) && (
          <p>النتائج الظاهرة بعد الفلاتر في هذه الصفحة: {currentCount}</p>
        )}
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
          السابق
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          التالي
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
