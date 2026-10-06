/**
 * تنبيهات المتجر الإلكتروني (المرحلة 9، والدفعة D: AUD-09) — وحدة نقية بلا 'use client'.
 * تُحسب في القاعدة من الحالة (`fabric_store_staff_alerts`)، فتبقى ما دام سببها قائماً.
 * «الجديد» = ما لم تطّلع عليه المديرة في هذا المتصفح بعد (مفتاح: النوع + الطلب + بدايته)؛
 * يُستعمل لشارة الجرس في اللوحة فقط — التنبيه نفسه لا يزول بالاطلاع.
 */

export interface StoreAlert {
  kind: string
  orderId: string | null
  orderNumber: string | null
  since: string | null
  environment: string | null
  detail: string
}

/** أنواع التنبيهات كما تراها الموظفة. */
export const STORE_ALERT_LABELS: Record<string, string> = {
  sale_missing: 'مدفوع بلا مبيعة',
  task_dead: 'مهمة متوقفة',
  sale_amount_mismatch: 'مبلغ المبيعة لا يطابق',
  refund_ledger_mismatch: 'سجل الاسترداد لا يطابق',
  refund_unconfirmed: 'استرداد لم يظهر لدى ميسر',
  refund_review_due: 'موعد قرار المدير في استرداد',
  refund_stuck: 'استرداد معلّق',
  credit_note_missing: 'إشعار دائن مطلوب',
  payment_quarantined: 'دفعة محجورة',
  alostaz_review: 'فاتورة الأستاذ',
  needs_review: 'تحت المراجعة',
  // الدفعة C: تبقى ما دام المال لم يُرد أو لم يُسجَّل، ولو حُسمت المراجعة
  extra_payment_unrefunded: 'دفعة إضافية لم تُرد',
  cancelled_paid_unrefunded: 'سداد على طلب ملغى لم يُرد',
  external_refund: 'استرداد خارج النظام لم يُسجَّل',
}

// (المراجعة، ملاحظة منخفضة) النوع + الطلب فقط: «since» في بعض الأنواع وقت آخر مطابقة ويتغير كل يوم،
// فكان التنبيه نفسه يعود «جديداً». تنبيه زال ثم عاد بعد «تم الاطلاع» يُعدّ جديداً (المحفوظ = الحالي فقط).
export const alertKey = (alert: StoreAlert) => `${alert.kind}|${alert.orderId ?? alert.detail}`

interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const SEEN_KEY = 'fabric-store:seen-alerts'
const MAX_SEEN = 500

export function loadSeenAlerts(storage: KeyValueStorage | null): Set<string> {
  try {
    const raw = storage?.getItem(SEEN_KEY)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** يحفظ مفاتيح التنبيهات الحالية «مطّلَعاً عليها» (القديمة التي زالت تُنسى). */
export function markAlertsSeen(storage: KeyValueStorage | null, alerts: StoreAlert[]): void {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify(alerts.map(alertKey).slice(0, MAX_SEEN)))
  } catch { /* تخزين غير متاح: تبقى الشارة */ }
}

export function newAlertsCount(alerts: StoreAlert[], seen: Set<string>): number {
  return alerts.filter(a => !seen.has(alertKey(a))).length
}
