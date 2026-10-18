/**
 * إشعارات المتصفح (Web Push) لطلبات المتجر الجديدة — 18 أكتوبر 2026.
 *
 * - الأجهزة تشترك من صفحة «طلبات المتجر» (المدير ومدير متجر الأقمشة) ⇒ staff_push_subscriptions.
 * - «طلب جديد» = طلب **مدفوع** (غير المدفوع مجرد سلة لم تكتمل). يُرسل إشعاره مرة واحدة:
 *   يُحجز أولاً في fabric_store_order_push_log ثم يُرسل، فتكرار السداد (webhook + صفحة الرجوع +
 *   المهمة) لا يكرر الإشعار. المهمة المجدولة شبكة أمان لما فات خلال آخر 24 ساعة.
 * - المفاتيح: NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT. بدونها لا شيء يُرسل.
 * - قبل تطبيق هجرة 20261018120000 لا توجد الجداول: كل شيء يتوقف بصمت.
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface StaffPushPayload {
  title: string
  body: string
  url: string
  tag?: string
  orderId?: string
}

const ONLINE_ORDERS_PATH = '/dashboard/accounting/fabrics/online-orders/'
const CATCH_UP_WINDOW_MS = 24 * 3600_000

let configured: boolean | null = null

export function isStaffPushConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim()
  // جهة الاتصال لخدمات الإشعار (Google/Apple): mailto: أو رابط https للموقع
  const subject = (process.env.VAPID_SUBJECT ?? '').trim()
  if (!publicKey || !privateKey || !subject) return (configured = false)
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
  } catch (error) {
    console.error('staff push: VAPID configuration refused:', (error as Error).message)
    configured = false
  }
  return configured
}

/** معرّفات من يحق لهم الإشعار الآن: المدير الفعّال ومدير متجر الأقمشة الفعّال. */
async function currentStaffIds(client: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const allowed = new Set<string>()
  if (!userIds.length) return allowed
  const { data: users } = await client.from('users').select('id, role, is_active').in('id', userIds)
  const workerIds: string[] = []
  for (const u of users ?? []) {
    if (!u.is_active) continue
    if (u.role === 'admin') allowed.add(u.id)
    else if (u.role === 'worker') workerIds.push(u.id)
  }
  if (workerIds.length) {
    const { data: workers } = await client.from('workers').select('user_id, worker_type').in('user_id', workerIds)
    for (const w of workers ?? []) if (w.worker_type === 'fabric_store_manager') allowed.add(w.user_id)
  }
  return allowed
}

/** يرسل لكل أجهزة الموظفين المسموح لهم (أو لمستخدم واحد). يحذف الاشتراكات المنتهية. */
export async function sendStaffPush(
  client: SupabaseClient,
  payload: StaffPushPayload,
  options: { userId?: string } = {},
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 }
  if (!isStaffPushConfigured()) return result

  let query = client.from('staff_push_subscriptions').select('id, user_id, endpoint, p256dh, auth')
  if (options.userId) query = query.eq('user_id', options.userId)
  const { data: subscriptions, error } = await query
  if (error || !subscriptions?.length) return result

  const allowed = await currentStaffIds(client, [...new Set(subscriptions.map(s => s.user_id as string))])
  const body = JSON.stringify(payload)
  await Promise.all(subscriptions.map(async sub => {
    if (!allowed.has(sub.user_id)) return
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 6 * 3600, urgency: 'high', timeout: 8000 },
      )
      result.sent++
      await client.from('staff_push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (err) {
      result.failed++
      const status = (err as { statusCode?: number }).statusCode
      // الاشتراك انتهى أو أُلغي من المتصفح: يُحذف
      if (status === 404 || status === 410) {
        await client.from('staff_push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('staff push: send failed:', status ?? '', (err as Error).message)
      }
    }
  }))
  return result
}

/**
 * يرسل إشعار «طلب جديد» لكل طلب مدفوع لم يُرسل إشعاره (آخر 24 ساعة). لا يرمي أبداً.
 * `orderId` يقصر الفحص على طلب واحد (بعد السداد مباشرة).
 */
export async function notifyNewPaidOrders(client: SupabaseClient, options: { orderId?: string } = {}): Promise<number> {
  if (!isStaffPushConfigured()) return 0
  try {
    let query = client
      .from('fabric_store_orders')
      .select(`id, order_number, customer_name, total_halalas, delivery_method, paid_at,
        paid_attempt:fabric_store_payment_attempts!fabric_store_orders_paid_attempt_id_fkey (environment)`)
      .in('payment_status', ['paid', 'partially_refunded'])
      .gte('paid_at', new Date(Date.now() - CATCH_UP_WINDOW_MS).toISOString())
      .order('paid_at', { ascending: true })
      .limit(20)
    if (options.orderId) query = query.eq('id', options.orderId)
    const { data: orders, error } = await query
    if (error || !orders?.length) return 0

    // الحجز قبل الإرسال: من يُدرج السطر هو وحده من يرسل (ON CONFLICT DO NOTHING RETURNING)
    const { data: claimed, error: claimError } = await client
      .from('fabric_store_order_push_log')
      .upsert(orders.map(o => ({ order_id: o.id })), { onConflict: 'order_id', ignoreDuplicates: true })
      .select('order_id')
    if (claimError || !claimed?.length) return 0
    const claimedIds = new Set(claimed.map(c => c.order_id as string))

    let count = 0
    for (const order of orders) {
      if (!claimedIds.has(order.id)) continue
      const attempt = Array.isArray(order.paid_attempt) ? order.paid_attempt[0] : order.paid_attempt
      const total = (Number(order.total_halalas) / 100).toLocaleString('ar-SA', { maximumFractionDigits: 2 })
      await sendStaffPush(client, {
        title: `🛍️ طلب جديد من المتجر ${order.order_number}`,
        body: `${order.customer_name} · ${total} ر.س · ${order.delivery_method === 'pickup' ? 'استلام من المحل' : 'شحن'}`
          + (attempt?.environment === 'test' ? ' (دفعة اختبار)' : ''),
        url: `${ONLINE_ORDERS_PATH}?order=${order.id}`,
        tag: `fabric-order-${order.id}`,
        orderId: order.id,
      })
      count++
    }
    return count
  } catch (error) {
    console.error('staff push: new order notification failed:', (error as Error).message)
    return 0
  }
}
