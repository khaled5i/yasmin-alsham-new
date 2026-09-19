'use client'

/**
 * بناء رسالة «استفسار عن السلة» عبر واتساب.
 *
 * هذه المرحلة لا تحتوي دفعاً ولا حجز مخزون، والرسالة تقول ذلك صراحةً
 * حتى لا تُفهم كطلب مؤكد. تُستبدل ببدء checkout في الخطة الثانية.
 */

import {
  FABRIC_VAT_RATE,
  formatQuantityLabel,
  type FabricCartTotals,
  type ResolvedFabricCartLine,
} from './fabric-commerce'
import { formatFabricNumber } from './fabric-number-format'

/** نفس رقم الاستفسار المستخدم في صفحة القماش والمعاينة السريعة. */
export const FABRIC_STORE_WHATSAPP_NUMBER = '966502901534'

export function buildCartInquiryMessage(
  lines: ResolvedFabricCartLine[],
  totals: FabricCartTotals
): string {
  const parts: string[] = ['مرحباً، أود الاستفسار عن هذه الأقمشة:', '']

  lines.forEach((line, index) => {
    const name = line.line.snapshot.label
    const code = line.fabric?.fabric_code || line.line.snapshot.fabricCode
    const color = line.fabric?.available_colors?.[0] || line.line.snapshot.color

    const identity = [name, code ? `رقم ${code}` : null, color].filter(Boolean).join(' — ')
    parts.push(`${index + 1}) ${identity}`)

    if (line.isPurchasable && line.unitPrice != null && line.lineTotal != null) {
      const quantityLabel = formatQuantityLabel(line.quantity, line.purchaseMode)
      const unitLabel = line.purchaseMode === 'piece' ? 'القطعة' : 'المتر'
      parts.push(
        `   ${quantityLabel} × ${formatFabricNumber(line.unitPrice)} ريال/${unitLabel} = ${formatFabricNumber(line.lineTotal)} ريال`
      )
    } else if (line.status === 'price-on-request') {
      parts.push('   السعر عند الطلب')
    } else if (line.status === 'pending') {
      parts.push('   لم يكتمل التحقق من توفّره')
    } else if (line.status === 'needs-quantity') {
      parts.push('   تغيّرت وحدة بيعه ولم تُعتمد الكمية بعد')
    } else {
      parts.push('   غير متاح حالياً — أرجو إفادتي بالبديل')
    }
  })

  if (totals.purchasableCount > 0) {
    parts.push(
      '',
      `المجموع قبل الضريبة: ${formatFabricNumber(totals.subtotal)} ريال`,
      `ضريبة القيمة المضافة ${Math.round(FABRIC_VAT_RATE * 100)}%: ${formatFabricNumber(totals.vat)} ريال`,
      `الإجمالي التقديري: ${formatFabricNumber(totals.total)} ريال`
    )
  }

  parts.push(
    '',
    'ملاحظة: هذا استفسار وليس طلباً مدفوعاً، ولا يحجز الكمية. الأسعار تقديرية للمراجعة.'
  )

  return parts.join('\n')
}

export function buildCartInquiryLink(
  lines: ResolvedFabricCartLine[],
  totals: FabricCartTotals
): string {
  const message = buildCartInquiryMessage(lines, totals)
  return `https://wa.me/${FABRIC_STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
