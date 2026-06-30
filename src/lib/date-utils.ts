const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/
const DATE_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})/

// عدد الأيام التي يُخزَّن بها `due_date` قبل تاريخ الزبون الحقيقي (للضغط على التسليم).
// التاريخ الأصلي للزبون يُحفظ في عمود `customer_due_date` ويُعرض فقط في الواجهات التي
// يراها الزبون مباشرةً (تتبع الطلب، تقويم إضافة طلب، رسالة الواتساب).
export const DUE_DATE_BACKDATE_DAYS = 2

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function extractDateKey(value: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''

  if (DATE_ONLY_REGEX.test(trimmed)) {
    return trimmed
  }

  const prefixedDate = trimmed.match(DATE_PREFIX_REGEX)?.[1]
  if (prefixedDate) {
    return prefixedDate
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return trimmed
  }

  return toLocalDateKey(parsed)
}

export function parseDateForDisplay(value?: string | null): Date | null {
  if (!value) return null

  if (DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    // Use local noon to avoid timezone-related day shifts around midnight.
    return new Date(year, month - 1, day, 12, 0, 0, 0)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

export function parseDateKeyForPicker(value?: string | null): Date | null {
  if (!value) return null

  const dateKey = extractDateKey(value)
  if (!DATE_ONLY_REGEX.test(dateKey)) {
    return parseDateForDisplay(value)
  }

  const [year, month, day] = dateKey.split('-').map(Number)
  // Keep picker date stable in all timezones.
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function shiftDate(dateStr: string | null | undefined, days: number): string {
  if (!dateStr) return ''
  const dateKey = extractDateKey(dateStr)
  if (!dateKey) return dateStr
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toLocalDateKey(date)
}

// المحل مغلق يوم الجمعة (getDay() === 5)، فلا تُحجز فيه مواعيد البروفا الثانية.
function fallsOnClosedDay(dateKey: string): boolean {
  const parsed = parseDateForDisplay(dateKey)
  return parsed ? parsed.getDay() === 5 : false
}

/**
 * موعد البروفا الثانية للطلبات الجديدة، محسوباً من تاريخ التسليم الذي تراه الزبونة
 * (`customer_due_date` / `formData.dueDate`).
 * القاعدة الأساسية: العميل − 3 (أي `due_date` الداخلي − 1).
 * بما أن المحل مغلق يوم الجمعة، إذا وقع الموعد يوم جمعة يُزاح يوماً إضافياً للخلف
 * (الخميس) فيصبح العميل − 4.
 *
 * تُستخدم فقط عند إنشاء الطلب لتخزين القيمة في `second_proof_date`. الطلبات القديمة
 * (`second_proof_date = NULL`) تبقى على حساب العرض القديم `due_date − 1` دون تغيير.
 */
export function computeSecondProofDateFromCustomer(customerDueDate: string | null | undefined): string {
  const base = shiftDate(customerDueDate, -3)
  if (base && fallsOnClosedDay(base)) return shiftDate(customerDueDate, -4)
  return base
}

export function formatGregorianDate(
  value: string | null | undefined,
  locale: string = 'ar-SA-u-nu-latn',
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!value) return ''

  const parsed = parseDateForDisplay(value)
  if (!parsed) return value

  return parsed.toLocaleDateString(locale, {
    calendar: 'gregory',
    ...options
  })
}
