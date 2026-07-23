/**
 * التحقق مما إذا كان الملف فيديو بناءً على رابط الملف
 * يتحقق من امتداد الملف أو وجود كلمة video في الرابط
 */
export const isVideoFile = (fileUrl: string): boolean => {
  const url = fileUrl.toLowerCase()
  return (
    url.includes('.mp4') ||
    url.includes('.mov') ||
    url.includes('.avi') ||
    url.includes('.webm') ||
    url.includes('video')
  )
}

const SUPABASE_PUBLIC_OBJECT_PATH = '/storage/v1/object/public/'
const SUPABASE_PUBLIC_RENDER_PATH = '/storage/v1/render/image/public/'

export type SupabaseImageResizeMode = 'cover' | 'contain' | 'fill'

export interface SupabaseImageTransform {
  width: number
  height?: number
  quality?: number
  resize?: SupabaseImageResizeMode
}

/**
 * Builds a Supabase CDN transformation URL for a public Storage image.
 * Non-Supabase, local, base64, and video URLs are returned unchanged.
 */
export const getSupabaseImageUrl = (
  fileUrl: string,
  {
    width,
    height,
    quality = 82,
    resize = 'cover',
  }: SupabaseImageTransform,
): string => {
  if (!fileUrl || isVideoFile(fileUrl) || fileUrl.startsWith('data:')) return fileUrl

  try {
    const url = new URL(fileUrl)
    const isPublicObject = url.pathname.includes(SUPABASE_PUBLIC_OBJECT_PATH)
    const isPublicRender = url.pathname.includes(SUPABASE_PUBLIC_RENDER_PATH)

    if (!isPublicObject && !isPublicRender) return fileUrl

    if (isPublicObject) {
      url.pathname = url.pathname.replace(SUPABASE_PUBLIC_OBJECT_PATH, SUPABASE_PUBLIC_RENDER_PATH)
    }

    url.searchParams.set('width', String(width))
    if (height) url.searchParams.set('height', String(height))
    else url.searchParams.delete('height')
    url.searchParams.set('quality', String(quality))
    url.searchParams.set('resize', resize)

    return url.toString()
  } catch {
    return fileUrl
  }
}

export const getSupabaseImageSrcSet = (
  fileUrl: string,
  sizes: Array<{ width: number; height?: number }>,
  quality = 82,
  resize: SupabaseImageResizeMode = 'cover',
): string | undefined => {
  if (!fileUrl || isVideoFile(fileUrl)) return undefined

  const firstUrl = getSupabaseImageUrl(fileUrl, {
    ...sizes[0],
    quality,
    resize,
  })

  // A non-Supabase URL cannot be resized by Storage, so avoid a misleading srcset.
  if (firstUrl === fileUrl) return undefined

  return sizes
    .map(({ width, height }) => (
      `${getSupabaseImageUrl(fileUrl, { width, height, quality, resize })} ${width}w`
    ))
    .join(', ')
}
