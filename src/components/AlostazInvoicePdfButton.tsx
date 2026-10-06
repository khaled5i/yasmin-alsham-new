'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  fetchAlostazInvoicePdfUrl,
  type AlostazInvoicePdfRef,
} from '@/lib/services/alostaz-client'

const LABEL = 'تنزيل الفاتورة'
const TITLE = 'فاتورة ضريبية مبسطة (PDF) من الأستاذ'

/**
 * زر «تنزيل الفاتورة»: يفتح ملف PDF الرسمي الذي يولّده الأستاذ لفاتورة شبكة واحدة
 * في تبويب جديد، ومنه يُنزَّل الملف. لا يُعرض لعمليات الكاش (المرجع null).
 *
 * التبويب يُفتح لحظة الضغط ثم يُوجَّه للرابط بعد وصوله، حتى لا يحجبه المتصفح
 * كنافذة منبثقة بعد انتظار الشبكة.
 */
export default function AlostazInvoicePdfButton({
  invoiceRef,
  variant = 'pill',
}: {
  invoiceRef: AlostazInvoicePdfRef | null
  /** pill: زر صغير بجانب رقم الفاتورة — icon: أيقونة ضمن صف أزرار الإجراءات */
  variant?: 'pill' | 'icon'
}) {
  const [loading, setLoading] = useState(false)
  if (!invoiceRef) return null

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const tab = window.open('', '_blank')
    if (tab) {
      tab.opener = null
      tab.document.title = 'جاري تجهيز الفاتورة…'
      tab.document.body.style.cssText = 'font-family:sans-serif;direction:rtl;padding:24px;color:#475569'
      tab.document.body.textContent = 'جاري تجهيز ملف الفاتورة من الأستاذ…'
    }

    try {
      const { url } = await fetchAlostazInvoicePdfUrl(invoiceRef)
      if (tab && !tab.closed) {
        tab.location.replace(url)
      } else if (!window.open(url, '_blank', 'noopener')) {
        toast.error('اسمح بفتح النوافذ المنبثقة لهذا الموقع ثم أعد المحاولة')
      }
    } catch (error) {
      tab?.close()
      toast.error(error instanceof Error ? error.message : 'تعذّر جلب ملف الفاتورة من الأستاذ')
    } finally {
      setLoading(false)
    }
  }

  const Icon = loading ? Loader2 : FileDown
  const iconClass = `h-4 w-4 ${loading ? 'animate-spin' : ''}`

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => { void handleClick() }}
        disabled={loading}
        className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-50"
        title={`${LABEL} — ${TITLE}`}
        aria-label={LABEL}
      >
        <Icon className={iconClass} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { void handleClick() }}
      disabled={loading}
      title={TITLE}
      className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 disabled:opacity-60"
    >
      <Icon className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
      {LABEL}
    </button>
  )
}
