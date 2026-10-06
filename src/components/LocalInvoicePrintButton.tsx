'use client'

import { useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  buildTailoringReceiptHtml,
  type TailoringReceiptPayload,
} from '@/lib/print-tailoring-receipt'

const LABEL = 'اطبع الفاتورة'
const TITLE = 'طباعة الفاتورة الحرارية من الطابعة المتصلة بهذا الجهاز'

/**
 * زر «اطبع الفاتورة»: يطبع الورقة الحرارية (80mm) نفسها على طابعة هذا الجهاز عبر
 * نافذة الطباعة في المتصفح، بلا طابور ولا محطة. إعادة طباعة فقط: لا يغيّر أي سجل
 * ولا يفتح الدرج.
 *
 * النافذة تُفتح لحظة الضغط ثم تُملأ بعد تجهيز الورقة (قد تنتظر رمز QR من الأستاذ)،
 * حتى لا يحجبها المتصفح كنافذة منبثقة.
 */
export default function LocalInvoicePrintButton({
  loadPayload,
}: {
  /** يجهّز ورقة الطباعة؛ يرمي خطأ برسالة مفهومة إن تعذّر. */
  loadPayload: () => Promise<{ payload: TailoringReceiptPayload; warning?: string | null }>
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) {
      toast.error('اسمح بفتح النوافذ المنبثقة لهذا الموقع ثم أعد المحاولة')
      setLoading(false)
      return
    }
    win.document.title = 'جاري تجهيز الفاتورة…'
    win.document.body.style.cssText = 'font-family:sans-serif;direction:rtl;padding:24px;color:#475569'
    win.document.body.textContent = 'جاري تجهيز الفاتورة للطباعة…'

    try {
      const { payload, warning } = await loadPayload()
      if (win.closed) return
      const autoPrint =
        '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},300)};' +
        'window.onafterprint=function(){window.close()};</script>'
      const html = buildTailoringReceiptHtml(payload).replace('</body>', `${autoPrint}</body>`)
      win.document.open()
      win.document.write(html)
      win.document.close()
      if (warning) toast(warning, { icon: '⚠️', duration: 7000 })
    } catch (error) {
      win.close()
      toast.error(error instanceof Error ? error.message : 'تعذّر تجهيز الفاتورة للطباعة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void handleClick() }}
      disabled={loading}
      title={TITLE}
      className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
      {LABEL}
    </button>
  )
}
