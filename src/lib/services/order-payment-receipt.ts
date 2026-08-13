import {
  createAdditionalPaymentReceiptPayload,
  createPreliminaryTailoringReceiptPayload,
  type AdditionalOrderPaymentReceipt,
} from '@/lib/print-tailoring-receipt'
import { computePaymentBreakdown } from '@/lib/payment-breakdown'
import type { Order } from '@/lib/services/order-service'
import { sendInvoiceToAlostaz } from '@/lib/services/alostaz-client'
import { dispatchTailoringReceiptPrint } from '@/lib/services/tailoring-receipt-printer'

export interface IssueOrderPaymentReceiptResult {
  orderNumber: string
  invoiceCode: string
  accountingSynced: boolean
  accountingAlreadySent: boolean
  accountingWarning?: string
}

/**
 * المسار المشترك لفاتورة العربون عند إنشاء الطلب ولفواتير الدفعات المضافة
 * لاحقاً من صفحة التعديل.
 *
 * الكاش يُطبع محلياً فقط. الشبكة تُرسل أولاً إلى الأستاذ، ولا تُطبع الفاتورة
 * قبل استلام رقم الأستاذ حتى يتطابق المستندان.
 */
export async function issueOrderPaymentReceipt(
  order: Order,
  payment?: AdditionalOrderPaymentReceipt
): Promise<IssueOrderPaymentReceiptResult> {
  let accountingInvoiceCode = String(order.alostaz_deposit_invoice_code || '').trim()
  let accountingSynced = false
  let accountingAlreadySent = false
  let accountingWarning: string | undefined
  const networkAmount = payment
    ? payment.method === 'card' ? payment.amount : 0
    : computePaymentBreakdown(order).preDeliveryNetwork

  // الدفعة الإضافية يجب أن تطلب مزامنة جديدة حتى لو كان للطلب رقم فاتورة
  // عربون سابق. المسار الخادمي يحسب الزيادة ويرفض تكرارها ذرياً.
  if (networkAmount >= 0.005 && (payment || !accountingInvoiceCode)) {
    const result = await sendInvoiceToAlostaz(order.id, {
      phase: 'deposit',
      paymentAmount: payment?.amount,
    })
    accountingInvoiceCode = String(result.invoice_code || '').trim()
    accountingSynced = true

    if (!result.success) {
      throw new Error(result.error || 'تعذّر إرسال فاتورة عربون الشبكة للمحاسبة')
    }
    if (result.inProgress && !accountingInvoiceCode) {
      throw new Error('فاتورة العربون قيد الإرسال؛ انتظر ظهور رقمها من الأستاذ')
    }
    if (result.skipped) {
      throw new Error('لم تُرسل دفعة الشبكة إلى برنامج الأستاذ')
    }
    if (!accountingInvoiceCode) {
      throw new Error('لم يُرجع الأستاذ رقم فاتورة عربون الشبكة')
    }

    accountingAlreadySent = result.alreadySent === true
    accountingWarning = result.warning
  }

  const receipt = payment
    ? createAdditionalPaymentReceiptPayload(order, payment, accountingInvoiceCode)
    : createPreliminaryTailoringReceiptPayload(order, accountingInvoiceCode)

  await dispatchTailoringReceiptPrint(receipt, {
    openCashDrawer: payment ? payment.method === 'cash' : receipt.cash_amount >= 0.005,
    // لكل دفعة إضافية مفتاح مستقل؛ إعادة نفس الطلب لا تطبع نسخة ثانية.
    idempotencyKey: payment
      ? `tailoring:order-payment:${order.id}:${payment.id}:v1`
      : undefined,
  })

  return {
    orderNumber: receipt.order_number,
    invoiceCode: receipt.invoice_code,
    accountingSynced,
    accountingAlreadySent,
    accountingWarning,
  }
}
