/**
 * مساعد جهة المتصفح للربط مع الأستاذ للمحاسبة.
 * ─────────────────────────────────────────────────────────────
 * لا يحتوي على أي أسرار — يستدعي المسار الخادمي /api/alostaz/send-invoice
 * (الذي يحمل التوكن)، ويقرأ/يكتب مفتاح «الإرسال التلقائي» من app_settings.
 */

import { supabase } from '../supabase'

const TAILORING_INVOICE_TIMEOUT_MS = 15_000

export interface SendInvoiceResult {
  success: boolean
  invoice_id?: number
  invoice_code?: string
  invoice_amount?: number
  alreadySent?: boolean
  /** طلب آخر حجز إرسال الفاتورة نفسها بالفعل؛ لا تبدأ محاولة ثانية. */
  inProgress?: boolean
  isDraft?: boolean
  /** تُرفَع في الوضع التلقائي عندما لا يوجد مبلغ شبكة → لا تُنشأ فاتورة */
  skipped?: boolean
  warning?: string
  error?: string
}

export type TailoringInvoicePhase = 'deposit' | 'delivery' | 'manual' | 'measurement'

/**
 * إرسال فاتورة تفصيل إلى الأستاذ عبر المسار الخادمي.
 * - deposit: عربون الشبكة عند إنشاء الطلب وأي دفعة شبكة إضافية.
 * - delivery: شبكة الدفعة المتبقية فقط عند التسليم.
 * - manual: المسار اليدوي للطلبات القديمة.
 * - measurement: أجرة مقاس ياسمين الشام المدفوعة بالشبكة.
 */
export async function sendInvoiceToAlostaz(
  orderId: string,
  opts?: {
    phase?: TailoringInvoicePhase
    mode?: 'both' | 'cash' | 'network'
    /** مبلغ الدفعة الجديدة عند إضافة عربون من صفحة تعديل الطلب. */
    paymentAmount?: number
  }
): Promise<SendInvoiceResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { success: false, error: 'الجلسة منتهية — يرجى إعادة تسجيل الدخول' }
    }

    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      TAILORING_INVOICE_TIMEOUT_MS
    )

    const res = await fetch('/api/alostaz/send-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        orderId,
        phase: opts?.phase || 'manual',
        mode: opts?.mode,
        paymentAmount: opts?.paymentAmount,
      }),
      signal: controller.signal,
    }).finally(() => globalThis.clearTimeout(timeoutId))

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: result?.error || 'فشل إرسال الفاتورة' }
    }

    return {
      success: true,
      invoice_id: result?.data?.invoice_id,
      invoice_code: result?.data?.invoice_code,
      invoice_amount: result?.data?.invoice_amount,
      alreadySent: result?.data?.alreadySent,
      inProgress: result?.data?.inProgress,
      isDraft: result?.data?.draft,
      skipped: result?.data?.skipped,
      warning: result?.warning,
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'انتهت مهلة الاتصال بالمحاسبة قبل تأكيد رقم الفاتورة',
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'خطأ غير متوقع',
    }
  }
}

/** إرسال فاتورة مبيعة قماش إلى الأستاذ عبر المسار الخادمي. */
export async function sendFabricInvoiceToAlostaz(incomeId: string): Promise<SendInvoiceResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { success: false, error: 'الجلسة منتهية — يرجى إعادة تسجيل الدخول' }
    }

    const res = await fetch('/api/alostaz/send-fabric-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ incomeId }),
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: result?.error || 'فشل إرسال الفاتورة' }
    }

    return {
      success: true,
      invoice_id: result?.data?.invoice_id,
      invoice_code: result?.data?.invoice_code,
      alreadySent: result?.data?.alreadySent,
      inProgress: result?.data?.inProgress,
      isDraft: result?.data?.draft,
      warning: result?.warning,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ غير متوقع' }
  }
}

/** إضافة صنف مخزون كمنتج في الأستاذ (فرع بروكار الشرقية) — أفضل جهد، لا يوقف حفظ المخزون. */
export async function syncFabricProductToAlostaz(
  inventoryItemId: string
): Promise<{ success: boolean; product_id?: number; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { success: false, error: 'الجلسة منتهية' }

    const res = await fetch('/api/alostaz/sync-fabric-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ inventoryItemId }),
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: result?.error || 'فشل إضافة المنتج للأستاذ' }
    return { success: true, product_id: result?.data?.product_id }
  } catch (err: any) {
    return { success: false, error: err?.message || 'خطأ غير متوقع' }
  }
}

const AUTO_SEND_KEY = 'alostaz_auto_send'

/** قراءة حالة «الإرسال التلقائي» (افتراضياً متوقّف). */
export async function getAutoSendEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', AUTO_SEND_KEY)
      .maybeSingle()
    if (error) return false
    return !!(data?.value?.enabled)
  } catch {
    return false
  }
}

/** ضبط حالة «الإرسال التلقائي» (يتطلّب صلاحية مدير عبر RLS). */
export async function setAutoSendEnabled(enabled: boolean): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: AUTO_SEND_KEY, value: { enabled }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    return { error: error ? error.message : null }
  } catch (err: any) {
    return { error: err?.message || 'خطأ غير متوقع' }
  }
}

// ── الإرسال التلقائي لفواتير الأقمشة (مفتاح منفصل عن التفصيل) ──
const FABRICS_AUTO_SEND_KEY = 'alostaz_fabrics_auto_send'

/** قراءة حالة «الإرسال التلقائي» لفواتير الأقمشة (افتراضياً مفعّل ما لم يُوقَف صراحة). */
export async function getFabricsAutoSendEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', FABRICS_AUTO_SEND_KEY)
      .maybeSingle()
    if (error) return false
    return data?.value?.enabled !== false
  } catch {
    return false
  }
}

/** ضبط حالة «الإرسال التلقائي» لفواتير الأقمشة (يتطلّب صلاحية مدير عبر RLS). */
export async function setFabricsAutoSendEnabled(enabled: boolean): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: FABRICS_AUTO_SEND_KEY, value: { enabled }, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    return { error: error ? error.message : null }
  } catch (err: any) {
    return { error: err?.message || 'خطأ غير متوقع' }
  }
}
