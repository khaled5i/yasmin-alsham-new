'use client'

import { useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'

/**
 * «ادفعي الآن»: يطلب من خادمنا صفحة دفع ميسر لطلب هذا المتصفح (كوكي الوصول)
 * ثم ينتقل إليها. المبلغ يحدده الخادم من الطلب، لا المتصفح. ضغطتان متتاليتان
 * تعيدان الصفحة نفسها (الخادم يعيد الفاتورة المفتوحة).
 */
export default function FabricPayNowButton({ label = 'ادفعي الآن' }: { label?: string }) {
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setIsStarting(true)
    setError(null)
    try {
      const response = await fetch('/api/fabric-store/payment/start/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      })
      const data = (await response.json().catch(() => null)) as { ok?: boolean; checkoutUrl?: string; error?: string } | null
      if (response.ok && data?.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        return // تبقى حالة التحميل حتى تنتقل الصفحة
      }
      setError(data?.error || 'تعذّر بدء الدفع الآن، أعيدي المحاولة')
    } catch {
      setError('انقطع الاتصال — أعيدي المحاولة')
    }
    setIsStarting(false)
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={isStarting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6b1726] px-6 py-3.5 font-bold text-[#f6f0e8] shadow-lg transition-all duration-300 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] disabled:cursor-wait disabled:opacity-70"
      >
        {isStarting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CreditCard className="h-5 w-5" aria-hidden="true" />}
        <span>{isStarting ? 'جاري فتح صفحة الدفع...' : label}</span>
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#6b1726]/10 px-3 py-2 text-sm font-semibold text-[#6b1726]">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-[#211b19]/60">الدفع في صفحة ميسر الآمنة؛ بيانات بطاقتك لا تمر بموقعنا.</p>
    </div>
  )
}
