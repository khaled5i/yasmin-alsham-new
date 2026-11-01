// ألوان الأقمشة كما تُكتب في المخزون («كحلي»، «تيفني»…) ⇒ دائرة لون تُعرض في الفلاتر.

export interface FabricColorSwatch {
  /** قيمة CSS للخلفية: لون أو تدرّج للمعادن. */
  background: string
  /** لون فاتح يحتاج علامة اختيار داكنة. */
  isLight: boolean
}

// تطبيع اسم اللون: إزالة التشكيل وتوحيد الألف والهاء وحذف الفراغات
export const normalizeColorName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\s\-_/،,]/g, '')

const GOLD = 'linear-gradient(135deg, #f4dd8f 0%, #b8902f 50%, #f1d98a 100%)'
const SILVER = 'linear-gradient(135deg, #f2f2f2 0%, #a9a9a9 50%, #e6e6e6 100%)'
const MULTI = 'conic-gradient(#b3202e, #e5c13f, #2f7d4a, #2c5fb3, #9a6fae, #b3202e)'
const UNKNOWN = 'repeating-linear-gradient(45deg, #f6f0e8 0 4px, #e3d6c3 4px 8px)'

// الدرجات المحددة قبل العامّة: «أخضر زيتي» زيتي، و«لبني» ليس «بني»
const COLOR_TABLE: { aliases: string[]; background: string; isLight?: boolean }[] = [
  { aliases: ['ذهبي', 'gold'], background: GOLD, isLight: true },
  { aliases: ['فضي', 'silver'], background: SILVER, isLight: true },
  { aliases: ['متعدد', 'ملون', 'الوان'], background: MULTI },
  { aliases: ['سكري', 'كريمي', 'كريم', 'اوفوايت', 'offwhite'], background: '#f3ecd8', isLight: true },
  { aliases: ['ابيض', 'بيضاء', 'white'], background: '#ffffff', isLight: true },
  { aliases: ['لحمي', 'نود', 'nude'], background: '#e8c4a8', isLight: true },
  { aliases: ['بيج', 'بيچ', 'beige'], background: '#d8c2a2', isLight: true },
  { aliases: ['سماري'], background: '#8a7a66' },
  { aliases: ['رصاصي'], background: '#5f6368' },
  { aliases: ['رمادي', 'gray', 'grey'], background: '#a3a3a3', isLight: true },
  { aliases: ['اسود', 'سوداء', 'black'], background: '#1c1a19' },
  { aliases: ['كحلي', 'navy'], background: '#1f2a4d' },
  { aliases: ['سماوي', 'لبني'], background: '#86c5e6', isLight: true },
  { aliases: ['تيفني', 'tiffany'], background: '#81d8d0', isLight: true },
  { aliases: ['تركواز', 'فيروزي', 'turquoise'], background: '#1aa59c' },
  { aliases: ['ازرق', 'زرقاء', 'blue'], background: '#2c5fb3' },
  { aliases: ['زيتي', 'olive'], background: '#6b7034' },
  { aliases: ['تفاحي'], background: '#8cc63f', isLight: true },
  { aliases: ['فستقي'], background: '#a9c98d', isLight: true },
  { aliases: ['ليموني'], background: '#e3e55b', isLight: true },
  { aliases: ['اخضر', 'خضراء', 'green'], background: '#2f7d4a' },
  { aliases: ['كركمي'], background: '#d69e1c', isLight: true },
  { aliases: ['اصفر', 'صفراء', 'yellow'], background: '#e5c13f', isLight: true },
  { aliases: ['مشمشي'], background: '#f3b07e', isLight: true },
  { aliases: ['برتقالي', 'orange'], background: '#e8772e' },
  { aliases: ['عنابي'], background: '#7a1f2d' },
  { aliases: ['برغندي', 'نبيتي', 'burgundy'], background: '#5e1424' },
  { aliases: ['توتي'], background: '#8c2657' },
  { aliases: ['فوشي', 'fuchsia'], background: '#d23a85' },
  { aliases: ['ليلكي', 'lilac'], background: '#c6a8d8', isLight: true },
  { aliases: ['موف', 'mauve'], background: '#9a6fae' },
  { aliases: ['بنفسجي', 'purple'], background: '#5f3b8f' },
  { aliases: ['وردي', 'ورديه', 'زهري', 'روز', 'بينك', 'pink'], background: '#eaa7ba', isLight: true },
  { aliases: ['احمر', 'حمراء', 'red'], background: '#b3202e' },
  { aliases: ['بني', 'قهوه', 'كافيه', 'brown'], background: '#6b4429' },
]

const swatchCache = new Map<string, FabricColorSwatch>()

/** دائرة اللون لاسم لون مخزّن؛ الاسم غير المعروف يأخذ نقشة محايدة بدل لون مُخمَّن. */
export function getFabricColorSwatch(colorName: string): FabricColorSwatch {
  const cached = swatchCache.get(colorName)
  if (cached) return cached

  const normalized = normalizeColorName(colorName)
  const entry =
    COLOR_TABLE.find(row => row.aliases.includes(normalized)) ??
    COLOR_TABLE.find(row => row.aliases.some(alias => normalized.includes(alias)))
  const swatch = entry
    ? { background: entry.background, isLight: entry.isLight ?? false }
    : { background: UNKNOWN, isLight: true }

  swatchCache.set(colorName, swatch)
  return swatch
}
