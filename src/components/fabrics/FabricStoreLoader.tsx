/**
 * مؤشر التحميل الموحّد لمتجر الأقمشة: شعار ياسمين الشام «يتنفّس» ويمرّ عليه لمعان،
 * وتحته شريط ذهبي متحرك — بلا نص. بلا 'use client' حتى يصلح داخل loading.tsx على الخادم.
 * الحركة تتوقف لمن فعّل «تقليل الحركة» (globals.css).
 */
export default function FabricStoreLoader({
  size = 'md',
  fullScreen = false,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** غطاء ثابت يملأ الشاشة ويخفي كل ما خلفه (الرأس، البحث، زر واتساب) حتى يكتمل التحميل */
  fullScreen?: boolean
}) {
  const logoHeight = size === 'sm' ? 'h-12' : size === 'lg' ? 'h-24 sm:h-28' : 'h-16 sm:h-20'

  const content = (
    <div role="status" aria-label="جارٍ التحميل" className="flex flex-col items-center justify-center gap-4">
      <div className="fabric-loader-logo relative overflow-hidden">
        <img
          src="/fabric-store-logo.png"
          alt=""
          width={480}
          height={272}
          className={`${logoHeight} w-auto select-none`}
          draggable={false}
        />
        <span className="fabric-loader-shine pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>
      <span className="relative block h-[3px] w-28 overflow-hidden rounded-full bg-[#d8c5ae]/50 sm:w-32" aria-hidden="true">
        <span className="fabric-loader-bar absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-l from-[#b99a68] via-[#6b1726] to-[#b99a68]" />
      </span>
    </div>
  )

  if (!fullScreen) return size === 'sm' ? content : <div className="py-16 sm:py-20">{content}</div>

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#fbf8f3] px-4">
      {content}
    </div>
  )
}
