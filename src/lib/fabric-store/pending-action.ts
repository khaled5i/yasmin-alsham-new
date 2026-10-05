/**
 * عملية غير محسومة في لوحة طلبات المتجر (المرحلة 8، مراجعة 2) — وحدة نقية بلا 'use client'.
 *
 * الاسترداد وإعادة المخزون يحملان مفتاح عدم تكرار يولّده المتصفح. إن ضاع الرد (انقطاع، 5xx،
 * مهلة) فالخادم ربما نفّذ: **يبقى المفتاح وبيانات العملية** وتُعاد بالمفتاح نفسه، فيعيد
 * الخادم نتيجة العملية الأولى بدل تنفيذ ثانية. يُحفظ ذلك في المتصفح لكل طلب حتى لا تضيع
 * هوية العملية بإعادة تحميل الصفحة. المفتاح يتجدد فقط بعد نتيجة محسومة.
 */

export type ActionOutcome =
  | { kind: 'network' }
  | { kind: 'http'; status: number; code?: string | null }

/** هل عُرفت النتيجة (نجاح، أو رفض لم يُنفَّذ معه شيء)؟ غير ذلك: أعيدي بالمفتاح نفسه. */
export function isSettled(outcome: ActionOutcome): boolean {
  if (outcome.kind === 'network') return false
  const { status, code } = outcome
  if (status >= 200 && status < 300) return true
  if (status >= 500 || status === 408 || status === 429) return false
  // 409 «مشغول» (قفل): لم يُنفَّذ شيء، لكن الإعادة بالمفتاح نفسه آمنة وأوضح.
  if (status === 409 && (code === 'unavailable' || !code)) return false
  return status >= 400 && status < 500
}

export interface PendingAction {
  kind: 'refund' | 'restock'
  key: string
  body: Record<string, unknown>
  savedAt?: string
}

interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const storageKey = (orderId: string) => `fabric-store:pending-action:${orderId}`

export function savePending(storage: KeyValueStorage | null, orderId: string, action: PendingAction): void {
  try {
    storage?.setItem(storageKey(orderId), JSON.stringify({ ...action, savedAt: action.savedAt ?? new Date().toISOString() }))
  } catch { /* تخزين غير متاح: تبقى العملية في الذاكرة فقط */ }
}

export function loadPending(storage: KeyValueStorage | null, orderId: string): PendingAction | null {
  try {
    const raw = storage?.getItem(storageKey(orderId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingAction
    if ((parsed.kind !== 'refund' && parsed.kind !== 'restock') || typeof parsed.key !== 'string' || !parsed.body) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPending(storage: KeyValueStorage | null, orderId: string): void {
  try {
    storage?.removeItem(storageKey(orderId))
  } catch { /* لا شيء */ }
}
