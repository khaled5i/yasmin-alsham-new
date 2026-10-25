/**
 * أجزاء JSON-LD لعرض القماش (Offer) في بيانات جوجل المنظّمة: الشحن وسياسة الإرجاع.
 *
 * كل رقم مقروء من مصدر السياسات نفسه (checkout-contract.ts وstore-legal.ts) حتى لا
 * تختلف نتائج البحث عن صفحتَي الشحن والاسترجاع وصفحة الدفع. لا تقييمات هنا: المتجر
 * لا يجمع تقييمات منتجات، وجوجل يمنع إضافة تقييمات غير معروضة على الصفحة.
 */

import { FABRIC_DELIVERY_OPTIONS, FABRIC_STORE_FREE_SHIPPING_MIN_ITEMS_GROSS_HALALAS } from './checkout-contract'
import { STORE_RETURN_RULES, STORE_SHIPPING_DAYS } from '@/lib/store-legal'

const SCHEMA = 'https://schema.org/'
const ALL_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => `${SCHEMA}${day}`)

function dayRange(range: { min: number; max: number }) {
  return { '@type': 'QuantitativeValue', minValue: range.min, maxValue: range.max, unitCode: 'DAY' }
}

/**
 * الشحن داخل السعودية لشراء وحدة واحدة بسعر العرض (شامل الضريبة): مجاني متى بلغ
 * العتبة، وإلا الرسم الموحّد. نفس منطق resolveFabricDeliveryOption.
 */
export function buildFabricShippingDetails(unitPriceGrossSar: number) {
  const isFree = Math.round(unitPriceGrossSar * 100) >= FABRIC_STORE_FREE_SHIPPING_MIN_ITEMS_GROSS_HALALAS
  const rateHalalas = isFree ? 0 : FABRIC_DELIVERY_OPTIONS.shipping.shippingGrossHalalas

  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: rateHalalas / 100, currency: 'SAR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'SA' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: dayRange(STORE_SHIPPING_DAYS.handling),
      transitTime: dayRange(STORE_SHIPPING_DAYS.transit),
      businessDays: { '@type': 'OpeningHoursSpecification', dayOfWeek: ALL_WEEK },
    },
  }
}

/**
 * سياسة /return-policy: القطعة الكاملة غير المقصوصة تُرجع خلال المدة (شحن الإرجاع
 * على العميلة إلا للعيب)، والقماش المقصوص بالمتر لا يُرجع إلا لعيب — أي لا إرجاع
 * بتغيير الرأي، وهو ما تعنيه فئة جوجل.
 */
export function buildFabricReturnPolicy(isWholePiece: boolean) {
  if (!isWholePiece) {
    return {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'SA',
      returnPolicyCategory: `${SCHEMA}MerchantReturnNotPermitted`,
    }
  }

  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'SA',
    returnPolicyCategory: `${SCHEMA}MerchantReturnFiniteReturnWindow`,
    merchantReturnDays: STORE_RETURN_RULES.returnWindowDays,
    returnMethod: `${SCHEMA}ReturnByMail`,
    returnFees: `${SCHEMA}ReturnShippingFees`,
    itemDefectReturnFees: `${SCHEMA}FreeReturn`,
  }
}
