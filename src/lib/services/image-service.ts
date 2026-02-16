/**
 * Image Service
 * Handles image/video upload to Supabase storage with compression and thumbnails.
 */

'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

const STORAGE_BUCKET = 'product-images'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_FILE_SIZE = 50 * 1024 * 1024
const TARGET_SIZE = 5 * 1024 * 1024
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024
const THUMBNAIL_WIDTH = 300
const THUMBNAIL_HEIGHT = 400
const THUMBNAIL_QUALITY = 0.8
const MAX_IMAGE_DIMENSION = 1920
const CONCURRENT_UPLOAD_LIMIT = 3
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 1000
const IMAGE_UPLOAD_TIMEOUT_MS = 60_000
const VIDEO_UPLOAD_TIMEOUT_MS = 120_000

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/mov',
  'video/quicktime',
  'video/webm',
  'video/avi'
]

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/mov': 'mov',
  'video/avi': 'avi'
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

function isHeicLike(file: File): boolean {
  const loweredName = file.name.toLowerCase()
  return file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    loweredName.endsWith('.heic') ||
    loweredName.endsWith('.heif')
}

function getMimeExtension(originalName: string, mimeType: string): string {
  const mapped = MIME_EXTENSION_MAP[mimeType]
  if (mapped) return mapped
  const fallback = originalName.split('.').pop()?.toLowerCase()
  return fallback || 'bin'
}

function generateFileName(originalName: string, mimeType: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const extension = getMimeExtension(originalName, mimeType)
  return `${timestamp}-${random}.${extension}`
}

function getThumbnailFileName(mainFileName: string): string {
  const baseName = mainFileName.replace(/\.[^.]+$/, '')
  return `thumb_${baseName}.jpg`
}

function encodePathForStorage(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error
  return fallback
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function uploadWithRetry<T>(
  uploadFn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = BASE_RETRY_DELAY_MS
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await uploadFn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      await sleep(delayMs * (attempt + 1))
    }
  }
  throw new Error('Upload failed after retries')
}

async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to create blob from canvas'))
      }
    }, mimeType, quality)
  })
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    image.src = url
  })
}

function drawCenterCrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): void {
  const sourceAspect = sourceWidth / sourceHeight
  const targetAspect = targetWidth / targetHeight

  let sx = 0
  let sy = 0
  let sWidth = sourceWidth
  let sHeight = sourceHeight

  if (sourceAspect > targetAspect) {
    sWidth = sourceHeight * targetAspect
    sx = (sourceWidth - sWidth) / 2
  } else {
    sHeight = sourceWidth / targetAspect
    sy = (sourceHeight - sHeight) / 2
  }

  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight)
}

function validateImageFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'نوع الملف غير مدعوم. الأنواع المدعومة: JPG, PNG, WEBP, HEIC'
    }
  }
  return { valid: true }
}

function validateVideoFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'نوع الفيديو غير مدعوم. الأنواع المدعومة: MP4, MOV, WEBM, AVI'
    }
  }
  return { valid: true }
}

function validateFileSize(file: File, maxSize: number): { valid: boolean; error?: string } {
  if (file.size <= maxSize) return { valid: true }
  const sizeMB = (maxSize / (1024 * 1024)).toFixed(1)
  return {
    valid: false,
    error: `حجم الملف كبير جداً. الحد الأقصى: ${sizeMB}MB`
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  if (!isHeicLike(file)) {
    return file
  }

  const heic2anyModule = await import('heic2any')
  const converted = await heic2anyModule.default({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  })

  const convertedBlob = Array.isArray(converted) ? converted[0] : converted
  const convertedName = file.name.replace(/\.(heic|heif)$/i, '.jpg')

  return new File([convertedBlob as BlobPart], convertedName, {
    type: 'image/jpeg',
    lastModified: file.lastModified
  })
}

async function smartCompressImage(file: File, image: HTMLImageElement): Promise<Blob> {
  if (file.size <= COMPRESSION_THRESHOLD) {
    return file
  }

  let { width, height } = image
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
      width = MAX_IMAGE_DIMENSION
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
      height = MAX_IMAGE_DIMENSION
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create canvas context')
  }
  ctx.drawImage(image, 0, 0, width, height)

  let minQuality = 0.3
  let maxQuality = 0.92
  let bestBlob: Blob | null = null

  while (maxQuality - minQuality > 0.03) {
    const quality = (minQuality + maxQuality) / 2
    const currentBlob = await canvasToBlob(canvas, 'image/jpeg', quality)

    if (currentBlob.size > TARGET_SIZE) {
      maxQuality = quality
    } else {
      bestBlob = currentBlob
      minQuality = quality
    }
  }

  if (bestBlob) {
    return bestBlob
  }

  return canvasToBlob(canvas, 'image/jpeg', 0.3)
}

async function createThumbnailFromImage(image: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_WIDTH
  canvas.height = THUMBNAIL_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create canvas context')
  }

  drawCenterCrop(ctx, image, image.width, image.height, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
  return canvasToBlob(canvas, 'image/jpeg', THUMBNAIL_QUALITY)
}

async function createVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
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

    video.onerror = () => {
      cleanup()
      reject(new Error('فشل تحميل الفيديو'))
    }

    video.onloadedmetadata = () => {
      const targetTime = Number.isFinite(video.duration) && video.duration > 1
        ? Math.min(1, video.duration / 2)
        : 0

      if (targetTime <= 0) {
        finalize()
        return
      }

      video.currentTime = targetTime
    }

    video.onseeked = () => {
      finalize()
    }

    video.onloadeddata = () => {
      if (video.currentTime === 0) {
        finalize()
      }
    }
  })
}

async function buildUploadHeaders(): Promise<{ authorization: string; apikey: string }> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('Supabase anon key is missing')
  }

  const {
    data: { session }
  } = await supabase.auth.getSession()
  const token = session?.access_token || SUPABASE_ANON_KEY

  return {
    authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY
  }
}

async function uploadBlobWithProgress(
  objectPath: string,
  blob: Blob,
  mimeType: string,
  timeoutMs: number,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL is missing')
  }

  const headers = await buildUploadHeaders()
  const encodedPath = encodePathForStorage(objectPath)
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.timeout = timeoutMs
    xhr.setRequestHeader('Authorization', headers.authorization)
    xhr.setRequestHeader('apikey', headers.apikey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('Cache-Control', 'max-age=3600')
    xhr.setRequestHeader('content-type', mimeType)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100)
        onProgress?.(percent)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
        return
      }

      const message = xhr.responseText ? (() => {
        try {
          const parsed = JSON.parse(xhr.responseText)
          return parsed.message || parsed.error || xhr.responseText
        } catch {
          return xhr.responseText
        }
      })() : 'Upload failed'

      reject(new Error(message))
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع'))

    xhr.send(blob)
  })
}

async function uploadImageToStorage(
  mainFileName: string,
  mainBlob: Blob,
  thumbnailBlob: Blob,
  timeoutMs: number,
  onMainProgress?: (percent: number) => void
): Promise<{ mainPath: string; thumbnailPath: string }> {
  const mainPath = `products/${mainFileName}`
  const thumbFileName = getThumbnailFileName(mainFileName)
  const thumbnailPath = `products/thumbnails/${thumbFileName}`

  await uploadWithRetry(
    () => uploadBlobWithProgress(mainPath, mainBlob, mainBlob.type || 'application/octet-stream', timeoutMs, onMainProgress),
    MAX_RETRIES,
    BASE_RETRY_DELAY_MS
  )

  await uploadWithRetry(
    () => uploadBlobWithProgress(thumbnailPath, thumbnailBlob, 'image/jpeg', timeoutMs),
    MAX_RETRIES,
    BASE_RETRY_DELAY_MS
  )

  return { mainPath, thumbnailPath }
}

function getPublicUrls(mainPath: string, thumbnailPath: string): { url: string; thumbnailUrl: string } {
  const { data: mainUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(mainPath)
  const { data: thumbUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(thumbnailPath)
  return {
    url: mainUrlData.publicUrl,
    thumbnailUrl: thumbUrlData.publicUrl
  }
}

export const imageService = {
  async uploadImage(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return this.uploadAsBase64(file)
      }

      onProgress?.({ fileName: file.name, progress: 10, status: 'uploading' })

      const normalizedFile = await convertHeicToJpeg(file)
      const typeValidation = validateImageFileType(normalizedFile)
      if (!typeValidation.valid) {
        return { data: null, error: typeValidation.error! }
      }

      const sizeValidation = validateFileSize(normalizedFile, MAX_IMAGE_FILE_SIZE)
      if (!sizeValidation.valid) {
        return { data: null, error: sizeValidation.error! }
      }

      onProgress?.({ fileName: file.name, progress: 25, status: 'compressing' })
      const imageElement = await loadImageFromBlob(normalizedFile)
      const compressedBlob = await smartCompressImage(normalizedFile, imageElement)
      const thumbnailBlob = await createThumbnailFromImage(imageElement)

      onProgress?.({ fileName: file.name, progress: 30, status: 'uploading' })
      const mainMimeType = compressedBlob.type || normalizedFile.type || 'image/jpeg'
      const mainFileName = generateFileName(normalizedFile.name, mainMimeType)

      const { mainPath, thumbnailPath } = await uploadImageToStorage(
        mainFileName,
        compressedBlob,
        thumbnailBlob,
        IMAGE_UPLOAD_TIMEOUT_MS,
        (percent) => {
          const mappedPercent = Math.round(30 + (percent * 55) / 100)
          onProgress?.({ fileName: file.name, progress: Math.min(mappedPercent, 85), status: 'uploading' })
        }
      )

      onProgress?.({ fileName: file.name, progress: 95, status: 'uploading' })
      const { url, thumbnailUrl } = getPublicUrls(mainPath, thumbnailPath)
      onProgress?.({ fileName: file.name, progress: 100, status: 'success' })

      return {
        data: {
          url,
          thumbnailUrl,
          fileName: mainFileName
        },
        error: null
      }
    } catch (error) {
      const message = normalizeError(error, 'فشل رفع الصورة')
      onProgress?.({ fileName: file.name, progress: 0, status: 'error', error: message })
      return { data: null, error: message }
    }
  },

  async uploadVideo(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return this.uploadAsBase64(file)
      }

      onProgress?.({ fileName: file.name, progress: 10, status: 'uploading' })

      const typeValidation = validateVideoFileType(file)
      if (!typeValidation.valid) {
        return { data: null, error: typeValidation.error! }
      }

      const sizeValidation = validateFileSize(file, MAX_VIDEO_FILE_SIZE)
      if (!sizeValidation.valid) {
        return { data: null, error: sizeValidation.error! }
      }

      onProgress?.({ fileName: file.name, progress: 25, status: 'compressing' })
      const thumbnailBlob = await createVideoThumbnail(file)

      const videoFileName = generateFileName(file.name, file.type)
      onProgress?.({ fileName: file.name, progress: 30, status: 'uploading' })

      const { mainPath, thumbnailPath } = await uploadImageToStorage(
        videoFileName,
        file,
        thumbnailBlob,
        VIDEO_UPLOAD_TIMEOUT_MS,
        (percent) => {
          const mappedPercent = Math.round(30 + (percent * 55) / 100)
          onProgress?.({ fileName: file.name, progress: Math.min(mappedPercent, 85), status: 'uploading' })
        }
      )

      onProgress?.({ fileName: file.name, progress: 95, status: 'uploading' })
      const { url, thumbnailUrl } = getPublicUrls(mainPath, thumbnailPath)
      onProgress?.({ fileName: file.name, progress: 100, status: 'success' })

      return {
        data: {
          url,
          thumbnailUrl,
          fileName: videoFileName
        },
        error: null
      }
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

      for (let i = 0; i < files.length; i += CONCURRENT_UPLOAD_LIMIT) {
        const batch = files.slice(i, i + CONCURRENT_UPLOAD_LIMIT)

        const settled = await Promise.allSettled(
          batch.map(async (file) => {
            const upload = file.type.startsWith('video/') ? this.uploadVideo.bind(this) : this.uploadImage.bind(this)
            return upload(file, (progress) => onProgress?.(file.name, progress))
          })
        )

        settled.forEach((result, index) => {
          const file = batch[index]
          if (result.status === 'rejected') {
            errors.push(`${file.name}: ${normalizeError(result.reason, 'Upload failed')}`)
            return
          }

          if (result.value.error) {
            errors.push(`${file.name}: ${result.value.error}`)
            return
          }

          if (result.value.data) {
            results.push(result.value.data)
          }
        })
      }

      if (errors.length > 0) {
        return { data: null, error: errors.join(', ') }
      }

      return { data: results, error: null }
    } catch (error) {
      return { data: null, error: normalizeError(error, 'فشل رفع الملفات') }
    }
  },

  async deleteImage(fileName: string): Promise<{ error: string | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return { error: null }
      }

      const { error: mainError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([`products/${fileName}`])

      if (mainError) {
        throw new Error(`فشل حذف الملف: ${mainError.message}`)
      }

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
          data: {
            url: base64,
            thumbnailUrl: base64,
            fileName: file.name
          },
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
