// ============================================================================
// خدمة طابور الطباعة عن بُعد (print_jobs) — migration 63
// ----------------------------------------------------------------------------
// صفحة مبيعات الأقمشة تُرسل طلب طباعة (queueFabricReceiptPrint) → محطة الطباعة على الكاشير
// تجلب المعلّق (getPendingPrintJobs)، تطالب به ذرياً (claimPrintJob) ثم تنهيه.
// ============================================================================

import { supabase } from '@/lib/supabase'
import type { Income } from '@/types/simple-accounting'
import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'

export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'error'

export interface PrintJob<TPayload = Income> {
  id: string
  branch: string
  job_type: string
  income_id: string | null
  payload: TPayload
  status: PrintJobStatus
  error_message: string | null
  printed_at: string | null
  created_at: string
}

const FABRICS_BRANCH = 'fabrics'
const TAILORING_BRANCH = 'tailoring'

/**
 * إرسال طلب طباعة فاتورة بيع قماش إلى الطابور (يُستدعى من صفحة المبيعات على أي جهاز).
 * نخزّن نسخة كاملة من بيانات البيع (payload) حتى تُطبع كما أُرسلت حتى لو تغيّر السجل لاحقاً.
 */
export async function queueFabricReceiptPrint(item: Income): Promise<void> {
  const { error } = await supabase.from('print_jobs').insert({
    branch: FABRICS_BRANCH,
    job_type: 'fabric_sale_receipt',
    income_id: item.id,
    payload: item,
    status: 'pending',
  })
  if (error) throw error
}

/** إرسال إيصال طلب تفصيل إلى محطة الطابعة عند تحويل الطلب إلى «تم التسليم». */
export async function queueTailoringReceiptPrint(payload: TailoringReceiptPayload): Promise<void> {
  const { error } = await supabase.from('print_jobs').insert({
    branch: TAILORING_BRANCH,
    job_type: 'tailoring_order_receipt',
    // العمود مرجع عام للسجل في طابور الطباعة؛ لا يوجد عليه قيد مفتاح أجنبي.
    income_id: payload.order_id,
    payload,
    status: 'pending',
  })
  if (error) throw error
}

/** جلب الطلبات المعلّقة بالترتيب (تُستدعى عند بدء تشغيل المحطة + بعد كل حدث Realtime). */
export async function getPendingPrintJobs<TPayload = Income>(
  branch: string = FABRICS_BRANCH
): Promise<PrintJob<TPayload>[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('branch', branch)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PrintJob<TPayload>[]
}

/**
 * مطالبة ذرية بطلب: pending → printing.
 * الشرط `.eq('status', 'pending')` في UPDATE ذرّي على مستوى الصف في Postgres،
 * فلو فُتحت المحطة على جهازين لن ينجح إلا واحد؛ الخاسر يحصل على null (لا طباعة مزدوجة).
 */
export async function claimPrintJob<TPayload = Income>(id: string): Promise<PrintJob<TPayload> | null> {
  const { data, error } = await supabase
    .from('print_jobs')
    .update({ status: 'printing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle()
  if (error) throw error
  return (data as PrintJob<TPayload>) ?? null
}

/** إنهاء الطلب بنجاح. */
export async function markPrintJobDone(id: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'done', printed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** تعليم الطلب كفاشل مع رسالة مختصرة. */
export async function markPrintJobError(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'error', error_message: message.slice(0, 500) })
    .eq('id', id)
  if (error) throw error
}

/** إعادة طلب فاشل إلى المعلّقات (زر "إعادة المحاولة" في المحطة). */
export async function retryPrintJob(id: string): Promise<void> {
  const { error } = await supabase
    .from('print_jobs')
    .update({ status: 'pending', error_message: null })
    .eq('id', id)
  if (error) throw error
}
