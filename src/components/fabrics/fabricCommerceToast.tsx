'use client'

import Link from 'next/link'
import { Heart, ShoppingBag, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface FabricCommerceToastOptions {
  kind: 'cart' | 'favorite'
  /** العنوان الرئيسي، مثل «أُضيف إلى السلة». */
  title: string
  /** اسم القماش ووصف قصير تحته (الكمية مثلاً). */
  label: string
  detail?: string
  image?: string | null
  /** إزالة من المفضلة: رسالة هادئة بلا زر انتقال. */
  removed?: boolean
}

/**
 * رسالة الإضافة للسلة/المفضلة: بطاقة صغيرة فيها صورة القماش واسمه وزر
 * «عرض السلة» (أو «عرض المفضلة»). id ثابت لكل نوع حتى لا تتكدّس الرسائل
 * عند الضغط المتكرر — الجديدة تحل محل القديمة.
 */
export function showFabricCommerceToast({ kind, title, label, detail, image, removed = false }: FabricCommerceToastOptions) {
  const Icon = kind === 'cart' ? ShoppingBag : Heart
  const href = kind === 'cart' ? '/fabrics/cart/' : '/fabrics/favorites/'
  const actionLabel = kind === 'cart' ? 'عرض السلة' : 'عرض المفضلة'

  toast.custom(
    t => (
      <div
        dir="rtl"
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex w-[min(92vw,24rem)] items-center gap-3 rounded-2xl border border-[#d8c5ae] bg-[#fbf8f3] p-3 shadow-2xl transition-all duration-300 ${
          t.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}
        style={{ fontFamily: 'var(--font-cairo)' }}
      >
        <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-xl border border-[#d8c5ae]/70 bg-[#f6f0e8]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[#6b1726]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <span className="absolute -bottom-px -left-px flex h-5 w-5 items-center justify-center rounded-tr-lg bg-[#6b1726] text-[#f6f0e8]">
            <Icon className={`h-3 w-3 ${kind === 'favorite' && !removed ? 'fill-[#f6f0e8]' : ''}`} aria-hidden="true" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#6b1726]">{title}</p>
          <p className="truncate text-xs font-semibold text-[#211b19]">{label}</p>
          {detail && <p className="truncate text-[11px] text-[#211b19]/60">{detail}</p>}
        </div>

        {!removed && (
          <Link
            href={href}
            onClick={() => toast.dismiss(t.id)}
            className="shrink-0 rounded-xl bg-[#6b1726] px-3 py-2 text-xs font-bold text-[#f6f0e8] transition-colors duration-200 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
          >
            {actionLabel}
          </Link>
        )}

        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          aria-label="إغلاق"
          className="shrink-0 self-start rounded-full p-1 text-[#211b19]/45 transition-colors hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    ),
    { id: `fabric-commerce-${kind}`, duration: 4000 }
  )
}
