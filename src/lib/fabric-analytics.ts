/**
 * أحداث التجارة الإلكترونية لمتجر الأقمشة في Google Analytics (أسماء GA4 القياسية حتى تظهر
 * تقارير «تحقيق الدخل» وقمع الشراء جاهزة).
 *
 * لا يُرسل هنا أي بيان شخصي: لا اسم ولا جوال ولا عنوان — معرّف القماش ورمزه وسعره وكميته فقط.
 * الأسعار قبل الضريبة (كما تُخزَّن)، والكمية بالمتر أو بالقطعة حسب طريقة البيع.
 * صفحات الدفع وتتبّع الطلب ما زالت مستثناة من GA (analytics-privacy.ts)؛ لذلك يُرسل
 * begin_checkout عند الضغط قبل الانتقال، وpurchase له مسار خاص موثَّق في trackFabricPurchase.
 */

import { GA_DISABLE_FLAG } from './analytics-privacy'

export interface FabricAnalyticsItem {
  item_id: string
  item_name: string
  item_category?: string
  item_variant?: string
  price?: number
  quantity?: number
  index?: number
  item_list_name?: string
}

interface ItemSource {
  id: string
  name?: string | null
  fabric_code?: string | null
  category?: string | null
  available_colors?: string[] | null
}

type Gtag = (...args: unknown[]) => void

function gtag(): Gtag | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { gtag?: Gtag }).gtag ?? null
}

function send(eventName: string, params: Record<string, unknown>) {
  gtag()?.('event', eventName, params)
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function toAnalyticsItem(
  fabric: ItemSource,
  extra: { price?: number | null; quantity?: number; index?: number; listName?: string } = {}
): FabricAnalyticsItem {
  const item: FabricAnalyticsItem = {
    item_id: fabric.fabric_code?.trim() || fabric.id,
    item_name: (fabric.name?.trim() || fabric.fabric_code?.trim() || 'قماش').slice(0, 100),
  }
  if (fabric.category) item.item_category = fabric.category
  const color = fabric.available_colors?.[0]?.trim()
  if (color) item.item_variant = color
  if (extra.price != null && Number.isFinite(extra.price)) item.price = round2(extra.price)
  if (extra.quantity != null) item.quantity = extra.quantity
  if (extra.index != null) item.index = extra.index
  if (extra.listName) item.item_list_name = extra.listName
  return item
}

/** عنصر من لقطة السلة/المفضلة المحفوظة (حين لا يكون القماش الكامل في اليد). */
export function snapshotToAnalyticsItem(
  fabricId: string,
  snapshot: { label: string; fabricCode: string | null; color: string | null; unitPrice: number | null },
  quantity?: number
): FabricAnalyticsItem {
  const item: FabricAnalyticsItem = {
    item_id: snapshot.fabricCode?.trim() || fabricId,
    item_name: snapshot.label.slice(0, 100),
  }
  if (snapshot.color) item.item_variant = snapshot.color
  if (snapshot.unitPrice != null) item.price = round2(snapshot.unitPrice)
  if (quantity != null) item.quantity = quantity
  return item
}

function itemsValue(items: FabricAnalyticsItem[]): number {
  return round2(items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0))
}

function commerce(eventName: string, items: FabricAnalyticsItem[], params: Record<string, unknown> = {}) {
  if (items.length === 0) return
  send(eventName, { currency: 'SAR', value: itemsValue(items), items, ...params })
}

export const trackFabricListView = (listName: string, items: FabricAnalyticsItem[]) =>
  items.length > 0 && send('view_item_list', { item_list_name: listName, items: items.slice(0, 50) })

export const trackFabricSelect = (listName: string, item: FabricAnalyticsItem) =>
  send('select_item', { item_list_name: listName, items: [item] })

export const trackFabricView = (item: FabricAnalyticsItem) => commerce('view_item', [item])

export const trackAddToCart = (item: FabricAnalyticsItem) => commerce('add_to_cart', [item])

export const trackRemoveFromCart = (item: FabricAnalyticsItem) => commerce('remove_from_cart', [item])

export const trackAddToWishlist = (item: FabricAnalyticsItem) => commerce('add_to_wishlist', [item])

export const trackViewCart = (items: FabricAnalyticsItem[]) => commerce('view_cart', items)

const CHECKOUT_ITEMS_KEY = 'ga-checkout-items'

/**
 * يُستدعى عند الضغط على زر الدفع، قبل الانتقال إلى صفحة إتمام الطلب المستثناة.
 * يحفظ الأقمشة لهذه الجلسة حتى يحملها حدث purchase: «شراء الآن» لا يمر بالسلة،
 * فالسلة وحدها لا تصف ما دُفع ثمنه.
 */
export function trackBeginCheckout(items: FabricAnalyticsItem[], source: 'cart' | 'buy_now') {
  try { window.sessionStorage.setItem(CHECKOUT_ITEMS_KEY, JSON.stringify(items)) } catch { /* التخزين مرفوض */ }
  commerce('begin_checkout', items, { checkout_source: source, transport_type: 'beacon' })
}

function readCheckoutItems(): FabricAnalyticsItem[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CHECKOUT_ITEMS_KEY) ?? '[]')
    window.sessionStorage.removeItem(CHECKOUT_ITEMS_KEY)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** ضغطة على أي زر واتساب في المتجر (generate_lead حدث GA4 قياسي يمكن جعله «حدثاً رئيسياً»). */
export const trackWhatsAppClick = (placement: string, fabric?: ItemSource) =>
  send('generate_lead', {
    lead_source: 'whatsapp',
    placement,
    ...(fabric && { item_id: fabric.fabric_code?.trim() || fabric.id }),
    transport_type: 'beacon',
  })

/** بحث أو تصفية داخل المتجر — يكشف ما تبحث عنه الزبونات ولا تجده. */
export const trackFabricSearch = (term: string, resultsCount: number) =>
  term.trim().length >= 2 && send('search', { search_term: term.trim().slice(0, 100), results_count: resultsCount })

export const trackFabricFilter = (filterType: string, value: string) =>
  send('fabric_filter', { filter_type: filterType, filter_value: value.slice(0, 100) })

/**
 * الشراء المكتمل. صفحة الرجوع من ميسر مستثناة من GA لأن عنوانها يحمل معرّف المحاولة،
 * فنرفع علم التعطيل لهذا الحدث وحده ثم نعيده فوراً، مع page_location وpage_referrer صريحين
 * بلا استعلام. الحدث لا يحمل إلا رقم الطلب والمبلغ والأقمشة — لا أي بيان للزبونة.
 * GA يُسقط تكرار نفس transaction_id، وsessionStorage يمنع إعادة الإرسال عند تحديث الصفحة.
 */
export function trackFabricPurchase(orderNumber: string, totalSar: number) {
  const g = gtag()
  if (!g || !orderNumber) return
  const key = `ga-purchase-${orderNumber}`
  try {
    if (window.sessionStorage.getItem(key)) return
    window.sessionStorage.setItem(key, '1')
  } catch {
    // التخزين مرفوض: GA نفسه يُسقط التكرار بنفس transaction_id
  }

  const win = window as unknown as Record<string, unknown>
  const safeLocation = `${window.location.origin}/fabrics/payment/return/`
  // gtag.js قد يعالج الأمر بعد لحظة لا فوراً، فالعلم يبقى مرفوعاً ثانيتين؛ وخلالهما أي حدث
  // تلقائي يحمل العنوان الآمن نفسه (بلا معرّف المحاولة) بفضل set.
  g('set', { page_location: safeLocation, page_referrer: `${window.location.origin}/fabrics/checkout/` })
  win[GA_DISABLE_FLAG] = false
  g('event', 'purchase', {
    transaction_id: orderNumber,
    currency: 'SAR',
    value: round2(totalSar),
    items: readCheckoutItems(),
    page_location: safeLocation,
    transport_type: 'beacon',
  })
  window.setTimeout(() => {
    if (window.location.pathname.startsWith('/fabrics/payment/')) win[GA_DISABLE_FLAG] = true
  }, 2000)
}
