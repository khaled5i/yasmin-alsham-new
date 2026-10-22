import { RotateCcw, ShieldCheck, Store, Truck, type LucideIcon } from 'lucide-react'
import {
  FABRIC_STORE_FREE_SHIPPING_MIN_ITEMS_GROSS_HALALAS,
  IS_FABRIC_STORE_CHECKOUT_ENABLED,
  IS_FABRIC_STORE_PAYMENTS_ENABLED,
} from '@/lib/fabric-store/checkout-contract'
import { STORE_RETURN_RULES } from '@/lib/store-legal'

/**
 * وعود المتجر الظاهرة للزبونة: شريط الضمانات.
 * كل رقم هنا مقروء من مصدر السياسة نفسه (عتبة الشحن المجاني، مدة الإرجاع)
 * فلا يختلف ما يُعلَن عمّا تحسبه صفحة الدفع. وعود الشحن والدفع لا تظهر ما دام
 * مفتاح الدفع الإلكتروني مطفأً.
 */

const freeShippingSar = FABRIC_STORE_FREE_SHIPPING_MIN_ITEMS_GROSS_HALALAS / 100

interface TrustItem {
  icon: LucideIcon
  title: string
  detail?: string
}

function trustItems(): TrustItem[] {
  const items: TrustItem[] = []
  if (IS_FABRIC_STORE_CHECKOUT_ENABLED) {
    items.push({
      icon: Truck,
      title: 'شحن لكل مدن المملكة',
      detail: `مجاني فوق ${freeShippingSar} ريال`,
    })
  }
  // الدفع الآمن ثانياً والاستلام من المحل آخراً (طلب المالكة)
  if (IS_FABRIC_STORE_PAYMENTS_ENABLED) {
    items.push({ icon: ShieldCheck, title: 'دفع آمن', detail: 'مدى · Apple Pay · Visa' })
  }
  if (IS_FABRIC_STORE_CHECKOUT_ENABLED) {
    items.push({ icon: RotateCcw, title: `إرجاع خلال ${STORE_RETURN_RULES.returnWindowDays} أيام` })
  }
  items.push({ icon: Store, title: 'استلام من محلنا بالخبر' })
  return items
}

// أسماء كاملة لا تُركَّب، حتى يولّدها Tailwind.
const DESKTOP_COLUMNS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' }

/** أربعة ضمانات في صف واحد على الكمبيوتر وشبكة 2×2 على الجوال. */
export function StoreTrustStrip({ className = '', compact = false }: {
  className?: string
  /** عمودان دائماً، لعمود ضيّق مثل صفحة القماش. */
  compact?: boolean
}) {
  const items = trustItems()
  const columns = compact ? '' : (DESKTOP_COLUMNS[items.length] ?? 'lg:grid-cols-4')
  return (
    <ul
      className={`grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-[#d8c5ae]/70 bg-[#f6f0e8] p-4 sm:p-5 ${columns} ${className}`}
      aria-label="ضمانات المتجر"
    >
      {items.map(({ icon: Icon, title, detail }) => (
        <li key={title} className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#6b1726]" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#211b19]">{title}</span>
            {detail && <span className="block text-xs leading-relaxed text-[#211b19]/65">{detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
