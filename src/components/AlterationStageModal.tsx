'use client'

import { CalendarCheck2, ChevronLeft, ChevronRight, PackageCheck, Sparkles } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import type { Order } from '@/lib/services/order-service'
import type { AlterationType } from '@/lib/services/alteration-service'
import {
  ALTERATION_TYPE_META,
  BottomSheet,
  formatAlterationDate,
  getSecondProofDate,
} from '@/components/alterations/alteration-ui'

interface AlterationStageModalProps {
  isOpen: boolean
  order: Order
  onClose: () => void
  onSelect: (type: AlterationType) => void
}

export function getAvailableAlterationTypes(order: Order): AlterationType[] {
  const types: AlterationType[] = []
  if (Boolean(order.proof_delivery_date)) types.push('first_proof')
  if (order.has_second_proof === true) types.push('second_proof')
  types.push('after_delivery')
  return types
}

export default function AlterationStageModal({
  isOpen,
  order,
  onClose,
  onSelect,
}: AlterationStageModalProps) {
  const { isArabic } = useTranslation()
  const tr = (ar: string, en: string) => (isArabic ? ar : en)
  const Chevron = isArabic ? ChevronLeft : ChevronRight

  const options = [
    {
      value: 'first_proof' as const,
      icon: CalendarCheck2,
      dateLabel: tr('موعد البروفة الأولى', 'First proof date'),
      date: order.proof_delivery_date || '',
    },
    {
      value: 'second_proof' as const,
      icon: Sparkles,
      dateLabel: tr('موعد البروفة الثانية', 'Second proof date'),
      date: getSecondProofDate(order),
    },
    {
      value: 'after_delivery' as const,
      icon: PackageCheck,
      dateLabel: tr('التسليم النهائي', 'Final delivery'),
      date: order.due_date || '',
    },
  ].filter(option => getAvailableAlterationTypes(order).includes(option.value))

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      size="md"
      zIndex="z-[70]"
      dir={isArabic ? 'rtl' : 'ltr'}
      eyebrow={tr('تعديل جديد · الخطوة 2 من 2', 'New alteration · step 2 of 2')}
      title={tr('اختيار نوع التعديل', 'Choose alteration type')}
      subtitle={(
        <span>
          {order.client_name || '—'} · {tr('طلب', 'Order')} <span dir="ltr">{order.order_number || '—'}</span>
        </span>
      )}
    >
      <div className="space-y-3">
        {options.map(({ value, icon: Icon, dateLabel, date }) => {
          const meta = ALTERATION_TYPE_META[value]
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl border p-4 text-start transition hover:shadow-sm active:scale-[0.99] ${meta.soft}`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ${meta.badge}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold text-slate-900">
                  {isArabic ? meta.label.ar : meta.label.en}
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  {dateLabel}: <span dir="ltr" className="font-bold">{formatAlterationDate(date) || '—'}</span>
                </span>
              </span>
              <Chevron className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
