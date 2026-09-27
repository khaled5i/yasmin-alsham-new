/**
 * حساب المال والأطوال بأعداد صحيحة — هللة وسنتيمتر.
 *
 * كل مبلغ في المتجر الإلكتروني يُحسب بالهللة (1 ريال = 100 هللة) وكل طول قماش
 * بالسنتيمتر (1 متر = 100 سم)، فلا تدخل أخطاء الفاصلة العائمة في مبلغ يُدفع
 * فعلاً. التحويل إلى ريال أو متر للعرض فقط.
 *
 * وحدة نقية: بلا 'use client' وبلا zustand أو supabase، لتعمل في المتصفح وعلى
 * الخادم وفي سكربتات التحقق (`scripts/verify-fabric-store-pricing.cjs`).
 * التقريب في كل الدوال نصف للأعلى بعيداً عن الصفر (0.5 هللة ← هللة كاملة).
 */

/** خانات إضافية يُقرَّب عندها الرقم أولاً ليزول ضجيج التمثيل الثنائي. */
const GUARD_DIGITS = 4
const GUARD_SCALE = 10 ** GUARD_DIGITS

/** سقف القيم المقبولة للتحويل (أكبر بكثير من أي مبلغ أو طول حقيقي). */
const MAX_DECIMAL_MAGNITUDE = 1e12

/**
 * النص المقبول رقم عشري عادي فقط. `Number()` وحدها تقبل '0x10' (16) و'1e3'
 * (1000) و'Infinity'، وهذه ليست مبالغ أو أطوالاً يُعتمد عليها.
 */
const PLAIN_DECIMAL = /^\s*-?\d+(\.\d+)?\s*$/

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label}: قيمة خارج نطاق الحساب الصحيح الآمن (${value})`)
  }
}

/** ضرب أعداد صحيحة يرفض أي ناتج يفقد الدقة بدل إرجاع رقم خاطئ بصمت. */
export function multiplyExact(...factors: number[]): number {
  let product = 1
  for (const factor of factors) {
    assertSafeInteger(factor, 'عامل الضرب')
    product *= factor
    assertSafeInteger(product, 'ناتج الضرب')
  }
  return product
}

/** قسمة صحيحة للأسفل مصحَّحة: قسمة الفاصلة العائمة قد تخطئ بواحد قرب الحدود. */
function floorDivideNonNegative(numerator: number, denominator: number): number {
  let quotient = Math.floor(numerator / denominator)
  let remainder = numerator - quotient * denominator
  while (remainder < 0) {
    quotient -= 1
    remainder += denominator
  }
  while (remainder >= denominator) {
    quotient += 1
    remainder -= denominator
  }
  return quotient
}

/** قسمة عددين صحيحين مع تقريب نصف للأعلى (بعيداً عن الصفر). */
export function divideRoundHalfUp(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'البسط')
  assertSafeInteger(denominator, 'المقام')
  if (denominator <= 0) throw new RangeError('المقام يجب أن يكون عدداً موجباً')

  const magnitude = Math.abs(numerator)
  const quotient = floorDivideNonNegative(magnitude, denominator)
  const remainder = magnitude - quotient * denominator
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient
  return numerator < 0 && rounded !== 0 ? -rounded : rounded
}

function scaleDecimal(
  value: number | string | null | undefined,
  scale: number,
  strict: boolean
): number | null {
  if (value == null) return null
  if (typeof value === 'string' && !PLAIN_DECIMAL.test(value)) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || Math.abs(numeric) > MAX_DECIMAL_MAGNITUDE) return null

  // 33.33 مخزّن ثنائياً 33.3299999…؛ toFixed بخانات إضافية يعيده "33.330000"
  // ثم نقرّب نحن إلى المقياس المطلوب على الأرقام العشرية نفسها.
  const [integerDigits, fractionDigits] = Math.abs(numeric)
    .toFixed(scale + GUARD_DIGITS)
    .split('.')
  const guard = Number(fractionDigits.slice(scale))
  if (strict && guard !== 0) return null

  let magnitude = Number(integerDigits + fractionDigits.slice(0, scale))
  if (guard * 2 >= GUARD_SCALE) magnitude += 1
  if (!Number.isSafeInteger(magnitude)) return null
  return numeric < 0 && magnitude !== 0 ? -magnitude : magnitude
}

/**
 * يحوّل رقماً عشرياً إلى عدد صحيح بـ`scale` خانات (33.33 بمقياس 2 ⇒ 3333)
 * مع تقريب نصف للأعلى. يُرجع null لقيمة غير رقمية أو غير منتهية أو ضخمة.
 */
export function toScaledInteger(
  value: number | string | null | undefined,
  scale: number
): number | null {
  return scaleDecimal(value, scale, false)
}

/**
 * مثل `toScaledInteger` لكنه يرفض (null) أي رقم بخانات عشرية أكثر من `scale`
 * بدل تقريبه. لمدخلات المتصفح: 2.504 متر ليست كمية صالحة تُقرَّب بصمت.
 */
export function toScaledIntegerStrict(
  value: number | string | null | undefined,
  scale: number
): number | null {
  return scaleDecimal(value, scale, true)
}

export const sarToHalalas = (value: number | string | null | undefined) => toScaledInteger(value, 2)
export const halalasToSar = (halalas: number) => halalas / 100

export const metersToCentimeters = (value: number | string | null | undefined) =>
  toScaledInteger(value, 2)
export const metersToCentimetersStrict = (value: number | string | null | undefined) =>
  toScaledIntegerStrict(value, 2)
export const centimetersToMeters = (centimeters: number) => centimeters / 100

/**
 * يوزّع مبلغاً صحيحاً على بنود بنسبة أوزانها، ومجموع الحصص يساوي المبلغ بالضبط
 * (طريقة الباقي الأكبر). عند تساوي الباقي تذهب الهللة الزائدة للبند الأسبق،
 * فالنتيجة حتمية لنفس المدخلات.
 */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  assertSafeInteger(total, 'المبلغ الموزَّع')
  if (total < 0) throw new RangeError('لا يوزَّع مبلغ سالب')
  for (const weight of weights) {
    assertSafeInteger(weight, 'الوزن')
    if (weight < 0) throw new RangeError('الأوزان لا تكون سالبة')
  }
  if (total === 0) return weights.map(() => 0)

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum === 0) throw new RangeError('لا يمكن توزيع مبلغ على أوزان مجموعها صفر')

  const shares = weights.map((weight, index) => {
    const product = multiplyExact(total, weight)
    const base = floorDivideNonNegative(product, weightSum)
    return { index, amount: base, remainder: product - base * weightSum }
  })

  let leftover = total - shares.reduce((sum, share) => sum + share.amount, 0)
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const share of byRemainder) {
    if (leftover === 0) break
    share.amount += 1
    leftover -= 1
  }

  return shares.map(share => share.amount)
}
