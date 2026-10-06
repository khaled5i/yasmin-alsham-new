import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { fetchAlostazPrintableInvoice } from '@/lib/services/alostaz-client'
import { enqueueWomenWorkshopReceiptPrint } from '@/lib/services/alteration-print-job-service'
import { createWomenWorkshopReceiptPayload } from '@/lib/print-women-workshop-receipt'
import type { WomenWorkshopTransaction } from '@/lib/services/women-workshop-service'

/**
 * يطبع فاتورة عملية من المشغل النسائي على طابعة الورشة (الشبكة بنسخة فاتورة الأستاذ،
 * والكاش بنفس الشكل بلا رقم فاتورة وبلا رمز).
 * المفتاح ثابت لكل عملية، فاستدعاؤه مرتين لا يطبع نسختين.
 * فشل الطباعة لا يلغي العملية المحفوظة ولا فاتورة المحاسبة.
 */
export async function printWomenWorkshopInvoice(transaction: WomenWorkshopTransaction): Promise<void> {
  try {
    // الكاش لا يُرسل للأستاذ: لا رقم فاتورة ولا رمز، فلا داعي لسؤال المحاسبة.
    const isNetwork = transaction.payment_method === 'card'
    const printable = isNetwork
      ? await fetchAlostazPrintableInvoice('women_workshop', transaction.id)
      : null
    const payload = createWomenWorkshopReceiptPayload(transaction, printable)
    await enqueueWomenWorkshopReceiptPrint(payload)
    toast.success(
      `أُضيفت ${payload.invoice_code ? 'الفاتورة ' + payload.invoice_code : 'فاتورة الكاش'} إلى طابعة الورشة`,
      { icon: '🧾' }
    )
    if (isNetwork && !payload.zatca_qr) {
      toast('تعذّر جلب رمز QR من الأستاذ الآن؛ طُبعت الفاتورة بدونه.', {
        icon: '⚠️',
        duration: 7000,
      })
    }
  } catch (printError) {
    const message = printError instanceof Error ? printError.message : String(printError || '')
    toast.error(`تعذّرت طباعة الفاتورة على طابعة الورشة: ${message}`, { duration: 9000 })
  }
}

/**
 * أجرة المقاس (شبكة) تُنسخ تلقائياً من الطلب إلى سجل المشغل النسائي عبر trigger
 * ومعها رقم فاتورة الأستاذ؛ نطبع من ذلك السجل كي تتطابق الورقة مع التقرير.
 */
export async function printOrderMeasurementInvoice(orderId: string): Promise<void> {
  const { data, error } = await supabase
    .from('women_workshop_transactions')
    .select('*')
    .eq('source', 'order_measurement')
    .eq('order_id', orderId)
    .maybeSingle()

  if (error || !data?.alostaz_invoice_code) {
    toast('فاتورة أجرة المقاس لم تُطبع لأن رقمها لم يظهر بعد في سجل المشغل النسائي.', {
      icon: '🧾',
      duration: 7000,
    })
    return
  }

  await printWomenWorkshopInvoice(data as WomenWorkshopTransaction)
}
