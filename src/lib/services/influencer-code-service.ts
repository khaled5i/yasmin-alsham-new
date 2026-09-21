/**
 * أكواد المشاهير (شركاء النجاح) — الإدارة من قسم الأقمشة والاستخدام في المبيعات.
 * ─────────────────────────────────────────────────────────────
 * • كل العمليات عبر دوال قاعدة البيانات (supabase/migrations/20260921160000):
 *   الجداول نفسها مغلقة تماماً أمام المتصفح.
 * • الكود غير محدود الاستخدام لكن مرة واحدة لكل رقم هاتف عميلة، لذا الهاتف إجباري.
 * • المبيعة بكود مشهور تُحفظ مثل كوبون التسليم (coupon_code/discount_*) مع
 *   coupon_id = NULL؛ الربط بالمشهور في جدول الاستخدامات (income_id فريد).
 * • عمولة المشهور = نسبته × المبلغ بعد الخصم، محسوبة حيّة من المبيعة.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type InfluencerCodeStatus = 'active' | 'scheduled' | 'expired' | 'inactive'

export interface InfluencerCodeRow {
  id: string
  code: string
  discount_percent: number
  commission_percent: number
  valid_from: string
  valid_until: string
  is_active: boolean
  status: InfluencerCodeStatus
  uses_count: number
  sales_total: number
  commission_total: number
}

export interface InfluencerTotals {
  uses_count: number
  sales_total: number
  discount_total: number
  commission_total: number
  paid_total: number
  balance_due: number
  last_use_at: string | null
}

export interface InfluencerPartner {
  id: string
  full_name: string
  phone: string | null
  social_handle: string | null
  notes: string | null
  username: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
  codes: InfluencerCodeRow[]
  totals: InfluencerTotals
}

export interface InfluencerSaleRow {
  income_id: string
  code: string
  sale_date: string
  redeemed_at: string
  sale_amount: number
  subtotal_amount: number
  discount_amount: number
  commission_percent: number
  commission_amount: number
  buyer_name: string | null
  buyer_phone: string | null
}

export interface InfluencerPayoutRow {
  id: string
  amount: number
  paid_on: string
  note: string | null
  created_at: string
}

export type InfluencerValidationStatus =
  | 'valid'
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'phone_required'
  | 'used_by_phone'

export interface InfluencerValidationResult {
  status: InfluencerValidationStatus
  id: string | null
  code: string | null
  discount_percent: number | null
  partner_name: string | null
  valid_until: string | null
}

export const INFLUENCER_STATUS_MESSAGES: Record<InfluencerValidationStatus, string> = {
  valid: 'كود صحيح وساري المفعول',
  not_found: 'كود الخصم غير صحيح',
  inactive: 'كود الخصم موقوف',
  not_started: 'كود الخصم لم يبدأ بعد',
  expired: 'انتهت صلاحية كود الخصم',
  phone_required: 'كود مشهور: أدخلي رقم هاتف العميلة أولاً ثم تحققي من الكود',
  used_by_phone: 'هذه العميلة (نفس رقم الهاتف) استخدمت هذا الكود مسبقاً',
}

const MIGRATION_HINT =
  '⚠️ دوال أكواد المشاهير غير موجودة. يرجى تطبيق supabase/migrations/20260921160000_influencer_partner_codes.sql'

function isMissingInfluencerFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.code === '42P01' ||
    /influencer/i.test(error.message || '')
  )
}

function toError(error: { code?: string; message?: string }, fallback: string): Error {
  if (isMissingInfluencerFunction(error)) {
    console.warn(MIGRATION_HINT)
    return new Error('ميزة أكواد المشاهير غير مفعّلة بعد على قاعدة البيانات')
  }
  return new Error(error.message || fallback)
}

/** أكواد التسليم تبدأ دائماً بـ YS- (محجوزة)؛ غيرها كود مشهور */
export function isDeliveryCouponCode(code: string): boolean {
  return /^YS-/i.test(String(code || '').trim())
}

const num = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeTotals(raw: Record<string, unknown> | null | undefined): InfluencerTotals {
  return {
    uses_count: num(raw?.uses_count),
    sales_total: num(raw?.sales_total),
    discount_total: num(raw?.discount_total),
    commission_total: num(raw?.commission_total),
    paid_total: num(raw?.paid_total),
    balance_due: num(raw?.balance_due),
    last_use_at: (raw?.last_use_at as string | null) ?? null,
  }
}

function normalizeCode(raw: Record<string, unknown>): InfluencerCodeRow {
  return {
    id: String(raw.id),
    code: String(raw.code),
    discount_percent: num(raw.discount_percent),
    commission_percent: num(raw.commission_percent),
    valid_from: String(raw.valid_from),
    valid_until: String(raw.valid_until),
    is_active: raw.is_active === true,
    status: raw.status as InfluencerCodeStatus,
    uses_count: num(raw.uses_count),
    sales_total: num(raw.sales_total),
    commission_total: num(raw.commission_total),
  }
}

// ── لوحة المدير ─────────────────────────────────────────────────

export async function getInfluencerPartners(): Promise<InfluencerPartner[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await supabase.rpc('get_influencer_partners_overview')
  if (error) throw toError(error, 'تعذّر تحميل المشاهير')
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  return rows.map((row) => ({
    id: String(row.id),
    full_name: String(row.full_name ?? ''),
    phone: (row.phone as string | null) ?? null,
    social_handle: (row.social_handle as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    username: String(row.username ?? ''),
    is_active: row.is_active === true,
    created_at: String(row.created_at ?? ''),
    last_login_at: (row.last_login_at as string | null) ?? null,
    codes: Array.isArray(row.codes) ? (row.codes as Record<string, unknown>[]).map(normalizeCode) : [],
    totals: normalizeTotals(row.totals as Record<string, unknown>),
  }))
}

export async function getInfluencerPartnerActivity(
  partnerId: string
): Promise<{ sales: InfluencerSaleRow[]; payouts: InfluencerPayoutRow[] }> {
  const { data, error } = await supabase.rpc('get_influencer_partner_activity', {
    p_partner_id: partnerId,
  })
  if (error) throw toError(error, 'تعذّر تحميل عمليات المشهور')
  const raw = (data || {}) as { sales?: Record<string, unknown>[]; payouts?: Record<string, unknown>[] }
  return {
    sales: (raw.sales || []).map((s) => ({
      income_id: String(s.income_id),
      code: String(s.code),
      sale_date: String(s.sale_date),
      redeemed_at: String(s.redeemed_at),
      sale_amount: num(s.sale_amount),
      subtotal_amount: num(s.subtotal_amount),
      discount_amount: num(s.discount_amount),
      commission_percent: num(s.commission_percent),
      commission_amount: num(s.commission_amount),
      buyer_name: (s.buyer_name as string | null) ?? null,
      buyer_phone: (s.buyer_phone as string | null) ?? null,
    })),
    payouts: (raw.payouts || []).map((p) => ({
      id: String(p.id),
      amount: num(p.amount),
      paid_on: String(p.paid_on),
      note: (p.note as string | null) ?? null,
      created_at: String(p.created_at),
    })),
  }
}

export async function saveInfluencerPartner(input: {
  id?: string | null
  full_name: string
  phone?: string | null
  social_handle?: string | null
  notes?: string | null
  username: string
  /** فارغ عند التعديل = بلا تغيير */
  password?: string | null
  is_active: boolean
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_influencer_partner', {
    p_id: input.id || null,
    p_full_name: input.full_name,
    p_phone: input.phone || null,
    p_social_handle: input.social_handle || null,
    p_notes: input.notes || null,
    p_username: input.username,
    p_password: input.password || null,
    p_is_active: input.is_active,
  })
  if (error) throw toError(error, 'تعذّر حفظ بيانات المشهور')
  return String(data)
}

export async function saveInfluencerCode(input: {
  id?: string | null
  partner_id: string
  code: string
  discount_percent: number
  commission_percent: number
  valid_from: string
  valid_until: string
  is_active: boolean
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_influencer_code', {
    p_id: input.id || null,
    p_partner_id: input.partner_id,
    p_code: input.code,
    p_discount_percent: input.discount_percent,
    p_commission_percent: input.commission_percent,
    p_valid_from: input.valid_from,
    p_valid_until: input.valid_until,
    p_is_active: input.is_active,
  })
  if (error) throw toError(error, 'تعذّر حفظ الكود')
  return String(data)
}

export async function recordInfluencerPayout(input: {
  partner_id: string
  amount: number
  paid_on: string
  note?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('record_influencer_payout', {
    p_partner_id: input.partner_id,
    p_amount: input.amount,
    p_paid_on: input.paid_on,
    p_note: input.note || null,
  })
  if (error) throw toError(error, 'تعذّر تسجيل الدفعة')
}

export async function deleteInfluencerPayout(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_influencer_payout', { p_id: id })
  if (error) throw toError(error, 'تعذّر حذف الدفعة')
}

// ── مبيعات الأقمشة ──────────────────────────────────────────────

export async function validateInfluencerCode(
  code: string,
  clientPhone: string,
  incomeId?: string | null
): Promise<InfluencerValidationResult> {
  if (!isSupabaseConfigured()) throw new Error('تعذّر الاتصال بقاعدة البيانات للتحقق من الكود')
  const { data, error } = await supabase.rpc('validate_influencer_code', {
    p_code: code,
    p_client_phone: clientPhone || null,
    p_income_id: incomeId || null,
  })
  if (error) throw toError(error, 'تعذّر التحقق من كود الخصم')
  const row = (data || {}) as Record<string, unknown>
  return {
    status: (row.status as InfluencerValidationStatus) || 'not_found',
    id: (row.id as string | null) ?? null,
    code: (row.code as string | null) ?? null,
    discount_percent: row.discount_percent != null ? num(row.discount_percent) : null,
    partner_name: (row.partner_name as string | null) ?? null,
    valid_until: (row.valid_until as string | null) ?? null,
  }
}

/** حجز الكود للمبيعة قبل إنشائها/تعديلها — يرفع استثناءً برسالة عربية عند الرفض */
export async function redeemInfluencerCode(params: {
  code: string
  incomeId: string
  clientPhone: string
}): Promise<{ id: string; code: string; discount_percent: number; partner_name: string }> {
  const { data, error } = await supabase.rpc('redeem_influencer_code', {
    p_code: params.code,
    p_income_id: params.incomeId,
    p_client_phone: params.clientPhone,
  })
  if (error) throw toError(error, 'تعذّر تطبيق كود الخصم')
  const row = (data || {}) as Record<string, unknown>
  return {
    id: String(row.id),
    code: String(row.code),
    discount_percent: num(row.discount_percent),
    partner_name: String(row.partner_name ?? ''),
  }
}

/** تحرير حجز مبيعة لم تُحفظ. صامت عند الفشل: الاستخدام بلا مبيعة لا يُحتسب أصلاً. */
export async function releaseInfluencerCodeForIncome(incomeId: string): Promise<void> {
  if (!isSupabaseConfigured() || !incomeId) return
  try {
    const { error } = await supabase.rpc('release_influencer_code', { p_income_id: incomeId })
    if (error && !isMissingInfluencerFunction(error)) {
      console.error('Error releasing influencer code:', error.message || error)
    }
  } catch (err) {
    console.error('Error releasing influencer code:', err)
  }
}
