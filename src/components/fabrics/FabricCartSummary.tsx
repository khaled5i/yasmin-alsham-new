'use client'

import { Info, Loader2, MessageCircle } from 'lucide-react'
import { FABRIC_VAT_RATE, type FabricCartTotals, type ResolvedFabricCartLine } from '@/lib/fabric-commerce'
import { buildCartInquiryLink } from '@/lib/fabric-cart-whatsapp'
import { formatFabricNumber } from '@/lib/fabric-number-format'

interface FabricCartSummaryProps {
  lines: ResolvedFabricCartLine[]
  totals: FabricCartTotals
}

/**
 * ملخّص السلة.
 *
 * الخطوة التالية في هذه المرحلة هي استفسار واتساب لا دفع: لا يوجد زر دفع
 * يعمل شكلياً. يُستبدل ببدء checkout خلف إعداد تفعيل عند اكتمال الخطة الثانية.
 */
export default function FabricCartSummary({ lines, totals }: FabricCartSummaryProps) {
  // لا يُرسل استفسار قبل اكتمال التحقق من الخادم: الإجمالي سيكون ناقصاً
  // والرسالة ستصف أقمشة لم تصل بياناتها بعد.
  const isVerifying = lines.some(line => line.status === 'pending')
  const canSend = lines.length > 0 && !isVerifying
  const inquiryLink = buildCartInquiryLink(lines, totals)

  return (
    <div className="rounded-2xl border-2 border-[#d8c5ae] bg-[#f6f0e8] p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold text-[#211b19]">ملخّص السلة</h2>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[#211b19]/70">المجموع قبل الضريبة</dt>
          <dd className="font-semibold text-[#211b19]">{formatFabricNumber(totals.subtotal)} ريال</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[#211b19]/70">
            ضريبة القيمة المضافة ({Math.round(FABRIC_VAT_RATE * 100)}%)
          </dt>
          <dd className="font-semibold text-[#211b19]">{formatFabricNumber(totals.vat)} ريال</dd>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-[#d8c5ae] pt-3">
          <dt className="font-bold text-[#211b19]">الإجمالي التقديري</dt>
          <dd className="text-xl font-bold text-[#6b1726]">{formatFabricNumber(totals.total)} ريال</dd>
        </div>
      </dl>

      {totals.blockedCount > 0 && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-xs font-semibold text-[#6b1726]"
        >
          {totals.blockedCount === 1
            ? 'عنصر واحد في السلة غير محتسب في الإجمالي — راجعي حالته أعلاه.'
            : `${formatFabricNumber(totals.blockedCount)} عناصر في السلة غير محتسبة في الإجمالي — راجعي حالتها أعلاه.`}
        </p>
      )}

      <a
        href={inquiryLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!canSend}
        onClick={event => {
          if (!canSend) event.preventDefault()
        }}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f0e8] ${
          canSend
            ? 'bg-[#6b1726] text-[#f6f0e8] shadow-lg hover:bg-[#2f0c14] hover:shadow-xl'
            : 'pointer-events-none bg-[#d8c5ae]/60 text-[#211b19]/40'
        }`}
      >
        {isVerifying ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        )}
        <span>
          {isVerifying
            ? 'جاري التحقق من الأقمشة...'
            : 'إرسال استفسار عن السلة عبر واتساب'}
        </span>
      </a>

      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-[#211b19]/65">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 text-[#6b1726]" aria-hidden="true" />
        <span>
          هذا استفسار وليس طلباً مدفوعاً، ولا يحجز الكمية لكِ. الأسعار هنا تقديرية،
          ويُعتمد السعر النهائي عند التأكيد معنا.
        </span>
      </p>
    </div>
  )
}
