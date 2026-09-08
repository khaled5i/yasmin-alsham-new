'use client'

import { useSyncExternalStore } from 'react'
import {
  currentMonthKey,
  readSelectedMonth,
  subscribeSelectedMonth,
  writeSelectedMonth,
} from '@/lib/selected-month'

/**
 * الشهر المختار المشترك: أي قسم يغيّره يغيّره لباقي الأقسام فوراً،
 * ويبقى محفوظاً لبقية اليوم. القيمة على الخادم هي الشهر الحالي لتفادي اختلاف الترطيب.
 */
export function useSelectedMonth(): [string, (month: string) => void] {
  const month = useSyncExternalStore(subscribeSelectedMonth, readSelectedMonth, currentMonthKey)
  return [month, writeSelectedMonth]
}
