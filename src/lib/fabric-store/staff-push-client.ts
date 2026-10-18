/**
 * تفعيل إشعارات المتصفح على جهاز الموظف (طلبات المتجر الجديدة) — 18 أكتوبر 2026.
 * أندرويد: Chrome مباشرة. آيفون: يلزم «إضافة إلى الشاشة الرئيسية» ثم الفتح منها (iOS 16.4+).
 * تطبيق Capacitor (WebView) لا يدعم Web Push.
 */

import { supabase } from '@/lib/supabase'

export const STAFF_PUSH_SW_URL = '/staff-push-sw.js'
const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim()

export type StaffPushState = 'unsupported' | 'ios-needs-install' | 'not-configured' | 'denied' | 'off' | 'on'

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function staffApi(body: Record<string, unknown>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('الجلسة منتهية — سجّلي الدخول من جديد')
  const response = await fetch('/api/fabric-store/staff/push/', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'تعذّر تنفيذ الطلب')
}

export async function registerStaffPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(STAFF_PUSH_SW_URL, { scope: '/' })
  } catch {
    return null
  }
}

export async function getStaffPushState(): Promise<StaffPushState> {
  if (typeof window === 'undefined') return 'unsupported'
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  return subscription && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enableStaffPush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error('إشعارات المتصفح غير مهيّأة (مفتاح VAPID)')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('لم يُسمح بالإشعارات — اسمحي بها من إعدادات المتصفح للموقع')
  const registration = await registerStaffPushWorker()
  if (!registration) throw new Error('المتصفح لا يدعم الإشعارات')
  await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  await staffApi({ action: 'subscribe', subscription: subscription.toJSON() })
}

export async function disableStaffPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await staffApi({ action: 'unsubscribe', endpoint: subscription.endpoint }).catch(() => undefined)
  await subscription.unsubscribe()
}

export async function sendStaffPushTest(): Promise<void> {
  await staffApi({ action: 'test' })
}
