/**
 * Yasmin Al-Sham - Measurements Type Definitions
 * تعريفات أنواع المقاسات
 */

/**
 * واجهة المقاسات الجديدة
 * New Measurements Interface
 */
export interface Measurements {
  // 1. الكتف (sh)
  sh?: number
  
  // 2. دوران الكتف (shr)
  shr?: number
  
  // 3. الصدر (ch)
  ch?: number
  
  // 4. الخصر (w)
  w?: number
  
  // 5. الأرداف (hi)
  hi?: number
  
  // 6. طول البنس (p)
  p?: number
  
  // 7. طول الصدرية (L)
  L?: number
  
  // 8. فتحة الصدر (v)
  v?: number
  
  // 9. الإبط (HF)
  HF?: number
  
  // 10. طول الكم (K)
  K?: number
  
  // 11. الزند (S)
  S?: number
  
  // 12. الإسوارة (S1)
  S1?: number
  
  // 13. طول الأمام (L)
  L_front?: number
  
  // 14. طول الخلف (LB)
  LB?: number
  
  // 15. مقاسات إضافية (حقل نصي مفتوح)
  additional_notes?: string
}

/**
 * أسماء المقاسات بالعربية والإنجليزية
 * Measurement names in Arabic and English
 */
export const MEASUREMENT_LABELS: Record<keyof Measurements, { ar: string; en: string; symbol: string }> = {
  sh: { ar: 'الكتف', en: 'Shoulder', symbol: 'sh' },
  shr: { ar: 'دوران الكتف', en: 'Shoulder Circumference', symbol: 'shr' },
  ch: { ar: 'الصدر', en: 'Chest', symbol: 'ch' },
  w: { ar: 'الخصر', en: 'Waist', symbol: 'w' },
  hi: { ar: 'الأرداف', en: 'Hips', symbol: 'hi' },
  p: { ar: 'طول البنس', en: 'Dart Length', symbol: 'p' },
  L: { ar: 'طول الصدرية', en: 'Bodice Length', symbol: 'L' },
  v: { ar: 'فتحة الصدر', en: 'Neckline', symbol: 'v' },
  HF: { ar: 'الإبط', en: 'Armpit', symbol: 'HF' },
  K: { ar: 'طول الكم', en: 'Sleeve Length', symbol: 'K' },
  S: { ar: 'الزند', en: 'Forearm', symbol: 'S' },
  S1: { ar: 'الإسوارة', en: 'Cuff', symbol: 'S1' },
  L_front: { ar: 'طول الأمام', en: 'Front Length', symbol: 'L' },
  LB: { ar: 'طول الخلف', en: 'Back Length', symbol: 'LB' },
  additional_notes: { ar: 'مقاسات إضافية', en: 'Additional Notes', symbol: '' }
}

/**
 * ترتيب عرض المقاسات
 * Display order of measurements
 */
export const MEASUREMENT_ORDER: (keyof Measurements)[] = [
  'sh',
  'shr',
  'ch',
  'w',
  'hi',
  'p',
  'L',
  'v',
  'HF',
  'K',
  'S',
  'S1',
  'L_front',
  'LB',
  'additional_notes'
]

/**
 * دالة مساعدة للحصول على اسم المقاس
 * Helper function to get measurement name
 */
export function getMeasurementLabel(key: keyof Measurements, language: 'ar' | 'en' = 'ar'): string {
  return MEASUREMENT_LABELS[key]?.[language] || key
}

/**
 * دالة مساعدة للحصول على اسم المقاس مع الرمز
 * Helper function to get measurement name with symbol
 */
export function getMeasurementLabelWithSymbol(key: keyof Measurements, language: 'ar' | 'en' = 'ar'): string {
  const label = MEASUREMENT_LABELS[key]
  if (!label) return key
  
  const name = label[language]
  const symbol = label.symbol
  
  if (symbol && key !== 'additional_notes') {
    return `${name} (${symbol})`
  }
  
  return name
}

