'use client'

/**
 * عقد بيانات السلة والمفضلة لمتجر الأقمشة + قواعد التسعير.
 *
 * هذا الملف هو المرجع الوحيد لحساب الأسعار في المتجر. لا تحسب سعراً في مكوّن
 * أو صفحة مباشرة، وإلا تعرّض الخصم للتطبيق مرتين.
 *
 * القواعد المعتمدة من المالك (19 سبتمبر 2026):
 * - طريقة البيع مشتقة من المخزون: مخزون 3 أو 3.5 متر بالضبط ⇒ «قطعة كاملة»،
 *   وأي مخزون آخر ⇒ بيع بالمتر. (نفس قاعدة العرض الحالية في المتجر.)
 * - البيع بالمتر: حد أدنى 1 متر وخطوة 0.5 متر.
 * - الأسعار المخزّنة غير شاملة الضريبة ⇒ تُضاف 15% في السلة.
 * - `price_per_meter = null` يعني «السعر عند الطلب» ⇒ لا يُشترى تلقائياً.
 *   والصفر يبقى صفراً ولا يتحول إلى سعر افتراضي، ولا يُسمح بشرائه.
 */

import { z } from 'zod'
import type { Fabric } from '@/store/fabricStore'
import {
  getFabricNetPricePerMeter,
  isWholeFabricPiece,
  type FabricPricingUnit,
} from './fabric-display-pricing'
import { formatFabricNumber, roundFabricNumber } from './fabric-number-format'

// ============================================
// الثوابت
// ============================================

/** إصدار عقد البيانات المحفوظ محلياً. أي تغيير غير متوافق يرفع هذا الرقم. */
export const FABRIC_COMMERCE_SCHEMA_VERSION = 1

/** ضريبة القيمة المضافة تُضاف فوق السعر المعروض (الأسعار المخزّنة غير شاملة). */
export const FABRIC_VAT_RATE = 0.15

/** خطوة الكمية للبيع بالمتر. */
export const FABRIC_METER_STEP = 0.5

/** الحد الأدنى للبيع بالمتر حين لا يحدد الصنف حداً أدنى خاصاً به. */
export const FABRIC_METER_MIN_FALLBACK = 1

/** سقف أمان لعدد أسطر السلة/المفضلة المحفوظة محلياً. */
export const MAX_CART_LINES = 40
export const MAX_FAVORITE_ITEMS = 200

/** سقف أمان لكمية السطر الواحد، فوق قيد المخزون. */
export const MAX_METERS_PER_LINE = 100

export type FabricPurchaseMode = FabricPricingUnit

// ============================================
// عقد بيانات السطر المحفوظ
// ============================================

/**
 * لقطة عرض مؤقتة: تُستعمل فقط لعرض السطر قبل وصول بيانات القماش الحيّة
 * (وللكشف عن تغيّر السعر). ليست مرجعاً للسعر إطلاقاً — الخادم هو المرجع.
 * ممنوع حفظ أي هاتف أو عنوان أو سر هنا.
 */
const cartSnapshotSchema = z.object({
  label: z.string().max(200),
  fabricCode: z.string().max(60).nullable(),
  color: z.string().max(60).nullable(),
  image: z.string().max(1000).nullable(),
  unitPrice: z.number().finite().nonnegative().nullable(),
})

const cartLineSchema = z.object({
  fabricId: z.string().min(1).max(100),
  purchaseMode: z.enum(['meter', 'piece']),
  quantity: z.number().finite().positive().max(MAX_METERS_PER_LINE),
  addedAt: z.string().max(40),
  snapshot: cartSnapshotSchema,
})

export const fabricCartStateSchema = z.object({
  schemaVersion: z.literal(FABRIC_COMMERCE_SCHEMA_VERSION),
  lines: z.array(cartLineSchema).max(MAX_CART_LINES),
})

const favoriteItemSchema = z.object({
  fabricId: z.string().min(1).max(100),
  addedAt: z.string().max(40),
  snapshot: cartSnapshotSchema,
})

export const fabricFavoritesStateSchema = z.object({
  schemaVersion: z.literal(FABRIC_COMMERCE_SCHEMA_VERSION),
  items: z.array(favoriteItemSchema).max(MAX_FAVORITE_ITEMS),
})

export type FabricCartSnapshot = z.infer<typeof cartSnapshotSchema>
export type FabricCartLine = z.infer<typeof cartLineSchema>
export type FabricFavoriteItem = z.infer<typeof favoriteItemSchema>

/**
 * مفتاح السطر: القماش + طريقة البيع.
 *
 * كل صف في جدول `fabrics` هو أصلاً لون واحد محدد مرتبط بـ`inventory_color_id`،
 * فلا يوجد بُعد لون منفصل يدخل في المفتاح. تغيّر اللون = قماش آخر = سطر مستقل.
 */
export function getCartLineKey(fabricId: string, purchaseMode: FabricPurchaseMode): string {
  return `${fabricId}::${purchaseMode}`
}

// ============================================
// طريقة البيع والتسعير
// ============================================

/**
 * طريقة البيع مشتقة من المخزون الحيّ، لا من قيمة محفوظة.
 * لذلك يجب إعادة اشتقاقها في كل مرة تُفتح فيها السلة، والتنبيه إذا تغيّرت.
 */
export function getFabricPurchaseMode(fabric: Pick<Fabric, 'stock_quantity'>): FabricPurchaseMode {
  return isWholeFabricPiece(fabric.stock_quantity) ? 'piece' : 'meter'
}

/**
 * سعر الوحدة الواحدة بعد الخصم وقبل الضريبة.
 * - بالمتر: سعر المتر بعد الخصم.
 * - بالقطعة: سعر المتر بعد الخصم × أمتار القطعة (مثال: 3.5 × 100 = 350 للقطعة).
 *
 * الخصم يُطبّق مرة واحدة فقط داخل `getFabricNetPricePerMeter`؛ لا تضربه هنا ثانية.
 */
export function getFabricUnitPrice(fabric: Fabric): number | null {
  const discounted = getFabricNetPricePerMeter(fabric)
  if (discounted == null || !Number.isFinite(discounted) || discounted <= 0) return null

  if (getFabricPurchaseMode(fabric) === 'piece') {
    const meters = roundFabricNumber(Number(fabric.stock_quantity) || 0)
    if (meters <= 0) return null
    return roundFabricNumber(discounted * meters)
  }

  return roundFabricNumber(discounted)
}

/** حدود الكمية المسموحة لهذا القماش بطريقة بيعه الحالية. */
export interface FabricQuantityBounds {
  min: number
  max: number
  step: number
  /** عدد الخانات العشرية المسموحة في العرض والإدخال. */
  decimals: number
}

export function getFabricQuantityBounds(fabric: Fabric): FabricQuantityBounds {
  const stock = roundFabricNumber(Number(fabric.stock_quantity) || 0)

  // القطعة الكاملة هي كامل المخزون المتبقي ⇒ قطعة واحدة فقط، بلا كسور.
  if (getFabricPurchaseMode(fabric) === 'piece') {
    return { min: 1, max: 1, step: 1, decimals: 0 }
  }

  const configuredMin = roundFabricNumber(Number(fabric.min_order_meters) || 0)
  const min = configuredMin > 0 ? configuredMin : FABRIC_METER_MIN_FALLBACK
  const max = roundFabricNumber(Math.min(stock > 0 ? stock : 0, MAX_METERS_PER_LINE))

  return { min, max, step: FABRIC_METER_STEP, decimals: 2 }
}

/** يُثبّت الكمية على الخطوة وداخل الحدود. يُرجع null إذا تعذّر الشراء أصلاً. */
export function clampFabricQuantity(quantity: number, bounds: FabricQuantityBounds): number | null {
  if (!Number.isFinite(quantity) || bounds.max < bounds.min) return null

  const steppedFromMin = bounds.min + Math.round((quantity - bounds.min) / bounds.step) * bounds.step
  const stepped = roundFabricNumber(steppedFromMin)
  if (stepped < bounds.min) return bounds.min
  if (stepped > bounds.max) {
    // ننزل لأقرب خطوة صالحة لا تتجاوز المخزون.
    const steps = Math.floor(roundFabricNumber((bounds.max - bounds.min) / bounds.step))
    const capped = roundFabricNumber(bounds.min + Math.max(0, steps) * bounds.step)
    return capped >= bounds.min ? capped : null
  }
  return stepped
}

// ============================================
// حالة السطر مقابل البيانات الحيّة
// ============================================

export type FabricLineStatus =
  /** جاهز للشراء. */
  | 'ok'
  /** لم تصل بياناته الحيّة بعد — ليس حكماً عليه بأنه غير متاح. */
  | 'pending'
  /** انقلبت وحدة البيع، فالكمية المحفوظة بلا معنى حتى تعيد المستخدمة اختيارها. */
  | 'needs-quantity'
  /** لم يعد موجوداً في المتجر (محذوف أو مخفي). */
  | 'missing'
  /** موجود لكنه غير متاح للبيع حالياً. */
  | 'unavailable'
  /** السعر عند الطلب ⇒ يُطلب عبر واتساب ولا يدخل الإجمالي. */
  | 'price-on-request'
  /** نفدت الكمية. */
  | 'out-of-stock'

export type FabricLineNotice =
  /** عُدِّلت الكمية لتوافق المخزون أو الخطوة. */
  | 'quantity-adjusted'
  /** تغيّر السعر عن آخر مرة رآها المستخدم. */
  | 'price-changed'

export interface ResolvedFabricCartLine {
  key: string
  line: FabricCartLine
  fabric: Fabric | null
  status: FabricLineStatus
  isPurchasable: boolean
  purchaseMode: FabricPurchaseMode
  unitPrice: number | null
  quantity: number
  bounds: FabricQuantityBounds | null
  lineTotal: number | null
  notices: FabricLineNotice[]
}

/** هل القماش معروض للبيع في واجهة المتجر؟ */
export function isFabricPubliclyVisible(fabric: Fabric): boolean {
  return (
    fabric.deleted_at == null &&
    fabric.is_active !== false &&
    fabric.is_available !== false &&
    fabric.is_manually_hidden !== true
  )
}

/**
 * يطابق سطراً محفوظاً مع بيانات القماش الحيّة.
 * لا يحذف السطر أبداً عند فقدان القماش — يُعلَّم ويُعرض للمستخدم.
 */
export interface ResolveCartLineOptions {
  /**
   * البحث عن القماش لم ينتهِ بعد (أو فشل). يمنع الحكم بأن القماش «لم يعد
   * معروضاً» لمجرد أن بياناته لم تصل — رسالة مقلقة وغير صحيحة أثناء التحميل.
   */
  isLookupPending?: boolean
}

export function resolveCartLine(
  line: FabricCartLine,
  fabric: Fabric | null | undefined,
  options: ResolveCartLineOptions = {}
): ResolvedFabricCartLine {
  const notices: FabricLineNotice[] = []
  const base = {
    key: getCartLineKey(line.fabricId, line.purchaseMode),
    line,
    quantity: line.quantity,
    bounds: null,
    lineTotal: null,
    unitPrice: null,
    purchaseMode: line.purchaseMode,
    notices,
  }

  // إعادة التحقق من الخادم لم تكتمل بعد. نعرض ما لدينا من بيانات لكن لا نسمح
  // بالشراء ولا نحتسب إجمالياً: نسخة الكتالوج المحمّلة سابقاً ليست تحققاً.
  if (options.isLookupPending) {
    return { ...base, fabric: fabric ?? null, status: 'pending', isPurchasable: false }
  }

  if (!fabric) {
    return { ...base, fabric: null, status: 'missing', isPurchasable: false }
  }

  if (!isFabricPubliclyVisible(fabric)) {
    return { ...base, fabric, status: 'unavailable', isPurchasable: false }
  }

  const purchaseMode = getFabricPurchaseMode(fabric)

  const stock = roundFabricNumber(Number(fabric.stock_quantity) || 0)
  if (stock <= 0) {
    return { ...base, fabric, purchaseMode, status: 'out-of-stock', isPurchasable: false }
  }

  const unitPrice = getFabricUnitPrice(fabric)
  if (unitPrice == null) {
    return { ...base, fabric, purchaseMode, status: 'price-on-request', isPurchasable: false }
  }

  const bounds = getFabricQuantityBounds(fabric)

  // وحدة البيع نفسها تغيّرت (متر ⇄ قطعة). الرقم المحفوظ كان بوحدة أخرى، فتحويله
  // تلقائياً يبدّل معنى الطلب بصمت — «قطعة 3.5م» تصير «متراً واحداً». تُعاد
  // الكمية للمستخدمة لتختارها، ولا يُحتسب السطر حتى تؤكّد.
  // ولا نقارن الأسعار هنا: سعر القطعة وسعر المتر ليسا رقمين قابلين للمقارنة.
  if (purchaseMode !== line.purchaseMode) {
    return {
      ...base,
      fabric,
      purchaseMode,
      unitPrice,
      bounds,
      quantity: clampFabricQuantity(line.quantity, bounds) ?? bounds.min,
      status: 'needs-quantity',
      isPurchasable: false,
    }
  }

  if (line.snapshot.unitPrice != null && roundFabricNumber(line.snapshot.unitPrice) !== unitPrice) {
    notices.push('price-changed')
  }

  const clamped = clampFabricQuantity(line.quantity, bounds)
  if (clamped == null) {
    return { ...base, fabric, purchaseMode, unitPrice, bounds, status: 'out-of-stock', isPurchasable: false }
  }
  if (clamped !== roundFabricNumber(line.quantity)) notices.push('quantity-adjusted')

  return {
    // المفتاح يُبنى دائماً من طريقة البيع المحفوظة لا الحيّة: هو عنوان السطر
    // في المتجر، فلو انقلبت طريقة البيع لتوقّف الحذف وتعديل الكمية عن المطابقة.
    key: getCartLineKey(line.fabricId, line.purchaseMode),
    line,
    fabric,
    status: 'ok',
    isPurchasable: true,
    purchaseMode,
    unitPrice,
    quantity: clamped,
    bounds,
    lineTotal: roundFabricNumber(unitPrice * clamped),
    notices,
  }
}

// ============================================
// إجماليات السلة
// ============================================

export interface FabricCartTotals {
  /** مجموع الأسطر القابلة للشراء قبل الضريبة. */
  subtotal: number
  /** ضريبة القيمة المضافة 15%. */
  vat: number
  /** الإجمالي شامل الضريبة. */
  total: number
  /** عدد الأسطر القابلة للشراء. */
  purchasableCount: number
  /** عدد الأسطر التي تحتاج تدخّل المستخدم (غير متاحة أو سعرها عند الطلب). */
  blockedCount: number
}

/**
 * الإجمالي المحلي تقديري للعرض فقط؛ الخادم هو مرجع السعر النهائي عند الطلب.
 * الأسطر غير القابلة للشراء لا تدخل الإجمالي لكنها تبقى ظاهرة في السلة.
 */
export function computeCartTotals(lines: ResolvedFabricCartLine[]): FabricCartTotals {
  let subtotal = 0
  let purchasableCount = 0
  let blockedCount = 0

  for (const line of lines) {
    if (line.isPurchasable && line.lineTotal != null) {
      subtotal = roundFabricNumber(subtotal + line.lineTotal)
      purchasableCount += 1
    } else if (line.status !== 'pending') {
      // السطر قيد التحميل ليس سطراً «معطّلاً»؛ أما المنتظر إعادة اختيار الكمية
      // فهو كذلك لأنه يحتاج تدخّل المستخدمة فعلاً.
      blockedCount += 1
    }
  }

  const vat = roundFabricNumber(subtotal * FABRIC_VAT_RATE)
  return {
    subtotal,
    vat,
    total: roundFabricNumber(subtotal + vat),
    purchasableCount,
    blockedCount,
  }
}

// ============================================
// مساعدات عرض
// ============================================

export function getFabricLabel(fabric: Pick<Fabric, 'name' | 'fabric_code'>): string {
  return fabric.name?.trim() || fabric.fabric_code?.trim() || 'قماش'
}

export function getFabricColor(fabric: Pick<Fabric, 'available_colors'>): string | null {
  return fabric.available_colors?.[0]?.trim() || null
}

export function getFabricPrimaryImage(fabric: Pick<Fabric, 'images' | 'thumbnail_image' | 'image_url'>): string | null {
  return fabric.images?.[0] || fabric.thumbnail_image || fabric.image_url || null
}

/** لقطة العرض المؤقتة المحفوظة مع السطر. */
export function buildCartSnapshot(fabric: Fabric): FabricCartSnapshot {
  return {
    label: getFabricLabel(fabric).slice(0, 200),
    fabricCode: fabric.fabric_code?.slice(0, 60) ?? null,
    color: getFabricColor(fabric)?.slice(0, 60) ?? null,
    image: getFabricPrimaryImage(fabric)?.slice(0, 1000) ?? null,
    unitPrice: getFabricUnitPrice(fabric),
  }
}

export function formatPurchaseModeLabel(mode: FabricPurchaseMode): string {
  return mode === 'piece' ? 'قطعة كاملة' : 'بيع بالمتر'
}

export function formatQuantityLabel(quantity: number, mode: FabricPurchaseMode): string {
  if (mode === 'piece') {
    return quantity === 1 ? 'قطعة واحدة' : `${formatFabricNumber(quantity)} قطع`
  }
  return `${formatFabricNumber(quantity)} متر`
}

export function formatUnitPriceLabel(unitPrice: number | null, mode: FabricPurchaseMode): string {
  if (unitPrice == null) return 'السعر عند الطلب'
  return `${formatFabricNumber(unitPrice)} ريال / ${mode === 'piece' ? 'القطعة' : 'متر'}`
}

export const FABRIC_LINE_STATUS_MESSAGES: Record<Exclude<FabricLineStatus, 'ok'>, string> = {
  pending: 'جاري التحقق من توفّر هذا القماش...',
  'needs-quantity':
    'تغيّرت وحدة بيع هذا القماش لأن مخزونه تغيّر — اختاري الكمية من جديد لتأكيدها',
  missing: 'هذا القماش لم يعد معروضاً في المتجر',
  unavailable: 'هذا القماش غير متاح للبيع حالياً',
  'price-on-request': 'سعر هذا القماش عند الطلب — تواصلي معنا عبر واتساب',
  'out-of-stock': 'نفدت كمية هذا القماش',
}

export const FABRIC_LINE_NOTICE_MESSAGES: Record<FabricLineNotice, string> = {
  'quantity-adjusted': 'عُدِّلت الكمية لتناسب المتوفر',
  'price-changed': 'تغيّر سعر هذا القماش منذ إضافته',
}

// ============================================
// مفتاح التفعيل (للتراجع بلا حذف بيانات)
// ============================================

/**
 * ضع `NEXT_PUBLIC_FABRIC_CART_ENABLED=false` لإخفاء واجهات السلة والمفضلة
 * كلياً دون حذف أي جدول أو بيانات محفوظة. أي قيمة أخرى (أو غياب المتغير)
 * تُبقي الميزة مفعّلة.
 */
export const IS_FABRIC_CART_ENABLED =
  !['false', '0', 'off'].includes(
    (process.env.NEXT_PUBLIC_FABRIC_CART_ENABLED ?? '').trim().toLowerCase()
  )
