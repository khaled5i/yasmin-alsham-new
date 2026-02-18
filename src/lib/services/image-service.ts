/**
 * Image Service
 * Handles image/video upload to Supabase storage with compression and thumbnails.
 * Uses fetch API for reliable uploads across all platforms including Android WebView.
 */

'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const STORAGE_BUCKET = 'product-images'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024
const MAX_VIDEO_FILE_SIZE = 50 * 1024 * 1024
const TARGET_SIZE = 4 * 1024 * 1024
const COMPRESSION_THRESHOLD = 3 * 1024 * 1024
const THUMBNAIL_WIDTH = 300
const THUMBNAIL_HEIGHT = 400
const THUMBNAIL_QUALITY = 0.75
const MAX_IMAGE_DIMENSION = 1920
const MOBILE_MAX_IMAGE_DIMENSION = 1440
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 1000
const UPLOAD_TIMEOUT_MS = 120_000
const DECODE_TIMEOUT_MS = 15_000
const DIMENSIONS_TIMEOUT_MS = 12_000

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
]

const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/mov', 'video/quicktime', 'video/webm', 'video/avi'
]

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/mov': 'mov', 'video/avi': 'avi'
}

export interface UploadProgress {
  fileName: string
  progress: number
  status: 'uploading' | 'compressing' | 'success' | 'error'
  error?: string
}

export interface ImageUploadResult {
  url: string
  thumbnailUrl: string
  fileName: string
}

// ===== Utility Functions =====

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function getMaxImageDimension(): number {
  return isMobileDevice() ? MOBILE_MAX_IMAGE_DIMENSION : MAX_IMAGE_DIMENSION
}

function isHeicLike(file: File): boolean {
  const loweredName = file.name.toLowerCase()
  return file.type === 'image/heic' || file.type === 'image/heif' ||
    loweredName.endsWith('.heic') || loweredName.endsWith('.heif')
}

function getMimeExtension(originalName: string, mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] || originalName.split('.').pop()?.toLowerCase() || 'bin'
}

function generateFileName(originalName: string, mimeType: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `${timestamp}-${random}.${getMimeExtension(originalName, mimeType)}`
}

function getThumbnailFileName(mainFileName: string): string {
  return `thumb_${mainFileName.replace(/\.[^.]+$/, '')}.jpg`
}

function encodePathForStorage(path: string): string {
  return path.split('/').map((s) => encodeURIComponent(s)).join('/')
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error
  return fallback
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('تم إلغاء الرفع')
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMsg || 'انتهت المهلة الزمنية'))
    }, ms)
    promise.then((value) => {
      clearTimeout(timeoutId)
      resolve(value)
    }).catch((error) => {
      clearTimeout(timeoutId)
      reject(error)
    })
  })
}

// ===== Retry Helper =====

async function uploadWithRetry<T>(
  uploadFn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = BASE_RETRY_DELAY_MS,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfAborted(signal)
    try {
      return await uploadFn()
    } catch (error) {
      if (signal?.aborted) throw error
      if (attempt === maxRetries) throw error
      await sleep(delayMs * (attempt + 1))
    }
  }
  throw new Error('فشل الرفع بعد عدة محاولات')
}

// ===== Canvas & Image Operations =====

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('انتهت مهلة ضغط الصورة')), 15_000)
    canvas.toBlob((blob) => {
      clearTimeout(timeoutId)
      if (blob) resolve(blob)
      else reject(new Error('فشل إنشاء الصورة المضغوطة'))
    }, mimeType, quality)
  })
}

function calculateTargetDimensions(
  origWidth: number, origHeight: number, maxDim: number
): { width: number; height: number } {
  if (origWidth <= maxDim && origHeight <= maxDim) return { width: origWidth, height: origHeight }
  if (origWidth > origHeight) {
    return { width: maxDim, height: Math.round((origHeight * maxDim) / origWidth) }
  }
  return { width: Math.round((origWidth * maxDim) / origHeight), height: maxDim }
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image
      URL.revokeObjectURL(url)
      image.src = ''
      resolve({ width, height })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      image.src = ''
      reject(new Error('فشل قراءة أبعاد الصورة'))
    }
    image.src = url
  })
}

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    let settled = false
    image.onload = () => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      image.src = ''
      reject(new Error('فشل تحميل الصورة'))
    }
    image.decoding = 'async'
    image.src = url
  })
}

/**
 * Decode and resize an image. Always uses HTMLImageElement for maximum compatibility
 * across all platforms (Android WebView, iOS Safari, desktop browsers).
 */
async function decodeAndResize(
  blob: Blob, maxDim: number, signal?: AbortSignal
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  throwIfAborted(signal)
  const { width: origW, height: origH } = await withTimeout(
    getImageDimensions(blob), DIMENSIONS_TIMEOUT_MS, 'انتهت مهلة قراءة أبعاد الصورة'
  )
  const { width, height } = calculateTargetDimensions(origW, origH, maxDim)
  throwIfAborted(signal)

  const image = await withTimeout(
    loadImageElement(blob), DECODE_TIMEOUT_MS, 'انتهت مهلة تحميل الصورة'
  )
  throwIfAborted(signal)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('فشل إنشاء سياق الرسم')
  ctx.drawImage(image, 0, 0, width, height)
  image.src = ''

  return { canvas, width, height }
}

function drawCenterCrop(
  ctx: CanvasRenderingContext2D, source: CanvasImageSource,
  sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number
): void {
  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = targetWidth / targetHeight
  let sx = 0, sy = 0, sWidth = sourceWidth, sHeight = sourceHeight
  if (sourceAspect > targetAspect) {
    sWidth = sourceHeight * targetAspect
    sx = (sourceWidth - sWidth) / 2
  } else {
    sHeight = sourceWidth / targetAspect
    sy = (sourceHeight - sHeight) / 2
  }
  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight)
}

// ===== Validation =====

function validateImageFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'نوع الملف غير مدعوم. الأنواع المدعومة: JPG, PNG, WEBP, HEIC' }
  }
  return { valid: true }
}

function validateVideoFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: 'نوع الفيديو غير مدعوم. الأنواع المدعومة: MP4, MOV, WEBM, AVI' }
  }
  return { valid: true }
}

function validateFileSize(file: File, maxSize: number): { valid: boolean; error?: string } {
  if (file.size <= maxSize) return { valid: true }
  const sizeMB = (maxSize / (1024 * 1024)).toFixed(1)
  return { valid: false, error: `حجم الملف كبير جداً. الحد الأقصى: ${sizeMB}MB` }
}

// ===== HEIC Conversion =====

async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicLike(file)) return file
  const heic2anyModule = await import('heic2any')
  const converted = await heic2anyModule.default({ blob: file, toType: 'image/jpeg', quality: 0.9 })
  const convertedBlob = Array.isArray(converted) ? converted[0] : converted
  return new File([convertedBlob as BlobPart], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
    type: 'image/jpeg', lastModified: file.lastModified
  })
}

// ===== Image Compression =====

async function compressImage(
  blob: Blob, onProgress?: (progress: number) => void, signal?: AbortSignal
): Promise<{ compressed: Blob; thumbnail: Blob }> {
  throwIfAborted(signal)
  onProgress?.(15)

  const maxDim = getMaxImageDimension()
  const { canvas, width, height } = await decodeAndResize(blob, maxDim, signal)
  throwIfAborted(signal)
  onProgress?.(40)

  // Compress to JPEG
  let compressed: Blob
  if (blob.size <= COMPRESSION_THRESHOLD) {
    compressed = await canvasToBlob(canvas, 'image/jpeg', 0.82)
    if (compressed.size > blob.size) compressed = blob
  } else {
    const firstPass = await canvasToBlob(canvas, 'image/jpeg', 0.75)
    throwIfAborted(signal)
    onProgress?.(55)
    if (firstPass.size <= TARGET_SIZE) {
      compressed = firstPass
    } else {
      const ratio = TARGET_SIZE / firstPass.size
      const adjustedQuality = Math.max(0.25, Math.min(0.7, 0.75 * ratio * 0.9))
      compressed = await canvasToBlob(canvas, 'image/jpeg', adjustedQuality)
    }
  }
  onProgress?.(70)
  throwIfAborted(signal)

  // Create thumbnail
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = THUMBNAIL_WIDTH
  thumbCanvas.height = THUMBNAIL_HEIGHT
  const thumbCtx = thumbCanvas.getContext('2d')
  if (!thumbCtx) throw new Error('فشل إنشاء سياق الصورة المصغرة')
  drawCenterCrop(thumbCtx, canvas, width, height, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  const thumbnail = await canvasToBlob(thumbCanvas, 'image/jpeg', THUMBNAIL_QUALITY)
  throwIfAborted(signal)

  releaseCanvas(canvas)
  releaseCanvas(thumbCanvas)
  onProgress?.(80)

  return { compressed, thumbnail }
}

// ===== Video Thumbnail =====

async function createVideoThumbnail(file: File): Promise<Blob> {
  const innerPromise = new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    let done = false

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
      video.load()
    }

    const finalize = async () => {
      if (done) return
      done = true
      try {
        const canvas = document.createElement('canvas')
        canvas.width = THUMBNAIL_WIDTH
        canvas.height = THUMBNAIL_HEIGHT
        const ctx = canvas.getContext('2d')
        if (!ctx || !video.videoWidth || !video.videoHeight) {
          throw new Error('تعذر إنشاء صورة مصغرة للفيديو')
        }
        drawCenterCrop(ctx, video, video.videoWidth, video.videoHeight, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
        const thumbnail = await canvasToBlob(canvas, 'image/jpeg', THUMBNAIL_QUALITY)
        releaseCanvas(canvas)
        cleanup()
        resolve(thumbnail)
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl
    video.onerror = () => { cleanup(); reject(new Error('فشل تحميل الفيديو')) }
    video.onloadedmetadata = () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 1
        ? Math.min(1, video.duration / 2) : 0
      if (targetTime <= 0) { finalize(); return }
      video.currentTime = targetTime
    }
    video.onseeked = () => finalize()
    video.onloadeddata = () => { if (video.currentTime === 0) finalize() }
  })

  return withTimeout(innerPromise, 15_000, 'انتهت مهلة إنشاء صورة مصغرة للفيديو')
}

// ===== Supabase Upload (fetch-based for Android WebView compatibility) =====

async function buildUploadHeaders(): Promise<{ authorization: string; apikey: string }> {
  if (!SUPABASE_ANON_KEY) throw new Error('Supabase anon key is missing')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || SUPABASE_ANON_KEY
  return { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
}

/**
 * Upload a blob to Supabase Storage using the fetch API.
 * fetch is significantly more reliable than XHR in Android Capacitor WebViews,
 * which was the root cause of the 40% stall issue.
 */
async function uploadBlobToStorage(
  objectPath: string, blob: Blob, mimeType: string, signal?: AbortSignal
): Promise<void> {
  if (!SUPABASE_URL) throw new Error('Supabase URL is missing')
  throwIfAborted(signal)

  const headers = await buildUploadHeaders()
  const encodedPath = encodePathForStorage(objectPath)
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`

  const controller = new AbortController()
  const combinedSignal = controller.signal

  // Link external abort signal to our controller
  if (signal) {
    if (signal.aborted) { controller.abort(); throw new Error('تم إلغاء الرفع') }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  // Overall timeout
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': headers.authorization,
        'apikey': headers.apikey,
        'Content-Type': mimeType,
        'x-upsert': 'false',
        'Cache-Control': 'max-age=3600',
      },
      body: blob,
      signal: combinedSignal,
    })

    if (!response.ok) {
      let errorMessage = `فشل الرفع (${response.status})`
      try {
        const errorBody = await response.json()
        errorMessage = errorBody.message || errorBody.error || errorMessage
      } catch { /* ignore parse errors */ }
      throw new Error(errorMessage)
    }
  } catch (error) {
    if (combinedSignal.aborted && !signal?.aborted) {
      throw new Error('انتهت مهلة الرفع. يرجى المحاولة مرة أخرى')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function uploadImageToStorage(
  mainFileName: string, mainBlob: Blob, thumbnailBlob: Blob,
  onProgress?: (stage: 'main' | 'thumb', done: boolean) => void,
  signal?: AbortSignal
): Promise<{ mainPath: string; thumbnailPath: string }> {
  const mainPath = `products/${mainFileName}`
  const thumbFileName = getThumbnailFileName(mainFileName)
  const thumbnailPath = `products/thumbnails/${thumbFileName}`

  // Upload main image
  onProgress?.('main', false)
  await uploadWithRetry(
    () => uploadBlobToStorage(mainPath, mainBlob, mainBlob.type || 'image/jpeg', signal),
    MAX_RETRIES, BASE_RETRY_DELAY_MS, signal
  )
  onProgress?.('main', true)

  // Upload thumbnail
  onProgress?.('thumb', false)
  await uploadWithRetry(
    () => uploadBlobToStorage(thumbnailPath, thumbnailBlob, 'image/jpeg', signal),
    MAX_RETRIES, BASE_RETRY_DELAY_MS, signal
  )
  onProgress?.('thumb', true)

  return { mainPath, thumbnailPath }
}

function getPublicUrls(mainPath: string, thumbnailPath: string): { url: string; thumbnailUrl: string } {
  const { data: mainUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(mainPath)
  const { data: thumbUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbnailPath)
  return { url: mainUrlData.publicUrl, thumbnailUrl: thumbUrlData.publicUrl }
}

// ===== Public API =====

export const imageService = {
  async uploadImage(
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    options?: { signal?: AbortSignal }
  ): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    try {
      throwIfAborted(options?.signal)
      if (!isSupabaseConfigured()) return this.uploadAsBase64(file)

      onProgress?.({ fileName: file.name, progress: 5, status: 'uploading' })

      const normalizedFile = await convertHeicToJpeg(file)
      throwIfAborted(options?.signal)

      const typeValidation = validateImageFileType(normalizedFile)
      if (!typeValidation.valid) return { data: null, error: typeValidation.error! }

      const sizeValidation = validateFileSize(normalizedFile, MAX_IMAGE_FILE_SIZE)
      if (!sizeValidation.valid) return { data: null, error: sizeValidation.error! }

      onProgress?.({ fileName: file.name, progress: 10, status: 'compressing' })

      // Compress image and create thumbnail
      const { compressed, thumbnail } = await withTimeout(
        compressImage(
          normalizedFile,
          (pct) => {
            const mapped = Math.round(10 + (pct / 80) * 35)
            onProgress?.({ fileName: file.name, progress: mapped, status: 'compressing' })
          },
          options?.signal
        ),
        45_000,
        'انتهت مهلة ضغط الصورة. الصورة كبيرة جداً'
      )
      throwIfAborted(options?.signal)

      // Upload to Supabase Storage using fetch API
      onProgress?.({ fileName: file.name, progress: 45, status: 'uploading' })
      const mainMimeType = compressed.type || normalizedFile.type || 'image/jpeg'
      const mainFileName = generateFileName(normalizedFile.name, mainMimeType)

      const { mainPath, thumbnailPath } = await uploadImageToStorage(
        mainFileName, compressed, thumbnail,
        (stage, done) => {
          if (stage === 'main' && !done) onProgress?.({ fileName: file.name, progress: 50, status: 'uploading' })
          if (stage === 'main' && done) onProgress?.({ fileName: file.name, progress: 80, status: 'uploading' })
          if (stage === 'thumb' && done) onProgress?.({ fileName: file.name, progress: 90, status: 'uploading' })
        },
        options?.signal
      )

      onProgress?.({ fileName: file.name, progress: 95, status: 'uploading' })
      const { url, thumbnailUrl } = getPublicUrls(mainPath, thumbnailPath)
      onProgress?.({ fileName: file.name, progress: 100, status: 'success' })

      return { data: { url, thumbnailUrl, fileName: mainFileName }, error: null }
    } catch (error) {
      const message = normalizeError(error, 'فشل رفع الصورة')
      onProgress?.({ fileName: file.name, progress: 0, status: 'error', error: message })
      return { data: null, error: message }
    }
  },

  async uploadVideo(
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    options?: { signal?: AbortSignal }
  ): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    try {
      throwIfAborted(options?.signal)
      if (!isSupabaseConfigured()) return this.uploadAsBase64(file)

      onProgress?.({ fileName: file.name, progress: 10, status: 'uploading' })

      const typeValidation = validateVideoFileType(file)
      if (!typeValidation.valid) return { data: null, error: typeValidation.error! }

      const sizeValidation = validateFileSize(file, MAX_VIDEO_FILE_SIZE)
      if (!sizeValidation.valid) return { data: null, error: sizeValidation.error! }

      onProgress?.({ fileName: file.name, progress: 20, status: 'compressing' })
      const thumbnailBlob = await createVideoThumbnail(file)
      throwIfAborted(options?.signal)

      const videoFileName = generateFileName(file.name, file.type)
      onProgress?.({ fileName: file.name, progress: 30, status: 'uploading' })

      const { mainPath, thumbnailPath } = await uploadImageToStorage(
        videoFileName, file, thumbnailBlob,
        (stage, done) => {
          if (stage === 'main' && !done) onProgress?.({ fileName: file.name, progress: 35, status: 'uploading' })
          if (stage === 'main' && done) onProgress?.({ fileName: file.name, progress: 80, status: 'uploading' })
          if (stage === 'thumb' && done) onProgress?.({ fileName: file.name, progress: 90, status: 'uploading' })
        },
        options?.signal
      )

      onProgress?.({ fileName: file.name, progress: 95, status: 'uploading' })
      const { url, thumbnailUrl } = getPublicUrls(mainPath, thumbnailPath)
      onProgress?.({ fileName: file.name, progress: 100, status: 'success' })

      return { data: { url, thumbnailUrl, fileName: videoFileName }, error: null }
    } catch (error) {
      const message = normalizeError(error, 'فشل رفع الفيديو')
      onProgress?.({ fileName: file.name, progress: 0, status: 'error', error: message })
      return { data: null, error: message }
    }
  },

  async uploadMultipleImages(
    files: File[],
    onProgress?: (fileName: string, progress: UploadProgress) => void
  ): Promise<{ data: ImageUploadResult[] | null; error: string | null }> {
    try {
      const results: ImageUploadResult[] = []
      const errors: string[] = []
      const concurrentLimit = 2

      for (let i = 0; i < files.length; i += concurrentLimit) {
        const batch = files.slice(i, i + concurrentLimit)
        const settled = await Promise.allSettled(
          batch.map(async (file) => {
            const upload = file.type.startsWith('video/') ? this.uploadVideo.bind(this) : this.uploadImage.bind(this)
            return upload(file, (progress) => onProgress?.(file.name, progress))
          })
        )
        settled.forEach((result, index) => {
          const file = batch[index]
          if (result.status === 'rejected') {
            errors.push(`${file.name}: ${normalizeError(result.reason, 'فشل الرفع')}`)
            return
          }
          if (result.value.error) { errors.push(`${file.name}: ${result.value.error}`); return }
          if (result.value.data) results.push(result.value.data)
        })
      }

      if (errors.length > 0) return { data: null, error: errors.join(', ') }
      return { data: results, error: null }
    } catch (error) {
      return { data: null, error: normalizeError(error, 'فشل رفع الملفات') }
    }
  },

  async deleteImage(fileName: string): Promise<{ error: string | null }> {
    try {
      if (!isSupabaseConfigured()) return { error: null }

      const { error: mainError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([`products/${fileName}`])

      if (mainError) throw new Error(`فشل حذف الملف: ${mainError.message}`)

      const newThumb = getThumbnailFileName(fileName)
      const legacyThumb = `thumb_${fileName}`
      const thumbsToRemove = newThumb === legacyThumb ? [newThumb] : [newThumb, legacyThumb]

      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(thumbsToRemove.map((thumb) => `products/thumbnails/${thumb}`))

      return { error: null }
    } catch (error) {
      return { error: normalizeError(error, 'فشل حذف الملف') }
    }
  },

  async uploadAsBase64(file: File): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        resolve({
          data: { url: base64, thumbnailUrl: base64, fileName: file.name },
          error: null
        })
      }
      reader.onerror = () => {
        resolve({ data: null, error: 'فشل قراءة الملف' })
      }
      reader.readAsDataURL(file)
    })
  }
}