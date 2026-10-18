/*
 * عامل خدمة إشعارات الموظفين (طلبات المتجر الجديدة) — 18 أكتوبر 2026.
 * لا يعترض أي طلب شبكة (لا fetch handler) ولا يخزّن شيئاً: إشعارات فقط.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = data.title || 'طلب جديد من المتجر'
  const url = data.url || '/dashboard/accounting/fabrics/online-orders/'

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag || 'fabric-store-order',
      renotify: true,
      requireInteraction: true,
      dir: 'rtl',
      lang: 'ar',
      icon: '/favicon/web-app-manifest-192x192.png',
      badge: '/favicon/favicon-96x96.png',
      vibrate: [200, 100, 200],
      data: { url, orderId: data.orderId || null },
    })
    // اللوحة مفتوحة؟ تُظهر نافذتها المنبثقة فوراً بدل انتظار الاستطلاع التالي
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage({ type: 'fabric-store-new-order', orderId: data.orderId || null })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard/accounting/fabrics/online-orders/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(target)
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
