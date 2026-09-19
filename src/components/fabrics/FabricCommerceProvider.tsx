'use client'

import { useFabricCommerceSync } from '@/hooks/useFabricCommerce'

/**
 * يحمّل السلة والمفضلة من التخزين المحلي بعد الـhydration ويشغّل مزامنة
 * التبويبات. يُركَّب مرة واحدة في تخطيط متجر الأقمشة ولا يعرض شيئاً.
 */
export default function FabricCommerceProvider() {
  useFabricCommerceSync()
  return null
}
