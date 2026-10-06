import {
  createAdditionalPaymentReceiptPayload,
  createDepositReceiptPayloads,
  type AdditionalOrderPaymentReceipt,
  type TailoringReceiptPayload,
} from '@/lib/print-tailoring-receipt'
import { computePaymentBreakdown } from '@/lib/payment-breakdown'
import type { Order } from '@/lib/services/order-service'
import {
  fetchAlostazPrintableInvoice,
  sendInvoiceToAlostaz,
} from '@/lib/services/alostaz-client'
import { dispatchTailoringReceiptPrint } from '@/lib/services/tailoring-receipt-printer'

export interface IssueOrderPaymentReceiptResult {
  orderNumber: string
  invoiceCode: string
  accountingSynced: boolean
  accountingAlreadySent: boolean
  accountingWarning?: string
  /** فاتورة شبكة طُبعت دون رمز QR لأن الأستاذ لم يُرجعه في الوقت المتاح. */
  missingQr?: boolean
}

/**
 * المسار المشترك لأوراق العربون عند إنشاء الطلب ولأوراق الدفعات المضافة
 * لاحقاً من صفحة التعديل.
 *
 * كل دفعة تُطبع ورقة مستقلة بقيمتها كاملة: الشبكة تُرسل أولاً إلى الأستاذ
 * وتُطبع نسخة فاتورته (الرقم ورمز QR)، والكاش يُطبع إيصال استلام محلي.
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

  // آخر فاتورة عربون محفوظة على الطلب هي فاتورة هذه الدفعة (المسار الخادمي يحدّثها).
  const printable = networkAmount >= 0.005
    ? await fetchAlostazPrintableInvoice('order_deposit', order.id)
    : null
  // نتحقق أن النسخة المجلوبة هي نفس الفاتورة قبل طباعة رمزها.
  const matchingPrintable = printable && printable.invoice_code === accountingInvoiceCode
    ? printable
    : null
  const networkInvoice = accountingInvoiceCode
    ? { code: accountingInvoiceCode, printable: matchingPrintable }
    : null

  const papers: TailoringReceiptPayload[] = payment
    ? [createAdditionalPaymentReceiptPayload(order, payment, networkInvoice)]
    : createDepositReceiptPayloads(order, networkInvoice)

  for (const paper of papers) {
    await dispatchTailoringReceiptPrint(paper, {
      openCashDrawer: paper.cash_amount >= 0.005,
      // لكل دفعة إضافية مفتاح مستقل؛ إعادة نفس الطلب لا تطبع نسخة ثانية.
      idempotencyKey: payment
        ? `tailoring:order-payment:${order.id}:${payment.id}:v1`
        : undefined,
    })
  }

  const primary = papers.find((paper) => paper.document_kind === 'tax_invoice') || papers[0]
  return {
    orderNumber: primary.order_number,
    invoiceCode: primary.invoice_code,
    accountingSynced,
    accountingAlreadySent,
    accountingWarning,
    missingQr: networkAmount >= 0.005 && !matchingPrintable,
  }
}
