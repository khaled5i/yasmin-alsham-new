/**
 * دول الشحن لمتجر الأقمشة (قرار المالكة 19 نوفمبر 2026: الشحن لكل دول العالم).
 *
 * وحدة نقية مشتركة بين صفحة الدفع والخادم: رموز ISO 3166-1 الثنائية، والأسماء العربية
 * من `Intl.DisplayNames` فلا نكتب 240 اسماً بأيدينا. الخادم يرفض أي رمز ليس هنا.
 *
 * مستبعدة: الأقاليم غير المأهولة (AQ BV HM TF UM IO GS)، وما لا يُشحن إليه من المملكة
 * (IL KP)، وEH.
 */

export const FABRIC_STORE_HOME_COUNTRY = 'SA'

/** دول الخليج أولاً بعد السعودية في القائمة — أغلب الطلبات الدولية المتوقعة منها. */
const PRIORITY_CODES = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'] as const

const OTHER_CODES = (
  'AD AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BI BJ BL BM BN BO BQ BR BS BT BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK ' +
  'FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IM IN IQ IR IS IT ' +
  'JE JM JO JP KE KG KH KI KM KN KR KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM ' +
  'MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ PA PE PF PG PH PK PL PM PN ' +
  'PR PS PT PW PY RE RO RS RU RW SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH ' +
  'TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const ALL_CODES = new Set<string>([...PRIORITY_CODES, ...OTHER_CODES])

export function isFabricStoreCountry(code: string): boolean {
  return ALL_CODES.has(code)
}

let arabicNames: Intl.DisplayNames | null | undefined

/** اسم الدولة بالعربية، أو الرمز نفسه إن لم يدعم المتصفح Intl.DisplayNames. */
export function fabricCountryName(code: string): string {
  if (arabicNames === undefined) {
    try {
      arabicNames = new Intl.DisplayNames(['ar'], { type: 'region' })
    } catch {
      arabicNames = null
    }
  }
  try {
    return arabicNames?.of(code) ?? code
  } catch {
    return code
  }
}

let cachedOptions: { code: string; name: string }[] | null = null

/** خيارات قائمة الدول: السعودية والخليج أولاً، ثم البقية بالترتيب الأبجدي العربي. */
export function fabricCountryOptions(): { code: string; name: string }[] {
  if (cachedOptions) return cachedOptions
  const rest = OTHER_CODES
    .map(code => ({ code, name: fabricCountryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
  cachedOptions = [...PRIORITY_CODES.map(code => ({ code, name: fabricCountryName(code) })), ...rest]
  return cachedOptions
}
