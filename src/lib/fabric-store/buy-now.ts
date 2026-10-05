/**
 * «شراء الآن»: إتمام طلب قماش واحد دون المرور بالسلة ودون تعديلها.
 *
 * السطر يُمرَّر في عنوان صفحة الإتمام فقط (لا تخزين محلي)، والخادم يعيد
 * التسعير والتحقق من الكمية كأي سطر سلة — هذا الملف لا يقرر سعراً ولا حدوداً.
 */

import type { FabricPurchaseMode } from './pricing'

export interface FabricBuyNowLine {
  fabricId: string
  purchaseMode: FabricPurchaseMode
  quantity: number
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildBuyNowHref(line: FabricBuyNowLine): string {
  const params = new URLSearchParams({
    buy: line.fabricId,
    mode: line.purchaseMode,
    qty: String(line.quantity),
  })
  return `/fabrics/checkout/?${params.toString()}`
}

/** يقرأ سطر «شراء الآن» من عنوان الصفحة؛ null إن لم يوجد أو كان مشوّهاً. */
export function parseBuyNowLine(search: string): FabricBuyNowLine | null {
  const params = new URLSearchParams(search)
  const fabricId = params.get('buy') ?? ''
  const mode = params.get('mode')
  const quantity = Number(params.get('qty'))
  if (!UUID_PATTERN.test(fabricId)) return null
  if (mode !== 'meter' && mode !== 'piece') return null
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return { fabricId, purchaseMode: mode, quantity: mode === 'piece' ? 1 : quantity }
}
