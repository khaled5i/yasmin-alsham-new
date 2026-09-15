/**
 * أكواد خصم الهدية — التوليد عند التسليم والاستخدام في مبيعات الأقمشة.
 * ─────────────────────────────────────────────────────────────
 * • كل عميلة يُسلَّم طلبها وتُرسَل لها رسالة الواتساب تحصل على كود خصم 20%
 *   صالح شهراً واحداً، يُستخدَم مرة واحدة في محل ياسمين الشام للأقمشة.
 * • كل العمليات تمرّ عبر دوال قاعدة البيانات (migrations/89) لأن الحجز يجب أن
 *   يكون ذرياً: جهازان يسجّلان مبيعة بالكود نفسه في اللحظة ذاتها لا ينجح إلا أحدهما.
 * • إن لم تُطبَّق الهجرة بعد، تتعامل الدوال هنا بلطف: التسليم يتم بلا كود،
 *   والتحقق يعرض رسالة واضحة بدل خطأ تقني.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

/** نسبة خصم الهدية الافتراضية */
export const DISCOUNT_COUPON_PERCENT = 20

/** مدة صلاحية الكود بالأيام (شهر) */
export const DISCOUNT_COUPON_VALID_DAYS = 30

export interface DeliveryDiscountCoupon {
  id: string
  code: string
  discount_percent: number
  issued_at: string
  expires_at: string
  /** TRUE إذا وُلِّد الآن، FALSE إذا أُعيد كود سابق ما زال سارياً لنفس الطلب */
  is_new: boolean
}

export type CouponValidationStatus = 'valid' | 'not_found' | 'expired' | 'redeemed'

export interface CouponValidationResult {
  status: CouponValidationStatus
  id: string | null
  code: string | null
  discount_percent: number | null
  client_name: string | null
  client_phone: string | null
  issued_at: string | null
  expires_at: string | null
  redeemed_at: string | null
}

export interface RedeemedCoupon {
  id: string
  code: string
  discount_percent: number
  expires_at: string
  redeemed_at: string
}

/** رسائل عربية جاهزة لكل حالة تحقق */
export const COUPON_STATUS_MESSAGES: Record<CouponValidationStatus, string> = {
  valid: 'كود صحيح وساري المفعول',
  not_found: 'كود الخصم غير صحيح',
  expired: 'انتهت صلاحية كود الخصم',
  redeemed: 'كود الخصم مستخدَم مسبقاً',
}

/** هل الخطأ ناتج عن عدم تطبيق الهجرة 89 بعد؟ */
function isMissingCouponFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.code === '42P01' ||
    /discount_coupon|discount_coupons/i.test(message)
  )
}

const MIGRATION_HINT =
  '⚠️ دوال أكواد الخصم غير موجودة. يرجى تطبيق migrations/89-delivery-discount-coupons.sql'

export function normalizeCouponCode(code: string): string {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

/** تنسيق تاريخ انتهاء الصلاحية كما يظهر للعميلة في رسالة الواتساب */
export function formatCouponExpiry(expiresAt: string): string {
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value || ''
  return `${part('day')}/${part('month')}/${part('year')}`
}

/**
 * توليد (أو استرجاع) كود هدية التسليم لطلب معيّن.
 * idempotent: إعادة فتح رسالة الواتساب لنفس الطلب تُعيد الكود نفسه ما دام سارياً.
 * يُعيد null إذا تعذّر التوليد — التسليم والرسالة يكملان بدون كود.
 */
export async function issueDeliveryCoupon(params: {
  orderId?: string | null
  clientName?: string | null
  clientPhone?: string | null
}): Promise<DeliveryDiscountCoupon | null> {
  if (!isSupabaseConfigured()) return null
  if (!params.orderId) return null

  try {
    const { data, error } = await supabase.rpc('issue_delivery_discount_coupon', {
      p_order_id: params.orderId,
      p_client_name: params.clientName || null,
      p_client_phone: params.clientPhone || null,
      p_valid_days: DISCOUNT_COUPON_VALID_DAYS,
      p_discount_percent: DISCOUNT_COUPON_PERCENT,
    })

    if (error) {
      if (isMissingCouponFunction(error)) console.warn(MIGRATION_HINT)
      else console.error('Error issuing delivery coupon:', error.message || error)
      return null
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row?.code) return null

    return {
      id: row.id,
      code: row.code,
      discount_percent: Number(row.discount_percent) || DISCOUNT_COUPON_PERCENT,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      is_new: row.is_new === true,
    }
  } catch (err) {
    console.error('Error issuing delivery coupon:', err)
    return null
  }
}

/**
 * التحقق من كود خصم قبل تطبيقه على مبيعة.
 * لا ترفع استثناءً للكود الخاطئ — الحالة تُعاد داخل النتيجة.
 */
export async function validateCoupon(code: string): Promise<CouponValidationResult> {
  const notFound: CouponValidationResult = {
    status: 'not_found',
    id: null,
    code: null,
    discount_percent: null,
    client_name: null,
    client_phone: null,
    issued_at: null,
    expires_at: null,
    redeemed_at: null,
  }

  const normalized = normalizeCouponCode(code)
  if (!normalized) return notFound
  if (!isSupabaseConfigured()) throw new Error('تعذّر الاتصال بقاعدة البيانات للتحقق من الكود')

  const { data, error } = await supabase.rpc('validate_discount_coupon', { p_code: normalized })

  if (error) {
    if (isMissingCouponFunction(error)) {
      console.warn(MIGRATION_HINT)
      throw new Error('ميزة أكواد الخصم غير مفعّلة بعد على قاعدة البيانات')
    }
    throw new Error(error.message || 'تعذّر التحقق من كود الخصم')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.status) return notFound

  return {
    status: row.status as CouponValidationStatus,
    id: row.id ?? null,
    code: row.code ?? null,
    discount_percent: row.discount_percent != null ? Number(row.discount_percent) : null,
    client_name: row.client_name ?? null,
    client_phone: row.client_phone ?? null,
    issued_at: row.issued_at ?? null,
    expires_at: row.expires_at ?? null,
    redeemed_at: row.redeemed_at ?? null,
  }
}

/**
 * حجز الكود لمبيعة معيّنة قبل إنشائها.
 * ترفع استثناءً برسالة عربية إذا كان الكود خاطئاً أو منتهياً أو مستخدَماً.
 * إعادة الاستدعاء بمعرّف المبيعة نفسه آمنة (تعديل المبلغ أو إعادة محاولة الحفظ).
 */
export async function redeemCoupon(params: {
  code: string
  incomeId: string
  subtotal: number
  discount: number
}): Promise<RedeemedCoupon> {
  if (!isSupabaseConfigured()) throw new Error('تعذّر الاتصال بقاعدة البيانات لتطبيق كود الخصم')

  const { data, error } = await supabase.rpc('redeem_discount_coupon', {
    p_code: normalizeCouponCode(params.code),
    p_income_id: params.incomeId,
    p_subtotal: params.subtotal,
    p_discount: params.discount,
  })

  if (error) {
    if (isMissingCouponFunction(error)) {
      console.warn(MIGRATION_HINT)
      throw new Error('ميزة أكواد الخصم غير مفعّلة بعد على قاعدة البيانات')
    }
    throw new Error(error.message || 'تعذّر تطبيق كود الخصم')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.id) throw new Error('تعذّر تطبيق كود الخصم')

  return {
    id: row.id,
    code: row.code,
    discount_percent: Number(row.discount_percent) || 0,
    expires_at: row.expires_at,
    redeemed_at: row.redeemed_at,
  }
}

/**
 * تحرير الكود المحجوز لمبيعة لم تُحفَظ (فشل الإنشاء بعد الحجز).
 * صامت عند الفشل: الـ trigger على جدول income شبكة أمان إضافية.
 */
export async function releaseCouponForIncome(incomeId: string): Promise<void> {
  if (!isSupabaseConfigured() || !incomeId) return

  try {
    const { error } = await supabase.rpc('release_discount_coupon', { p_income_id: incomeId })
    if (error && !isMissingCouponFunction(error)) {
      console.error('Error releasing discount coupon:', error.message || error)
    }
  } catch (err) {
    console.error('Error releasing discount coupon:', err)
  }
}
