import { supabase } from '../supabase'

export type WomenWorkshopOperationType =
  | 'external_measurement'
  | 'fitting'
  | 'bridal_measurement'
  | 'dress_alteration'
  | 'other'
  | 'order_measurement'

export type WomenWorkshopPaymentMethod = 'cash' | 'card'

export type WomenWorkshopSyncStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'review_required'
  | 'not_required'

export interface WomenWorkshopTransaction {
  id: string
  source: 'manual_invoice' | 'order_measurement'
  operation_type: WomenWorkshopOperationType
  operation_name: string
  amount: number
  payment_method: WomenWorkshopPaymentMethod
  order_id?: string | null
  customer_name?: string | null
  created_by?: string | null
  occurred_at: string
  alostaz_customer_id?: number | null
  alostaz_invoice_id?: number | null
  alostaz_invoice_code?: string | null
  alostaz_sync_status: WomenWorkshopSyncStatus
  alostaz_sync_error?: string | null
  alostaz_synced_at?: string | null
  created_at: string
  updated_at: string
}

export interface WomenWorkshopOperationOption {
  value: Exclude<WomenWorkshopOperationType, 'order_measurement'>
  label: string
  defaultAmount: number | null
}

export const WOMEN_WORKSHOP_OPERATION_OPTIONS: WomenWorkshopOperationOption[] = [
  { value: 'external_measurement', label: 'مقاس خارجي', defaultAmount: 85 },
  { value: 'fitting', label: 'بروفا', defaultAmount: 50 },
  { value: 'bridal_measurement', label: 'مقاس عروس', defaultAmount: 150 },
  { value: 'dress_alteration', label: 'تعديل فستان', defaultAmount: null },
  { value: 'other', label: 'أخرى', defaultAmount: null },
]

export interface CreateWomenWorkshopInvoiceInput {
  transactionId: string
  operationType: Exclude<WomenWorkshopOperationType, 'order_measurement'>
  customOperationName?: string
  amount: number
  paymentMethod: WomenWorkshopPaymentMethod
}

export interface CreateWomenWorkshopInvoiceResult {
  success: boolean
  transaction?: WomenWorkshopTransaction
  sentToAccounting?: boolean
  duplicate?: boolean
  warning?: string
  error?: string
}

export async function createWomenWorkshopInvoice(
  input: CreateWomenWorkshopInvoiceInput
): Promise<CreateWomenWorkshopInvoiceResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { success: false, error: 'الجلسة منتهية — يرجى إعادة تسجيل الدخول' }
    }

    const response = await fetch('/api/women-workshop/invoices', {
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
        error: result?.error || 'تعذّر حفظ فاتورة المشغل النسائي',
      }
    }

    return {
      success: true,
      transaction: result?.data,
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

export async function getWomenWorkshopTransactions(): Promise<{
  data: WomenWorkshopTransaction[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('women_workshop_transactions')
    .select('*')
    .order('occurred_at', { ascending: false })

  return {
    data: (data || []) as WomenWorkshopTransaction[],
    error: error?.message || null,
  }
}
