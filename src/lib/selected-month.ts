import { payrollMonth } from '@/lib/payroll-display'

/**
 * الشهر المختار المشترك بين أقسام متابعة العمال وصفحة رواتب التفصيل.
 * يبقى الاختيار محفوظاً لبقية اليوم (بتوقيت الرياض) أو حتى يختار المستخدم شهراً آخر،
 * ثم يعود تلقائياً إلى الشهر الحالي مع بداية يوم جديد.
 */
export const SELECTED_MONTH_EVENT = 'yasmin:selected-month-changed'
const SELECTED_MONTH_KEY = 'yasmin-selected-month-v1'
const RIYADH_TIME_ZONE = 'Asia/Riyadh'

export const isMonthKey = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/** الشهر الحالي بتوقيت الرياض — نفس مصدر شهر الرواتب. */
export const currentMonthKey = () => payrollMonth()

function riyadhDay() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: RIYADH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** نسخة في الذاكرة تُبقي الاختيار عاملاً حتى لو مُنع التخزين المحلي (تصفح خاص). */
let memory: { month: string; day: string } | null = null

export function readSelectedMonth(): string {
  if (typeof window === 'undefined') return currentMonthKey()
  const today = riyadhDay()
  if (memory) return memory.day === today ? memory.month : currentMonthKey()
  try {
    const raw = window.localStorage.getItem(SELECTED_MONTH_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { month?: unknown; day?: unknown }
      if (typeof saved?.month === 'string' && isMonthKey(saved.month) && saved.day === today) {
        memory = { month: saved.month, day: today }
        return saved.month
      }
    }
  } catch {
    // تخزين محلي غير متاح أو محتوى تالف — نعود للشهر الحالي
  }
  return currentMonthKey()
}

export function writeSelectedMonth(month: string) {
  if (typeof window === 'undefined' || !isMonthKey(month)) return
  const today = riyadhDay()
  if (memory && memory.day === today && memory.month === month) return
  memory = { month, day: today }
  try {
    window.localStorage.setItem(SELECTED_MONTH_KEY, JSON.stringify({ month, day: today }))
  } catch {
    // الاختيار يبقى في الذاكرة لبقية الجلسة
  }
  window.dispatchEvent(new Event(SELECTED_MONTH_EVENT))
}

export function subscribeSelectedMonth(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const crossTab = (event: StorageEvent) => {
    if (event.key !== SELECTED_MONTH_KEY) return
    memory = null
    onChange()
  }
  // العودة للصفحة تُعيد الفحص، فينتهي الاختيار تلقائياً عند انقلاب اليوم
  window.addEventListener(SELECTED_MONTH_EVENT, onChange)
  window.addEventListener('storage', crossTab)
  window.addEventListener('focus', onChange)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    window.removeEventListener(SELECTED_MONTH_EVENT, onChange)
    window.removeEventListener('storage', crossTab)
    window.removeEventListener('focus', onChange)
    document.removeEventListener('visibilitychange', onChange)
  }
}
