const ARABIC_INITIALS: Record<string, string> = {
  'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ع': 'A',
  'ب': 'B', 'ت': 'T', 'ث': 'TH', 'ج': 'J', 'ح': 'H', 'ه': 'H', 'ة': 'H',
  'خ': 'KH', 'د': 'D', 'ذ': 'TH', 'ر': 'R', 'ز': 'Z', 'ظ': 'Z',
  'س': 'S', 'ص': 'S', 'ش': 'SH', 'ض': 'D', 'ط': 'T', 'غ': 'GH',
  'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
  'و': 'W', 'ي': 'Y', 'ى': 'Y'
}

const GENERIC_WORDS = new Set(['قماش', 'اقمشة', 'أقمشة', 'الأقمشة', 'الاقمشة'])

export function normalizeFabricTypeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export function suggestFabricTypeCode(fabricType: string): string {
  const clean = fabricType.trim()
  if (!clean) return 'FB'

  if (/[A-Za-z]/.test(clean)) {
    return normalizeFabricTypeCode(clean).slice(0, 4) || 'FB'
  }

  const words = clean.split(/\s+/).filter(word => !GENERIC_WORDS.has(word))
  let code = words.map(word => ARABIC_INITIALS[word[0]] || '').join('')

  if (code.length < 2 && words.length === 1) {
    code += ARABIC_INITIALS[words[0][1]] || ''
  }

  return normalizeFabricTypeCode(code).slice(0, 4) || 'FB'
}

export function formatFabricCodePreview(typeCode: string, nextSequence: number): string {
  const normalized = normalizeFabricTypeCode(typeCode) || 'FB'
  return `${normalized}-${String(Math.max(1, nextSequence)).padStart(4, '0')}`
}
