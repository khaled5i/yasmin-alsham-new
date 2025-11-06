'use client'

import { XCircle } from 'lucide-react'

interface StockIndicatorProps {
  stockQuantity?: number
  isAvailable?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function StockIndicator({
  stockQuantity = 0,
  isAvailable = true,
  size = 'md'
}: StockIndicatorProps) {

  // عرض المؤشر فقط في حالة "غير متوفر"
  const isOutOfStock = !isAvailable || stockQuantity === 0

  // إذا كان المنتج متوفراً، لا نعرض أي مؤشر
  if (!isOutOfStock) {
    return null
  }

  // تحديد الأحجام
  const sizeClasses = {
    sm: {
      container: 'px-2 py-1 text-xs',
      icon: 'w-3 h-3',
      gap: 'gap-1'
    },
    md: {
      container: 'px-3 py-1.5 text-sm',
      icon: 'w-4 h-4',
      gap: 'gap-1.5'
    },
    lg: {
      container: 'px-4 py-2 text-base',
      icon: 'w-5 h-5',
      gap: 'gap-2'
    }
  }

  const currentSize = sizeClasses[size]

  return (
    <div
      className={`inline-flex items-center ${currentSize.gap} ${currentSize.container} bg-red-50 border-red-300 border-2 rounded-lg font-semibold text-red-700 transition-all duration-300`}
      role="status"
      aria-label="حالة التوفر: غير متوفر"
    >
      <XCircle className={currentSize.icon} aria-hidden="true" />
      <span>غير متوفر</span>
    </div>
  )
}

