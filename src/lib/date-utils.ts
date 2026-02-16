const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/
const DATE_PREFIX_REGEX = /^(\d{4}-\d{2}-\d{2})/

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

export function formatGregorianDate(
  value: string | null | undefined,
  locale: string = 'ar-SA',
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
