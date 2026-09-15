/**
 * مستلزمات القياس التي قد تُحضرها العميلة مع الفستان: الكعب والستيان والمشد.
 *
 * تُسجَّل في صفحة إضافة التعديل كخيارات مستقلة (اختيار الخيار = تم إحضاره)،
 * وتظهر على ورقة الورشة كسطرين صريحين — ما أُحضر وما لم يُحضر — لأن العاملة
 * تحتاج أن تعرف ما ينقصها قبل أن تبدأ، لا أن تستنتجه من غياب الذكر.
 */

export const ALTERATION_ACCESSORY_KEYS = ['heel', 'bra', 'corset'] as const

export type AlterationAccessory = (typeof ALTERATION_ACCESSORY_KEYS)[number]

const LABEL_AR: Record<AlterationAccessory, string> = {
  heel: 'الكعب',
  bra: 'الستيان',
  corset: 'المشد',
}

const LABEL_HI: Record<AlterationAccessory, string> = {
  heel: 'हील',
  bra: 'ब्रा',
  corset: 'कोर्सेट',
}

const LABEL_EN: Record<AlterationAccessory, string> = {
  heel: 'Heels',
  bra: 'Bra',
  corset: 'Corset',
}

const BROUGHT_AR = 'تم إحضار'
const NOT_BROUGHT_AR = 'لم يتم إحضار'
const BROUGHT_HI = 'लाया गया'
const NOT_BROUGHT_HI = 'नहीं लाया गया'

export function getAccessoryLabel(
  accessory: AlterationAccessory,
  language: 'ar' | 'hi' | 'en' = 'ar'
): string {
  if (language === 'hi') return LABEL_HI[accessory]
  if (language === 'en') return LABEL_EN[accessory]
  return LABEL_AR[accessory]
}

export const isAlterationAccessory = (
  value: unknown
): value is AlterationAccessory =>
  typeof value === 'string' && (ALTERATION_ACCESSORY_KEYS as readonly string[]).includes(value)

/**
 * يوحّد ما يصل من قاعدة البيانات أو من نموذج قديم: يسقط القيم المجهولة
 * والمكرّرة ويعيد الترتيب الثابت، حتى تخرج الورقة بالترتيب نفسه دائمًا.
 */
export function normalizeAlterationAccessories(value: unknown): AlterationAccessory[] {
  if (!Array.isArray(value)) return []
  return ALTERATION_ACCESSORY_KEYS.filter(key => value.includes(key))
}

export function toggleAlterationAccessory(
  current: AlterationAccessory[],
  accessory: AlterationAccessory
): AlterationAccessory[] {
  const next = current.includes(accessory)
    ? current.filter(item => item !== accessory)
    : [...current, accessory]
  return normalizeAlterationAccessories(next)
}

/**
 * سطرا الورقة. السطر الذي لا عناصر له يُحذف بدل طباعته فارغًا، فحين تُحضر
 * العميلة كل شيء يبقى سطر «تم إحضار» وحده، وحين لا تُحضر شيئًا يبقى نقيضه.
 */
export function buildAccessoriesLines(
  brought: unknown,
  language: 'ar' | 'hi' = 'ar'
): string {
  const broughtKeys = normalizeAlterationAccessories(brought)
  const missingKeys = ALTERATION_ACCESSORY_KEYS.filter(key => !broughtKeys.includes(key))

  const separator = language === 'hi' ? ', ' : '، '
  const label = (key: AlterationAccessory) => getAccessoryLabel(key, language)
  const lines: string[] = []

  if (broughtKeys.length > 0) {
    const heading = language === 'hi' ? BROUGHT_HI : BROUGHT_AR
    lines.push(`${heading}: ${broughtKeys.map(label).join(separator)}`)
  }
  if (missingKeys.length > 0) {
    const heading = language === 'hi' ? NOT_BROUGHT_HI : NOT_BROUGHT_AR
    lines.push(`${heading}: ${missingKeys.map(label).join(separator)}`)
  }

  return lines.join('\n')
}
