'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { clampFabricQuantity, type FabricPurchaseMode, type FabricQuantityBounds } from '@/lib/fabric-commerce'
import { formatFabricNumber, roundFabricNumber } from '@/lib/fabric-number-format'

interface FabricQuantitySelectorProps {
  value: number
  bounds: FabricQuantityBounds
  mode: FabricPurchaseMode
  onChange: (quantity: number) => void
  /** اسم القماش — يدخل في تسمية الأزرار لقارئ الشاشة. */
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

/**
 * منتقي الكمية: يحترم الحد الأدنى والخطوة والمخزون.
 * الإدخال اليدوي يُثبَّت على الخطوة عند مغادرة الحقل لا أثناء الكتابة،
 * حتى لا تُصحَّح الأرقام تحت أصابع المستخدمة.
 */
export default function FabricQuantitySelector({
  value,
  bounds,
  mode,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: FabricQuantitySelectorProps) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(roundFabricNumber(value)))
  }, [value])

  const unitLabel = mode === 'piece' ? 'قطعة' : 'متر'
  const canDecrease = !disabled && roundFabricNumber(value - bounds.step) >= bounds.min
  const canIncrease = !disabled && roundFabricNumber(value + bounds.step) <= bounds.max

  const applyQuantity = (next: number) => {
    const clamped = clampFabricQuantity(next, bounds)
    if (clamped == null) return
    onChange(clamped)
  }

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.'))
    const clamped = Number.isFinite(parsed) ? clampFabricQuantity(parsed, bounds) : null

    // نُزامن الحقل صراحةً بالرقم المعتمد. لو اكتفينا بـonChange لبقي الحقل
    // يعرض ما كُتب حين يساوي الرقم المصحَّح القيمة الحالية (5 ثم كتابة 99
    // تُثبَّت على 5 فلا يتغيّر شيء في الأعلى ولا يُعاد تصيير الحقل).
    const resolved = clamped ?? roundFabricNumber(value)
    setDraft(String(resolved))

    if (clamped != null && clamped !== roundFabricNumber(value)) onChange(clamped)
  }

  const buttonSize = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  return (
    <div className="inline-flex flex-col gap-1.5">
      <div
        className="inline-flex items-center gap-1 rounded-xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-1"
        dir="ltr"
      >
        <button
          type="button"
          onClick={() => applyQuantity(roundFabricNumber(value - bounds.step))}
          disabled={!canDecrease}
          aria-label={`إنقاص كمية ${label}`}
          className={`inline-flex ${buttonSize} items-center justify-center rounded-lg text-[#6b1726] transition-colors duration-200 hover:bg-[#d8c5ae]/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]`}
        >
          <Minus className={iconSize} aria-hidden="true" />
        </button>

        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDraft()
            }
          }}
          disabled={disabled}
          aria-label={`كمية ${label} بالـ${unitLabel}`}
          className={`${size === 'sm' ? 'w-12 text-sm' : 'w-16 text-base'} bg-transparent text-center font-bold text-[#211b19] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#b99a68] disabled:opacity-50`}
        />

        <button
          type="button"
          onClick={() => applyQuantity(roundFabricNumber(value + bounds.step))}
          disabled={!canIncrease}
          aria-label={`زيادة كمية ${label}`}
          className={`inline-flex ${buttonSize} items-center justify-center rounded-lg text-[#6b1726] transition-colors duration-200 hover:bg-[#d8c5ae]/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]`}
        >
          <Plus className={iconSize} aria-hidden="true" />
        </button>
      </div>

      <p className="text-center text-[11px] leading-tight text-[#211b19]/60">
        {mode === 'piece'
          ? 'تُباع قطعة كاملة'
          : `بالمتر — الأدنى ${formatFabricNumber(bounds.min)} وخطوة ${formatFabricNumber(bounds.step)}`}
      </p>
    </div>
  )
}
