'use client'

import { useEffect, useRef, useState } from 'react'
import { UserCheck, UserPlus, X } from 'lucide-react'
import { ORDER_TAKERS, ORDER_TAKER_MAX_LENGTH } from '@/lib/order-takers'

interface OrderTakenByModalProps {
  isOpen: boolean
  onCancel: () => void
  onConfirm: (takenBy: string) => void
}

const OTHER = '__other__'

/**
 * نافذة «مين أخذ الطلب؟» تظهر عند الضغط على حفظ الطلب.
 * اختيار اسم جاهز يحفظ مباشرة؛ «شخص آخر» يفتح حقل كتابة الاسم.
 */
export default function OrderTakenByModal({ isOpen, onCancel, onConfirm }: OrderTakenByModalProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [otherName, setOtherName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSelected(null)
      setOtherName('')
    }
  }, [isOpen])

  useEffect(() => {
    if (selected === OTHER) inputRef.current?.focus()
  }, [selected])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const trimmedOther = otherName.trim()

  const confirmOther = () => {
    if (trimmedOther) onConfirm(trimmedOther)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-taken-by-title"
        className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-auto"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="إغلاق"
          className="absolute top-3 left-3 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserCheck className="w-7 h-7 text-pink-500" />
          </div>
          <h3 id="order-taken-by-title" className="text-lg font-bold text-gray-900">
            مين أخذ الطلب؟
          </h3>
        </div>

        <div className="space-y-2.5">
          {ORDER_TAKERS.map(taker => (
            <button
              key={taker.value}
              type="button"
              onClick={() => onConfirm(taker.value)}
              className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl border-2 border-pink-100 bg-pink-50/50 hover:border-pink-300 hover:bg-pink-50 text-right transition-colors"
            >
              <span className="text-base font-semibold text-gray-900">{taker.value}</span>
              {taker.hint && (
                <span className="text-xs font-medium text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                  {taker.hint}
                </span>
              )}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSelected(OTHER)}
            aria-expanded={selected === OTHER}
            className={`w-full flex items-center gap-2 py-3 px-4 rounded-xl border-2 text-right transition-colors ${
              selected === OTHER
                ? 'border-purple-400 bg-purple-50'
                : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
            }`}
          >
            <UserPlus className="w-5 h-5 text-purple-500" />
            <span className="text-base font-semibold text-gray-900">شخص آخر</span>
          </button>

          {selected === OTHER && (
            <form
              onSubmit={e => { e.preventDefault(); confirmOther() }}
              className="pt-1 space-y-2.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={otherName}
                onChange={e => setOtherName(e.target.value)}
                maxLength={ORDER_TAKER_MAX_LENGTH}
                placeholder="اكتب اسم الشخص"
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-purple-400 focus:outline-none text-base"
              />
              <button
                type="submit"
                disabled={!trimmedOther}
                className="w-full bg-gradient-to-r from-pink-400 to-rose-400 hover:from-pink-500 hover:to-rose-500 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                حفظ الطلب
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
