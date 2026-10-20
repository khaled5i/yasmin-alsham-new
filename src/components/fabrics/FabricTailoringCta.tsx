'use client'

import { MessageCircle, Scissors } from 'lucide-react'
import type { Fabric } from '@/store/fabricStore'
import { HOME_WHATSAPP_NUMBER } from '@/components/home/home-data'

const SITE_URL = 'https://www.yasmin-alsham.fashion'

/**
 * «فصّليه في مشغلنا»: الميزة التي لا يملكها أي منافس حلّلناه — القماش والتفصيل في
 * مكان واحد. يفتح واتساب قسم التفصيل برسالة فيها كود القماش ورابطه، ويجيب أيضاً
 * عن سؤال «كم متراً أحتاج؟» بدل أرقام عامة لا تناسب كل مقاس (قرار المالكة 20 أكتوبر).
 */
export default function FabricTailoringCta({ fabric }: { fabric?: Pick<Fabric, 'id' | 'name' | 'fabric_code'> }) {
  const message = fabric
    ? `مرحباً، أعجبني هذا القماش وأرغب في تفصيله لديكم: ${[fabric.name?.trim(), fabric.fabric_code].filter(Boolean).join(' — ') || 'قماش من المتجر'}\n${SITE_URL}/fabrics/${fabric.id}/`
    : 'مرحباً، أرغب في تفصيل فستان من قماش في متجر ياسمين الشام وأحتاج مساعدة في الاختيار.'
  const href = `https://wa.me/${HOME_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`

  return (
    <section
      className="rounded-2xl border border-[#d8c5ae]/70 bg-[#fbf8f3] p-4 sm:p-5"
      aria-labelledby="fabric-tailoring-title"
    >
      <h2 id="fabric-tailoring-title" className="flex items-center gap-2 text-base font-bold text-[#6b1726]">
        <Scissors className="h-4 w-4" aria-hidden="true" />
        فصّليه في مشغل ياسمين الشام
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[#211b19]/70">
        {fabric
          ? 'أرسلي لنا هذا القماش، ونساعدك في اختيار التصميم وحساب الكمية المناسبة لمقاسك قبل الشراء.'
          : 'اختاري قماشك ونفصّله لكِ في مشغلنا بالخبر، ونساعدك في التصميم وحساب الكمية المناسبة لمقاسك.'}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // التتبّع من المستمع العام في SiteInsights؛ onClick هنا كان يعدّ الضغطة مرتين
        data-wa-placement={fabric ? 'fabric_tailoring_cta' : 'collection_tailoring_cta'}
        data-wa-item={fabric ? fabric.fabric_code?.trim() || fabric.id : undefined}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border-2 border-[#6b1726] px-4 py-2 text-sm font-semibold text-[#6b1726] transition-colors hover:bg-[#6b1726] hover:text-[#f6f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        تواصلي مع المشغل
      </a>
    </section>
  )
}
