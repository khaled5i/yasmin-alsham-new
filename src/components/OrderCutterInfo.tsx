'use client'

import { Scissors } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { formatGregorianDateTime } from '@/lib/date-utils'

export default function OrderCutterInfo({ order, showDate = false }: {
  order: { cutter_name?: string | null; cut_at?: string | null }
  showDate?: boolean
}) {
  const { t, language } = useTranslation()
  return (
    <span className="flex min-w-0 flex-col gap-1 text-xs text-teal-700" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Scissors className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('cutter')}: {order.cutter_name || t('not_specified')}</span>
      </span>
      {showDate && order.cut_at && (
        <span>{t('cut_date')}: {formatGregorianDateTime(order.cut_at, language === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh' })}</span>
      )}
    </span>
  )
}
