import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import {
  SELLER_VAT_NUMBER,
  TAX_INVOICE_TITLE,
  roundMoney,
  splitInclusiveVat,
  type AlostazPrintableInvoice,
} from '@/lib/zatca-invoice'
import type { WomenWorkshopTransaction } from '@/lib/services/women-workshop-service'

/** نوع مهمة فاتورة المشغل النسائي في طابور محطة التعديلات (طابعة الورشة). */
export const WOMEN_WORKSHOP_RECEIPT_JOB_TYPE = 'women_workshop_receipt'

/**
 * فاتورة عملية من المشغل النسائي، بنفس بنية فاتورة التفصيل (تطبيق محطة
 * التعديلات يرسمها بنفس المحرّك).
 * - الشبكة: نسخة فاتورة الأستاذ برقمها ورمز QR الموقّع.
 * - الكاش: نفس التصميم والصياغة، لكن بلا رقم فاتورة وبلا رمز (لا يُرسل للأستاذ).
 */
export function createWomenWorkshopReceiptPayload(
  transaction: WomenWorkshopTransaction,
  printable: AlostazPrintableInvoice | null
): TailoringReceiptPayload {
  const isNetwork = transaction.payment_method === 'card'
  const invoiceCode = isNetwork ? String(transaction.alostaz_invoice_code || '').trim() : ''
  if (isNetwork && !invoiceCode) {
    throw new Error('فاتورة الشبكة تُطبع بعد وصول رقمها من برنامج الأستاذ')
  }

  const matching = isNetwork && printable && printable.invoice_code === invoiceCode && printable.total > 0
    ? printable
    : null
  const fallback = splitInclusiveVat(Number(transaction.amount) || 0)
  const amount = matching ? matching.total : fallback.total
  const reference = String(transaction.id || '').replace(/[^0-9a-f]/gi, '').slice(-6).toUpperCase()

  return {
    order_id: transaction.id,
    // تطبيق المحطة يشترط رقماً مرجعياً؛ العملية ليست طلباً فلا يُطبع ملخص طلب.
    order_number: `W-${reference || '000000'}`,
    invoice_code: invoiceCode,
    invoice_code_source: isNetwork ? 'alostaz' : 'local',
    receipt_type: 'delivery',
    document_kind: isNetwork ? 'tax_invoice' : 'cash_receipt',
    document_title: TAX_INVOICE_TITLE,
    customer_name: String(transaction.customer_name || 'عميل'),
    item_description: String(transaction.operation_name || 'خدمة المشغل النسائي'),
    total: amount,
    invoice_total: amount,
    total_without_vat: matching ? matching.total_without_vat : fallback.beforeVat,
    vat_amount: matching ? matching.vat : fallback.vat,
    vat_number: SELLER_VAT_NUMBER,
    ...(isNetwork ? { zatca_qr: matching?.qr || null } : {}),
    paid_amount: roundMoney(amount),
    cash_amount: isNetwork ? 0 : amount,
    network_amount: isNetwork ? amount : 0,
    received_payment_method: isNetwork ? 'card' : 'cash',
    delivered_at: String(transaction.occurred_at || new Date().toISOString()),
    show_order_summary: false,
  }
}
