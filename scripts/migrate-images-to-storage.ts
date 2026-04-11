/**
 * سكريبت ترحيل صور base64 من قاعدة البيانات إلى Supabase Storage
 *
 * ⚠️  الشروط قبل التشغيل:
 *   1. نفّذت migration 31-bucket-setup.sql في Supabase Dashboard
 *   2. الكود الجديد (storage-service.ts) مرفوع ويعمل على الإنترنت
 *   3. عندك ملف .env.local يحتوي SUPABASE_SERVICE_ROLE_KEY
 *      (لأن الـ anon key لا يكفي للعمليات الكبيرة)
 *
 * التشغيل:
 *   npx tsx scripts/migrate-images-to-storage.ts
 *
 * ما تفعله:
 *   - يقرأ الطلبات القديمة التي تحتوي base64 في measurements أو completed_images
 *   - يرفع كل صورة إلى Supabase Storage
 *   - يحدّث السجل بالـ URL الجديد
 *   - يعمل بشكل تدريجي (10 طلبات كل مرة + انتظار بين الدُفعات)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ──────────────────────────────────────────────────────────────
// تحميل متغيرات البيئة من .env.local
// ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌ ملف .env.local غير موجود')
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const BUCKET    = 'order-images'
const BATCH     = 10   // عدد الطلبات في كل دُفعة
const PAUSE_MS  = 800  // انتظار بين الدُفعات (ms) لتخفيف الضغط

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ──────────────────────────────────────────────────────────────
// مساعدات
// ──────────────────────────────────────────────────────────────

function isBase64(str: unknown): str is string {
  return typeof str === 'string' && str.startsWith('data:image/')
}

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mime: string; ext: string } {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const ext  = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  return { buffer: Buffer.from(data, 'base64'), mime, ext }
}

async function uploadToStorage(
  base64: string,
  filePath: string
): Promise<string | null> {
  const { buffer, mime, ext } = base64ToBuffer(base64)
  const fullPath = filePath.endsWith('.jpg') || filePath.endsWith('.png') || filePath.endsWith('.webp')
    ? filePath
    : `${filePath}.${ext}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, buffer, { upsert: true, contentType: mime })

  if (error) {
    console.error(`  ❌ رفع فاشل: ${fullPath} — ${error.message}`)
    return null
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

// ──────────────────────────────────────────────────────────────
// معالجة طلب واحد
// ──────────────────────────────────────────────────────────────

async function migrateOrder(order: any): Promise<boolean> {
  const updates: Record<string, any> = {}
  let changed = false

  const m = { ...(order.measurements ?? {}) }

  // 1. custom_design_image
  if (isBase64(m.custom_design_image)) {
    const url = await uploadToStorage(
      m.custom_design_image,
      `orders/${order.id}/custom_design/0`
    )
    if (url) { m.custom_design_image = url; changed = true }
  }

  // 2. design_thumbnail
  if (isBase64(m.design_thumbnail)) {
    const url = await uploadToStorage(
      m.design_thumbnail,
      `orders/${order.id}/thumbnail/0`
    )
    if (url) { m.design_thumbnail = url; changed = true }
  }

  // 3. ai_generated_images
  const aiImages: string[] = m.ai_generated_images ?? []
  if (aiImages.some(isBase64)) {
    const uploaded = await Promise.all(
      aiImages.map((img, i) =>
        isBase64(img)
          ? uploadToStorage(img, `orders/${order.id}/ai_generated/${i}`)
              .then(url => url ?? img)
          : Promise.resolve(img)
      )
    )
    m.ai_generated_images = uploaded
    changed = true
  }

  if (changed) updates.measurements = m

  // 4. completed_images[]
  const completed: string[] = order.completed_images ?? []
  if (completed.some(isBase64)) {
    const uploaded = await Promise.all(
      completed.map((img, i) =>
        isBase64(img)
          ? uploadToStorage(img, `orders/${order.id}/completed/${i}`)
              .then(url => url ?? img)
          : Promise.resolve(img)
      )
    )
    updates.completed_images = uploaded
    changed = true
  }

  // 5. images[] (صور التصميم — غالباً URLs لكن نعالج الحالات القديمة)
  const images: string[] = order.images ?? []
  if (images.some(isBase64)) {
    const uploaded = await Promise.all(
      images.map((img, i) =>
        isBase64(img)
          ? uploadToStorage(img, `orders/${order.id}/thumbnail/${i}`)
              .then(url => url ?? img)
          : Promise.resolve(img)
      )
    )
    updates.images = uploaded
    changed = true
  }

  if (!changed) return false

  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', order.id)

  if (error) {
    console.error(`  ❌ تحديث فاشل للطلب ${order.id}: ${error.message}`)
    return false
  }

  return true
}

// ──────────────────────────────────────────────────────────────
// الحلقة الرئيسية
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 بدء ترحيل الصور إلى Supabase Storage...')
  console.log(`   Bucket: ${BUCKET}  |  Batch: ${BATCH}  |  Pause: ${PAUSE_MS}ms\n`)

  let page = 0
  let totalProcessed = 0
  let totalMigrated  = 0

  while (true) {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, measurements, completed_images, images')
      .order('created_at', { ascending: false })
      .range(page * BATCH, (page + 1) * BATCH - 1)

    if (error) { console.error('❌ خطأ في جلب الطلبات:', error.message); break }
    if (!orders?.length) break

    console.log(`📦 الدُفعة ${page + 1} — ${orders.length} طلب`)

    for (const order of orders) {
      const needsMigration =
        isBase64(order.measurements?.custom_design_image) ||
        isBase64(order.measurements?.design_thumbnail)    ||
        (order.measurements?.ai_generated_images ?? []).some(isBase64) ||
        (order.completed_images ?? []).some(isBase64)     ||
        (order.images ?? []).some(isBase64)

      if (!needsMigration) continue

      process.stdout.write(`  📸 ${order.id} ... `)
      const ok = await migrateOrder(order)
      console.log(ok ? '✅ تم' : '⚠️  جزئي أو فاشل')
      if (ok) totalMigrated++
    }

    totalProcessed += orders.length
    page++

    if (orders.length < BATCH) break // آخر صفحة
    await new Promise(r => setTimeout(r, PAUSE_MS))
  }

  console.log(`\n✅ انتهى — فُحص ${totalProcessed} طلب، رُحِّل ${totalMigrated} طلب`)
}

main().catch(err => {
  console.error('❌ خطأ غير متوقع:', err)
  process.exit(1)
})
