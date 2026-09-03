// ============================================================================
// فواتير ياسمين الشام للخياطة اليدوية (لوحة تحكم المدير)
// ----------------------------------------------------------------------------
// الشبكة → فاتورة «أجرة تفصيل فستان» في تطبيق الأستاذ.
// الكاش   → وارد يدوي في جدول income يرفع رصيد صندوق التفصيل، ولا يُرسَل للأستاذ.
// ============================================================================

import { supabase } from '../supabase'
import type { Income, PaymentMethod } from '@/types/simple-accounting'

export interface CreateTailoringInvoiceInput {
  /** معرّف ثابت لمحاولة الحفظ يمنع التكرار إذا انقطع رد الشبكة بعد النجاح */
  transactionId: string
  amount: number
  paymentMethod: PaymentMethod
  notes?: string
}

export interface CreateTailoringInvoiceResult {
  success: boolean
  income?: Income
  sentToAccounting?: boolean
  duplicate?: boolean
  warning?: string
  error?: string
}

export async function createTailoringInvoice(
  input: CreateTailoringInvoiceInput
): Promise<CreateTailoringInvoiceResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { success: false, error: 'الجلسة منتهية — يرجى إعادة تسجيل الدخول' }
    }

    const response = await fetch('/api/tailoring/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      return {
        success: false,
        error: result?.error || 'تعذّر حفظ فاتورة ياسمين الشام للخياطة',
      }
    }

    return {
      success: true,
      income: result?.data,
      sentToAccounting: result?.sentToAccounting,
      duplicate: result?.duplicate,
      warning: result?.warning,
    }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
    }
  }
}
