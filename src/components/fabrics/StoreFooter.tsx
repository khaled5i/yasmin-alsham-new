import Link from 'next/link'
import { STORE_ENTITY, STORE_PAYMENT_METHODS, STORE_POLICY_LINKS, STORE_SUPPORT_PHONE } from '@/lib/store-legal'
import { IS_FABRIC_STORE_PAYMENTS_ENABLED } from '@/lib/fabric-store/checkout-contract'
import { FABRIC_COLLECTIONS, fabricCollectionPath } from '@/lib/fabric-collections'

/**
 * تذييل صفحات متجر الأقمشة: السياسات وهوية المنشأة والتواصل ووسائل الدفع.
 * المتاجر السعودية الثلاثة التي حلّلناها (الحطامي، العماري، هافانا) تضع هذه
 * البيانات أسفل كل صفحة، وصفحات المتجر لم يكن لها تذييل أصلاً.
 */
export default function StoreFooter() {
  return (
    <footer className="border-t border-[#d8c5ae] bg-[#f6f0e8] text-[#211b19]">
      <div className="container mx-auto grid gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <section className="min-w-0">
          <h2 className="text-base font-bold text-[#6b1726]">متجر أقمشة {STORE_ENTITY.brandName}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#211b19]/70">
            أقمشة سهرة مختارة، ومشغل تفصيل في المكان نفسه بمدينة {STORE_ENTITY.city}.
          </p>
        </section>

        <nav className="min-w-0" aria-label="مجموعات الأقمشة">
          <h2 className="text-base font-bold text-[#6b1726]">المجموعات</h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {FABRIC_COLLECTIONS.map(collection => (
              <li key={collection.slug}>
                <Link href={fabricCollectionPath(collection.slug)} className="text-[#211b19]/75 hover:text-[#6b1726] hover:underline">
                  {collection.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="min-w-0" aria-label="سياسات المتجر">
          <h2 className="text-base font-bold text-[#6b1726]">السياسات</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {STORE_POLICY_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-[#211b19]/75 hover:text-[#6b1726] hover:underline">{label}</Link>
              </li>
            ))}
            <li>
              <Link href="/fabrics/order" className="text-[#211b19]/75 hover:text-[#6b1726] hover:underline">تتبّعي طلبك</Link>
            </li>
          </ul>
        </nav>

        <section className="min-w-0">
          <h2 className="text-base font-bold text-[#6b1726]">تواصلي معنا</h2>
          <p className="mt-2 text-sm text-[#211b19]/75">
            واتساب واتصال:{' '}
            <a
              href={STORE_SUPPORT_PHONE.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#6b1726] hover:underline"
            >
              <bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi>
            </a>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#211b19]/65">{STORE_ENTITY.address}</p>
        </section>

        <section className="min-w-0">
          <h2 className="text-base font-bold text-[#6b1726]">بيانات المنشأة</h2>
          <dl className="mt-2 space-y-1 text-sm text-[#211b19]/70">
            <div>{STORE_ENTITY.legalName}</div>
            <div className="flex flex-wrap gap-x-1"><dt>السجل التجاري:</dt><dd><bdi dir="ltr">{STORE_ENTITY.commercialRegistration}</bdi></dd></div>
            <div className="flex flex-wrap gap-x-1"><dt>الرقم الضريبي:</dt><dd><bdi dir="ltr">{STORE_ENTITY.vatNumber}</bdi></dd></div>
          </dl>
          {IS_FABRIC_STORE_PAYMENTS_ENABLED && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="وسائل الدفع">
              {STORE_PAYMENT_METHODS.map(method => (
                <li key={method} className="rounded-md border border-[#d8c5ae] bg-white px-2 py-0.5 text-xs font-semibold text-[#211b19]/75">
                  {method}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </footer>
  )
}
