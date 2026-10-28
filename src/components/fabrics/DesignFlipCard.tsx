'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * بطاقة قماش تنقلب مرة واحدة لتعرض أول تصميم نهائي له، ثم تعود لصورة القماش بعد ثانيتين.
 *
 * البطاقات لا تنقلب معاً: طابور واحد مشترك يقلب أول بطاقة ظاهرة على الشاشة
 * بعد ثانيتين من ظهورها، ثم التي تليها بعد ثانيتين أخريين، وهكذا بترتيب الصفحة.
 * حتى لا يتأثر تحميل الموقع:
 * - صورة التصميم لا تُطلب إلا لبطاقة حان دورها (ظاهرة فعلاً)، وبأولوية منخفضة،
 *   ولا تنقلب البطاقة قبل أن تكتمل الصورة وتُفك.
 * - مراقب ظهور واحد (IntersectionObserver) لكل البطاقات، والقلب حركة transform فقط.
 * - يتوقف الطابور حين يكون التبويب في الخلفية، ويُلغى مع وضع توفير البيانات.
 */

const FLIP_GAP_MS = 2000
/** مدة الدوران (مطابقة لـ duration-700) ومدة بقاء التصميم قبل عودة صورة القماش */
const FLIP_DURATION_MS = 700
const DESIGN_SHOW_MS = 2000

interface FlipEntry {
  el: Element
  visibleSince: number | null
  preload: () => Promise<boolean>
  loading: Promise<boolean> | null
  flip: () => void
}

const entries = new Map<Element, FlipEntry>()
let observer: IntersectionObserver | null = null
let timer: number | null = null
let running = false
let lastFlipAt = -Infinity
let visibilityListening = false

function nextEntry(): FlipEntry | null {
  let first: FlipEntry | null = null
  for (const entry of entries.values()) {
    if (entry.visibleSince === null) continue
    if (!first || (entry.el.compareDocumentPosition(first.el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      first = entry
    }
  }
  return first
}

function schedule() {
  if (timer !== null || running) return
  const entry = nextEntry()
  if (!entry || entry.visibleSince === null) return
  // نبدأ تحميل صورة التصميم أثناء الانتظار ليكون القلب سلساً في موعده
  entry.loading ??= entry.preload()
  const due = Math.max(entry.visibleSince + FLIP_GAP_MS, lastFlipAt + FLIP_GAP_MS)
  timer = window.setTimeout(run, Math.max(0, due - performance.now()))
}

async function run() {
  timer = null
  if (document.hidden) return // يستأنف عند visibilitychange
  const entry = nextEntry()
  if (!entry || entry.visibleSince === null) return
  if (performance.now() < Math.max(entry.visibleSince + FLIP_GAP_MS, lastFlipAt + FLIP_GAP_MS)) {
    schedule()
    return
  }

  running = true
  const ok = await (entry.loading ??= entry.preload())
  running = false

  if (!entries.has(entry.el)) {
    schedule()
    return
  }
  if (!ok) {
    unwatch(entry.el)
  } else if (entry.visibleSince !== null && !document.hidden) {
    unwatch(entry.el)
    entry.flip()
    lastFlipAt = performance.now()
  }
  // إن خرجت البطاقة من الشاشة أثناء التحميل تبقى في الطابور حتى تعود
  schedule()
}

function onVisibilityChange() {
  if (!document.hidden) schedule()
}

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver((changes) => {
      const now = performance.now()
      for (const change of changes) {
        const entry = entries.get(change.target)
        if (!entry) continue
        entry.visibleSince = change.isIntersecting ? (entry.visibleSince ?? now) : null
      }
      schedule()
    }, { threshold: 0.6 })
  }
  if (!visibilityListening) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    visibilityListening = true
  }
  return observer
}

function watch(entry: FlipEntry) {
  entries.set(entry.el, entry)
  getObserver().observe(entry.el)
}

function unwatch(el: Element) {
  entries.delete(el)
  observer?.unobserve(el)
}

function shouldSkipFlips() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return Boolean(connection?.saveData)
}

interface DesignFlipCardProps {
  /** الوجه الأمامي: صورة القماش كما هي */
  children: ReactNode
  /** رابط صورة التصميم المعروضة على الظهر (بدون قلب إن كان فارغاً) */
  designSrc?: string | null
  designSrcSet?: string
  sizes?: string
  alt: string
  /** أي تغيير فيه بعد القلب (تصفح صور القماش يدوياً) يعيد البطاقة لوجهها الأمامي */
  resetKey?: number
}

export default function DesignFlipCard({ children, designSrc, designSrcSet, sizes, alt, resetKey }: DesignFlipCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [backReady, setBackReady] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const lastResetKey = useRef(resetKey)

  useEffect(() => {
    const el = ref.current
    if (!el || !designSrc || shouldSkipFlips()) return
    let cancelled = false
    let flipBackTimer: number | undefined

    watch({
      el,
      visibleSince: null,
      loading: null,
      preload: () => new Promise<boolean>((resolve) => {
        const img = new Image()
        img.decoding = 'async'
        img.fetchPriority = 'low'
        if (sizes) img.sizes = sizes
        if (designSrcSet) img.srcset = designSrcSet
        img.src = designSrc
        img.decode().then(() => resolve(true), () => resolve(img.complete && img.naturalWidth > 0))
      }),
      flip: () => {
        if (cancelled) return
        setBackReady(true)
        // إطاران: يُرسم الظهر أولاً ثم يبدأ الدوران
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (cancelled) return
          setFlipped(true)
          // يبقى التصميم ظاهراً DESIGN_SHOW_MS بعد اكتمال الدوران ثم تعود صورة القماش
          flipBackTimer = window.setTimeout(() => {
            if (!cancelled) setFlipped(false)
          }, FLIP_DURATION_MS + DESIGN_SHOW_MS)
        }))
      },
    })

    return () => {
      cancelled = true
      window.clearTimeout(flipBackTimer)
      unwatch(el)
      schedule()
    }
  }, [designSrc, designSrcSet, sizes])

  useEffect(() => {
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    setFlipped(false)
  }, [resetKey])

  return (
    <div ref={ref} className="absolute inset-0" style={{ perspective: 1200 }}>
      <div
        className="absolute inset-0 transition-transform duration-700 ease-in-out motion-reduce:duration-0"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : undefined }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
          {children}
        </div>
        {backReady && designSrc && (
          <div
            className="absolute inset-0"
            style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            aria-hidden={!flipped}
          >
            <img
              src={designSrc}
              srcSet={designSrcSet}
              sizes={sizes}
              alt={alt}
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  )
}
