/**
 * مصدر الزبونة في مبيعات قسم الأقمشة + رسالة الشكر بعد الشراء.
 *
 * يُخزَّن المصدر في income.customer_source نصاً عربياً (عمود varchar بلا قيد)،
 * فإضافة خيار جديد لا تحتاج migration. «مصدر آخر» يحفظ ما تكتبه الموظفة، أو
 * «مصدر آخر» إن تركته فارغاً. المتجر الإلكتروني يكتب «المتجر الإلكتروني» من
 * الخادم ويبقى ضمن «مصدر آخر» في الإحصائيات كما كان.
 */

export type FabricCustomerSourceKey =
  | 'yasmin_alsham'
  | 'tiktok'
  | 'instagram'
  | 'google_maps'
  | 'friend'
  | 'other'

/** الترتيب هنا هو ترتيب الأزرار في النموذج وبطاقات الإحصائيات. */
export const FABRIC_CUSTOMER_SOURCES: ReadonlyArray<{
  key: FabricCustomerSourceKey
  label: string
}> = [
  { key: 'yasmin_alsham', label: 'ياسمين الشام' },
  { key: 'tiktok', label: 'تيك توك' },
  { key: 'instagram', label: 'انستغرام' },
  { key: 'google_maps', label: 'جوجل ماب' },
  { key: 'friend', label: 'صديقة' },
  { key: 'other', label: 'مصدر آخر' },
]

export function getFabricCustomerSourceLabel(key: FabricCustomerSourceKey): string {
  return FABRIC_CUSTOMER_SOURCES.find((s) => s.key === key)?.label ?? 'مصدر آخر'
}

/**
 * يحوّل القيمة المخزّنة إلى خيار. قبل إضافة الخيارات الجديدة كانت الموظفات
 * يكتبن «تيك توك» أو «انستا» أو «قوقل ماب» يدوياً تحت «مصدر آخر»، فنتعرّف عليها
 * بكلمات مفتاحية كي تدخل السجلات القديمة في بطاقتها الصحيحة.
 */
export function classifyFabricCustomerSource(
  value: string | null | undefined
): FabricCustomerSourceKey | null {
  const text = value?.trim()
  if (!text) return null

  const exact = FABRIC_CUSTOMER_SOURCES.find((s) => s.label === text)
  if (exact) return exact.key

  const t = text.toLowerCase()
  if (/تيك|تك توك|tik\s*tok|tiktok/.test(t)) return 'tiktok'
  if (/انست|إنست|instagram|insta/.test(t)) return 'instagram'
  if (/جوجل|قوقل|غوغل|خرائط|ماب|google|maps/.test(t)) return 'google_maps'
  if (/صديق|صاحب/.test(t)) return 'friend'
  return 'other'
}

/** رابط «كتابة مراجعة» المباشر لياسمين الشام للأقمشة على خرائط Google. */
export const FABRIC_STORE_GOOGLE_MAPS_URL = 'https://g.page/r/CVeGUkexfojvEBM/review'

/** رسالة شكر بعد الشراء مع طلب تقييم لطيف على خرائط Google. */
export function buildFabricThankYouMessage(buyerName?: string | null): string {
  const name = buyerName?.trim()
  const greeting = name ? `أهلاً ${name} 🌸` : 'أهلاً وسهلاً 🌸'
  return [
    greeting,
    '',
    'شكراً لتسوّقك من ياسمين الشام للأقمشة، سعدنا جداً بزيارتك 💐',
    '',
    'إذا أعجبتك تجربتك معنا، يسعدنا أن تتركي لنا تقييماً لطيفاً على خرائط جوجل 🤍',
    FABRIC_STORE_GOOGLE_MAPS_URL,
  ].join('\n')
}
