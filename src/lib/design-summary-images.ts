'use client'

export type DesignImageView = 'front' | 'back'
export interface DesignImageSource { view: DesignImageView; src: string }

// الصورة المركّبة تُحفظ بحجم الشاشة (~650 بكسل)، والكتابة اليدوية عليها صغيرة.
// تكبيرها إلى 1536 بكسل للضلع الأطول يجعل النموذج يقرأ الكتابة التي يصحّح بها أخطاء السمع
// (مثل «ميكابه» ← «ميكادو» في تجربة 10 طلبات)، وتبقى JPEG في حدود 60–250 كيلوبايت.
const LONG_SIDE = 1536
const QUALITY = 0.82

function prepare(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const image = new Image()
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const scale = LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx || !canvas.width || !canvas.height) return resolve(null)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', QUALITY))
      } catch {
        resolve(null) // canvas ملوّث (CORS) أو ذاكرة غير كافية: يُكمل التنقيح بلا هذه الصورة
      }
    }
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** يجهّز صورتي الأمام والخلف لطلب التنقيح؛ أي صورة تتعذّر تُسقط ولا توقف التنقيح. */
export async function prepareDesignImages(sources: DesignImageSource[]): Promise<{ view: DesignImageView; data: string }[]> {
  const unique = new Map<DesignImageView, string>()
  for (const source of sources) if (source.src) unique.set(source.view, source.src)
  const prepared = await Promise.all([...unique].map(async ([view, src]) => ({ view, data: await prepare(src) })))
  return prepared.filter((item): item is { view: DesignImageView; data: string } => !!item.data)
}

/** الصورة المركّبة (الخلفية + الرسم + الكتابة) لكل عرض من تعليقات التصميم المحفوظة. */
export function designImagesFromComments(
  comments: { view?: DesignImageView; title?: string; image?: string | null; compositeImage?: string | null }[] | null | undefined,
): DesignImageSource[] {
  const views = new Map<DesignImageView, string>()
  for (const comment of comments ?? []) {
    const title = comment.title?.trim() ?? ''
    const view = comment.view ?? (title.startsWith('خلف') ? 'back' : title.startsWith('أمام') ? 'front' : null)
    const src = comment.compositeImage || (comment.image && /^(data:image|https?:)/.test(comment.image) ? comment.image : null)
    if (view && src) views.set(view, src)
  }
  return [...views].map(([view, src]) => ({ view, src }))
}
