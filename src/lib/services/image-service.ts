/**
 * Image Service - خدمة إدارة الصور
 * يتعامل مع رفع الصور إلى Supabase Storage، ضغطها، وإنشاء thumbnails
 */

'use client'

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// ============================================================================
// الثوابت (Constants)
// ============================================================================

const STORAGE_BUCKET = 'product-images'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB - الحد الأقصى للرفع
const TARGET_SIZE = 5 * 1024 * 1024 // 5MB - الحجم المستهدف للضغط
const COMPRESSION_THRESHOLD = 5 * 1024 * 1024 // 5MB - عتبة الضغط (الصور أكبر من هذا الحجم تُضغط)
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const THUMBNAIL_WIDTH = 300
const THUMBNAIL_HEIGHT = 400
const COMPRESSION_QUALITY = 0.8

// ============================================================================
// أنواع البيانات (Types)
// ============================================================================

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

// ============================================================================
// دوال مساعدة (Helper Functions)
// ============================================================================

/**
 * التحقق من نوع الملف
 */
function validateFileType(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `نوع الملف غير مدعوم. الأنواع المدعومة: JPG, PNG, WEBP`
    }
  }
  return { valid: true }
}

/**
 * التحقق من حجم الملف
 */
function validateFileSize(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `حجم الملف كبير جداً. الحد الأقصى: ${sizeMB}MB`
    }
  }
  return { valid: true }
}

/**
 * ضغط الصورة
 */
async function compressImage(file: File, maxWidth: number = 1920, quality: number = COMPRESSION_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // حساب الأبعاد الجديدة مع الحفاظ على النسبة
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('فشل إنشاء canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('فشل ضغط الصورة'))
            }
          },
          file.type,
          quality
        )
      }

      img.onerror = () => reject(new Error('فشل تحميل الصورة'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.readAsDataURL(file)
  })
}

/**
 * ضغط الصورة بشكل ذكي - فقط للصور الكبيرة (أكبر من 5MB)
 * يحافظ على جودة الصور الصغيرة ويضغط الكبيرة إلى ~5MB
 */
async function smartCompressImage(file: File): Promise<Blob> {
  // إذا كان حجم الصورة أقل من عتبة الضغط، لا نضغطها
  if (file.size <= COMPRESSION_THRESHOLD) {
    console.log(`📷 الصورة ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) لا تحتاج ضغط`)
    return file
  }

  console.log(`🔄 ضغط الصورة ${file.name} من ${(file.size / 1024 / 1024).toFixed(2)}MB إلى ~5MB`)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = async () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // حساب نسبة الضغط المطلوبة
        const compressionRatio = TARGET_SIZE / file.size

        // تقليل الأبعاد بناءً على نسبة الضغط (الجذر التربيعي للحفاظ على النسبة)
        const scaleFactor = Math.sqrt(compressionRatio)
        const newWidth = Math.floor(width * Math.min(scaleFactor * 1.2, 1)) // نضيف 20% هامش
        const newHeight = Math.floor(height * Math.min(scaleFactor * 1.2, 1))

        // لا نقلل الأبعاد أكثر من اللازم
        canvas.width = Math.max(newWidth, 1920)
        canvas.height = Math.max(newHeight, Math.floor(1920 * (height / width)))

        // إذا كانت الأبعاد الجديدة أكبر من الأصلية، نستخدم الأصلية
        if (canvas.width > width) canvas.width = width
        if (canvas.height > height) canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('فشل إنشاء canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        // نبدأ بجودة عالية ونقللها تدريجياً حتى نصل للحجم المطلوب
        let quality = 0.92
        let blob: Blob | null = null
        const minQuality = 0.5 // الحد الأدنى للجودة

        // محاولة الضغط بجودات مختلفة
        while (quality >= minQuality) {
          blob = await new Promise<Blob | null>((res) => {
            canvas.toBlob(
              (b) => res(b),
              'image/jpeg', // نستخدم JPEG للضغط الأفضل
              quality
            )
          })

          if (blob && blob.size <= TARGET_SIZE) {
            console.log(`✅ تم ضغط الصورة إلى ${(blob.size / 1024 / 1024).toFixed(2)}MB بجودة ${(quality * 100).toFixed(0)}%`)
            resolve(blob)
            return
          }

          quality -= 0.05 // تقليل الجودة بـ 5%
        }

        // إذا لم نصل للحجم المطلوب، نستخدم آخر نتيجة
        if (blob) {
          console.log(`⚠️ تم ضغط الصورة إلى ${(blob.size / 1024 / 1024).toFixed(2)}MB (أفضل ما يمكن)`)
          resolve(blob)
        } else {
          reject(new Error('فشل ضغط الصورة'))
        }
      }

      img.onerror = () => reject(new Error('فشل تحميل الصورة'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.readAsDataURL(file)
  })
}

/**
 * إنشاء صورة مصغرة (thumbnail)
 */
async function createThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = THUMBNAIL_WIDTH
        canvas.height = THUMBNAIL_HEIGHT

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('فشل إنشاء canvas context'))
          return
        }

        // حساب الأبعاد للقص المركزي (center crop)
        const imgAspect = img.width / img.height
        const thumbAspect = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT

        let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height

        if (imgAspect > thumbAspect) {
          // الصورة أعرض من المطلوب
          sWidth = img.height * thumbAspect
          sx = (img.width - sWidth) / 2
        } else {
          // الصورة أطول من المطلوب
          sHeight = img.width / thumbAspect
          sy = (img.height - sHeight) / 2
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('فشل إنشاء الصورة المصغرة'))
            }
          },
          file.type,
          COMPRESSION_QUALITY
        )
      }

      img.onerror = () => reject(new Error('فشل تحميل الصورة'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.readAsDataURL(file)
  })
}

/**
 * توليد اسم ملف فريد
 */
function generateFileName(originalName: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const extension = originalName.split('.').pop()
  return `${timestamp}-${random}.${extension}`
}

// ============================================================================
// خدمة الصور (Image Service)
// ============================================================================

export const imageService = {
  /**
   * رفع صورة واحدة إلى Supabase Storage
   */
  async uploadImage(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ data: ImageUploadResult | null; error: string | null }> {
    try {
      // التحقق من تكوين Supabase
      if (!isSupabaseConfigured()) {
        console.warn('⚠️ Supabase غير مُكوّن - استخدام base64 كبديل')
        return this.uploadAsBase64(file)
      }

      const fileName = file.name

      // 1. التحقق من نوع الملف
      const typeValidation = validateFileType(file)
      if (!typeValidation.valid) {
        onProgress?.({
          fileName,
          progress: 0,
          status: 'error',
          error: typeValidation.error
        })
        return { data: null, error: typeValidation.error! }
      }

      // 2. التحقق من حجم الملف
      const sizeValidation = validateFileSize(file)
      if (!sizeValidation.valid) {
        onProgress?.({
          fileName,
          progress: 0,
          status: 'error',
          error: sizeValidation.error
        })
        return { data: null, error: sizeValidation.error! }
      }

      // 3. ضغط الصورة الأساسية (فقط للصور الكبيرة > 5MB)
      onProgress?.({
        fileName,
        progress: 20,
        status: 'compressing'
      })

      const compressedBlob = await smartCompressImage(file)
      const compressedFile = new File([compressedBlob], file.name, { type: compressedBlob.type || file.type })

      // 4. إنشاء thumbnail
      onProgress?.({
        fileName,
        progress: 40,
        status: 'compressing'
      })

      const thumbnailBlob = await createThumbnail(file)
      const thumbnailFile = new File([thumbnailBlob], `thumb_${file.name}`, { type: file.type })

      // 5. رفع الصورة الأساسية
      onProgress?.({
        fileName,
        progress: 60,
        status: 'uploading'
      })

      const mainFileName = generateFileName(file.name)
      const { data: mainData, error: mainError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`products/${mainFileName}`, compressedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (mainError) {
        throw new Error(`فشل رفع الصورة: ${mainError.message}`)
      }

      // 6. رفع thumbnail
      onProgress?.({
        fileName,
        progress: 80,
        status: 'uploading'
      })

      const thumbFileName = `thumb_${mainFileName}`
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`products/thumbnails/${thumbFileName}`, thumbnailFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (thumbError) {
        throw new Error(`فشل رفع الصورة المصغرة: ${thumbError.message}`)
      }

      // 7. الحصول على الروابط العامة
      const { data: mainUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(`products/${mainFileName}`)

      const { data: thumbUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(`products/thumbnails/${thumbFileName}`)

      onProgress?.({
        fileName,
        progress: 100,
        status: 'success'
      })

      return {
        data: {
          url: mainUrlData.publicUrl,
          thumbnailUrl: thumbUrlData.publicUrl,
          fileName: mainFileName
        },
        error: null
      }
    } catch (error: any) {
      console.error('❌ خطأ في رفع الصورة:', error)
      onProgress?.({
        fileName: file.name,
        progress: 0,
        status: 'error',
        error: error.message
      })
      return { data: null, error: error.message }
    }
  },

  /**
   * رفع عدة صور
   */
  async uploadMultipleImages(
    files: File[],
    onProgress?: (fileName: string, progress: UploadProgress) => void
  ): Promise<{ data: ImageUploadResult[] | null; error: string | null }> {
    try {
      const results: ImageUploadResult[] = []
      const errors: string[] = []

      for (const file of files) {
        const { data, error } = await this.uploadImage(file, (progress) => {
          onProgress?.(file.name, progress)
        })

        if (error) {
          errors.push(`${file.name}: ${error}`)
        } else if (data) {
          results.push(data)
        }
      }

      if (errors.length > 0) {
        return { data: null, error: errors.join(', ') }
      }

      return { data: results, error: null }
    } catch (error: any) {
      return { data: null, error: error.message }
    }
  },

  /**
   * حذف صورة من Storage
   */
  async deleteImage(fileName: string): Promise<{ error: string | null }> {
    try {
      if (!isSupabaseConfigured()) {
        return { error: null } // لا شيء للحذف في وضع base64
      }

      // حذف الصورة الأساسية
      const { error: mainError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([`products/${fileName}`])

      if (mainError) {
        throw new Error(`فشل حذف الصورة: ${mainError.message}`)
      }

      // حذف thumbnail
      const thumbFileName = `thumb_${fileName}`
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([`products/thumbnails/${thumbFileName}`])

      return { error: null }
    } catch (error: any) {
      console.error('❌ خطأ في حذف الصورة:', error)
      return { error: error.message }
    }
  },

  /**
   * رفع كـ base64 (بديل عندما Supabase غير متاح)
   */
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

