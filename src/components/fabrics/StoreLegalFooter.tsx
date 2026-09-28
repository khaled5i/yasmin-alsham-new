import Link from 'next/link'
import { MapPin, MessageCircle, Phone } from 'lucide-react'
import {
  STORE_ENTITY,
  STORE_PAYMENT_METHODS,
  STORE_POLICY_LINKS,
  STORE_SUPPORT_PHONE,
} from '@/lib/store-legal'

/**
 * فوتر متجر الأقمشة: هوية المنشأة الرسمية (السجل والرقم الضريبي والعنوان)، وروابط
 * السياسات، ووسائل التواصل والدفع — إفصاحات يشترطها ميسر ونظام التجارة الإلكترونية.
 */
export default function StoreLegalFooter() {
  return (
    <footer className="border-t-2 border-[#d8c5ae] bg-[#2f0c14] px-4 py-8 text-sm text-[#f6f0e8]/85">
      <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-base font-bold text-[#f6f0e8]">{STORE_ENTITY.brandName} — متجر الأقمشة</p>
          <p>{STORE_ENTITY.legalName}</p>
          <p>السجل التجاري: <bdi dir="ltr">{STORE_ENTITY.commercialRegistration}</bdi></p>
          <p>الرقم الضريبي: <bdi dir="ltr">{STORE_ENTITY.vatNumber}</bdi></p>
        </div>

        <nav aria-label="سياسات المتجر" className="flex flex-col gap-1.5">
          <p className="font-bold text-[#f6f0e8]">السياسات</p>
          {STORE_POLICY_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="hover:text-white hover:underline">{link.label}</Link>
          ))}
        </nav>

        <div className="space-y-1.5">
          <p className="font-bold text-[#f6f0e8]">خدمة العملاء</p>
          <a href={`tel:${STORE_SUPPORT_PHONE.e164}`} className="flex items-center gap-1.5 hover:text-white">
            <Phone className="h-4 w-4" aria-hidden="true" /> <bdi dir="ltr">{STORE_SUPPORT_PHONE.display}</bdi>
          </a>
          <a href={STORE_SUPPORT_PHONE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> واتساب
          </a>
          <Link href="/location" className="flex items-start gap-1.5 hover:text-white">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {STORE_ENTITY.address}
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[#f6f0e8]/15 pt-4">
        <ul className="flex flex-wrap gap-2" aria-label="وسائل الدفع">
          {STORE_PAYMENT_METHODS.map(method => (
            <li key={method} className="rounded-md bg-[#f6f0e8] px-2.5 py-1 text-xs font-bold text-[#2f0c14]">{method}</li>
          ))}
        </ul>
        <p className="text-xs text-[#f6f0e8]/60">الأسعار بالريال السعودي، وتُضاف ضريبة القيمة المضافة 15% ويظهر الإجمالي قبل الدفع. © 2026 {STORE_ENTITY.legalName}</p>
      </div>
    </footer>
  )
}
