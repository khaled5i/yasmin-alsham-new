'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { IS_FABRIC_STORE_ORDERS_ENABLED } from '@/lib/fabric-store/order-status'
import {
  STORE_ALERT_LABELS,
  alertKey,
  loadSeenAlerts,
  markAlertsSeen,
  type StoreAlert,
} from '@/lib/fabric-store/store-alerts'

const storage = (): Storage | null => { try { return window.localStorage } catch { return null } }

/** تنبيهات المتجر من الخادم (المدير ومدير متجر الأقمشة). null = غير متاح (المفتاح مطفأ أو لا صلاحية). */
export async function fetchStoreAlerts(): Promise<StoreAlert[] | null> {
  if (!IS_FABRIC_STORE_ORDERS_ENABLED) return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const response = await fetch('/api/fabric-store/staff/alerts/', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await response.json().catch(() => null)
    return response.ok && data?.ok && Array.isArray(data.alerts) ? data.alerts as StoreAlert[] : null
  } catch {
    return null
  }
}

/**
 * الدفعة D (AUD-09، قرار المالكة 5 أكتوبر): تنبيهات متجر الأقمشة في مركز الإشعارات، فتصل المديرة
 * دون فتح صفحة الطلبات. «تم الاطلاع» يُطفئ شارة الجرس لهذه التنبيهات في هذا المتصفح فقط؛ التنبيه
 * نفسه يبقى حتى يُصلح سببه (يُحسب في القاعدة).
 */
export default function StoreAlertsPanel({ onSeen }: { onSeen?: () => void }) {
  const [alerts, setAlerts] = useState<StoreAlert[] | null>(null)
  const [seen, setSeen] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setAlerts(await fetchStoreAlerts())
    setSeen(loadSeenAlerts(storage()))
  }, [])

  useEffect(() => { void load() }, [load])

  if (!alerts || alerts.length === 0) return null
  const newCount = alerts.filter(a => !seen.has(alertKey(a))).length

  return (
    <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" dir="rtl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" /> تنبيهات متجر الأقمشة ({alerts.length})
          {newCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">جديد {newCount}</span>}
        </p>
        <div className="flex gap-2">
          {newCount > 0 && (
            <button type="button" onClick={() => { markAlertsSeen(storage(), alerts); setSeen(loadSeenAlerts(storage())); onSeen?.() }}
              className="inline-flex items-center gap-1 rounded-xl border border-red-300 px-3 py-1.5 text-xs font-semibold hover:bg-red-100">
              <CheckCheck className="h-4 w-4" /> تم الاطلاع
            </button>
          )}
          <Link href="/dashboard/accounting/fabrics/online-orders/"
            className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
            طلبات المتجر
          </Link>
        </div>
      </div>
      <ul className="space-y-1.5">
        {alerts.slice(0, 20).map(a => (
          <li key={alertKey(a)} className={`rounded-xl p-2 ${seen.has(alertKey(a)) ? 'bg-white/50' : 'bg-white font-semibold'}`}>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs">{STORE_ALERT_LABELS[a.kind] ?? a.kind}</span>
            {a.orderNumber && <span dir="ltr" className="mx-2">{a.orderNumber}</span>}
            {a.environment === 'test' && <span className="text-xs text-purple-700">(اختبار)</span>}
            <span className="block text-xs font-normal opacity-80">{a.detail}</span>
          </li>
        ))}
      </ul>
      {alerts.length > 20 && <p className="mt-2 text-xs">… و{alerts.length - 20} أخرى في صفحة طلبات المتجر</p>}
    </section>
  )
}
