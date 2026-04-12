/**
 * Storage Service — رفع الصور إلى Supabase Storage
 *
 * يتولى:
 *  - الكشف عن سلاسل base64
 *  - تحويل base64 إلى Blob ورفعها
 *  - معالجة جميع حقول الصور في بيانات الطلب قبل الحفظ في قاعدة البيانات
 *
 * bucket: order-images (public)
 * هيكل المسارات:
 *   orders/{orderId}/custom_design/0.jpg
 *   orders/{orderId}/ai_generated/0.jpg
 *   orders/{orderId}/ai_generated/1.jpg
 *   orders/{orderId}/completed/0.jpg
 *   orders/{orderId}/thumbnail/0.jpg
 */

import { supabase } from '../supabase'

const BUCKET = 'order-images'

// ============================================================================
// الكشف
// ============================================================================

/** هل السلسلة base64 data URL لصورة؟ */
export function isBase64Image(str: string | null | undefined): boolean {
  if (!str) return false
  return str.startsWith('data:image/')
}

// ============================================================================
// الرفع الأساسي
// ============================================================================

function base64ToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: mime }), ext }
}

/**
 * ارفع base64 إلى Supabase Storage في المسار المحدد.
 * @returns الـ public URL، أو null عند الفشل
 */
export async function uploadBase64ToStorage(
  base64: string,
  path: string
): Promise<string | null> {
  try {
    const { blob } = base64ToBlob(base64)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type })

    if (error) {
      console.error('❌ Storage upload error:', error.message, 'path:', path)
      return null
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
    return urlData.publicUrl
  } catch (e: any) {
    console.error('❌ uploadBase64ToStorage exception:', e.message)
    return null
  }
}

/**
 * ارفع صورة واحدة إلى Storage.
 * إذا كانت السلسلة URL بالفعل → أعدها كما هي.
 * إذا فشل الرفع → أعد base64 كـ fallback (لا تضيع البيانات).
 */
export async function uploadImageToStorage(
  imageStr: string,
  orderId: string,
  type: 'custom_design' | 'ai_generated' | 'completed' | 'thumbnail',
  index = 0
): Promise<string> {
  if (!isBase64Image(imageStr)) return imageStr // URL بالفعل

  const [header] = imageStr.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const path = `orders/${orderId}/${type}/${index}.${ext}`

  const url = await uploadBase64ToStorage(imageStr, path)
  if (!url) {
    console.warn(`⚠️ فشل رفع ${type}[${index}] — الاحتفاظ بـ base64 كاحتياط`)
    return imageStr
  }
  return url
}

// ============================================================================
// معالجة شاملة لحقول الصور في بيانات الطلب
// ============================================================================

export interface OrderImageFields {
  measurements?: Record<string, any>
  design_thumbnail?: string        // عمود مستقل (migration 32)
  images?: string[]
  completed_images?: string[]
}

export interface UploadedOrderImages {
  measurements?: Record<string, any>
  design_thumbnail?: string        // عمود مستقل (migration 32)
  images?: string[]
  completed_images?: string[]
}

/**
 * افحص جميع حقول الصور في بيانات الطلب، وارفع أي base64 إلى Storage.
 * @returns كائن يحتوي فقط على الحقول التي تغيرت، أو null إذا لم يتغير شيء
 */
export async function uploadOrderImages(
  orderId: string,
  fields: OrderImageFields
): Promise<UploadedOrderImages | null> {
  const result: UploadedOrderImages = {}
  let hasChanges = false

  const measurements = fields.measurements ?? {}
  const updatedMeasurements = { ...measurements }

  // 1. custom_design_image داخل measurements
  if (isBase64Image(measurements.custom_design_image)) {
    const url = await uploadImageToStorage(measurements.custom_design_image, orderId, 'custom_design')
    if (url !== measurements.custom_design_image) {
      updatedMeasurements.custom_design_image = url
      hasChanges = true
    }
  }

  // 2. ai_generated_images (مصفوفة) داخل measurements
  const aiImages: string[] = measurements.ai_generated_images ?? []
  if (aiImages.some(isBase64Image)) {
    updatedMeasurements.ai_generated_images = await Promise.all(
      aiImages.map((img, i) =>
        isBase64Image(img)
          ? uploadImageToStorage(img, orderId, 'ai_generated', i)
          : Promise.resolve(img)
      )
    )
    hasChanges = true
  }

  if (hasChanges) {
    result.measurements = updatedMeasurements
  }

  // 3. design_thumbnail — عمود مستقل (migration 32)، يُرفع لـ Storage إذا كان base64
  if (isBase64Image(fields.design_thumbnail)) {
    const url = await uploadImageToStorage(fields.design_thumbnail!, orderId, 'thumbnail')
    result.design_thumbnail = url
    hasChanges = true
  } else if (fields.design_thumbnail && fields.design_thumbnail !== result.design_thumbnail) {
    // URL بالفعل — نمرره كما هو
    result.design_thumbnail = fields.design_thumbnail
    hasChanges = true
  }

  // 4. images[] (عمود مستقل — غالباً URLs بالفعل لكن نعالج الحالات القديمة)
  const images = fields.images ?? []
  if (images.some(isBase64Image)) {
    result.images = await Promise.all(
      images.map((img, i) =>
        isBase64Image(img)
          ? uploadImageToStorage(img, orderId, 'thumbnail', i)
          : Promise.resolve(img)
      )
    )
    hasChanges = true
  }

  // 5. completed_images[] (صور العمل المنتهي)
  const completed = fields.completed_images ?? []
  if (completed.some(isBase64Image)) {
    result.completed_images = await Promise.all(
      completed.map((img, i) =>
        isBase64Image(img)
          ? uploadImageToStorage(img, orderId, 'completed', i)
          : Promise.resolve(img)
      )
    )
    hasChanges = true
  }

  return hasChanges ? result : null
}
