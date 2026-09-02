/**
 * ورقة التعديل الحرارية (80mm) لورشة التعديلات.
 *
 * كل طلب طباعة يُنتج ورقتين منفصلتين: الأولى بالعربية والثانية بالهندية،
 * ويفصل بينهما قطع كامل حتى تصل كل نسخة إلى العامل المعني بها وحدها.
 * الحمولة هنا نصوص جاهزة فقط؛ تطبيق المحطة لا يعرف قاعدة البيانات ولا
 * أنواع التعديلات، فيطبع ما يصله كما هو.
 */

import type { AlterationType } from '@/lib/services/alteration-service'
import { getAlterationText, type AlterationTextSource } from '@/lib/alteration-text'

export const ALTERATION_SLIP_JOB_TYPE = 'alteration_slip'
export const ALTERATION_TEST_SLIP_JOB_TYPE = 'alteration_test_slip'

const TITLE_AR: Record<AlterationType, string> = {
  first_proof: 'تعديل البروفة الأولى',
  second_proof: 'تعديل البروفة الثانية',
  after_delivery: 'تعديل بعد التسليم',
}

const TITLE_HI: Record<AlterationType, string> = {
  first_proof: 'पहली फिटिंग का बदलाव',
  second_proof: 'दूसरी फिटिंग का बदलाव',
  after_delivery: 'डिलीवरी के बाद का बदलाव',
}

export interface AlterationSlipPayload {
  alteration_id: string
  alteration_number: string
  alteration_type: AlterationType
  /** عنوان الورقة العربية، جاهزًا للطباعة. */
  title_ar: string
  /** عنوان الورقة الهندية؛ فارغ يعني ألا تُطبع الورقة الثانية. */
  title_hi: string
  client_name: string
  /** موعد تسليم التعديل بصيغة yyyy/mm/dd، أو فارغ إن لم يُحدَّد. */
  due_date: string
  content_ar: string
  /** محتوى التعديل بالهندية؛ فارغ يعني ألا تُطبع الورقة الثانية. */
  content_hi: string
  created_at: string
}

export function getAlterationTitleAr(alterationType: AlterationType): string {
  return TITLE_AR[alterationType] ?? TITLE_AR.after_delivery
}

export function getAlterationTitleHi(alterationType: AlterationType): string {
  return TITLE_HI[alterationType] ?? TITLE_HI.after_delivery
}

/** تاريخ محايد اللغة (yyyy/mm/dd) يقرأه عامل الورشة بأي لغة. */
export function formatSlipDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

export interface AlterationSlipSource extends AlterationTextSource {
  id: string
  alteration_number?: string | null
  alteration_type?: AlterationType | null
  client_name?: string | null
  alteration_due_date?: string | null
  created_at?: string | null
}

/**
 * يبني الحمولة من سجل تعديل كامل. يجب أن يكون السجل مُحمَّلًا بالكامل
 * (getById) لأن قوائم التعديلات المخففة لا تجلب voice_transcriptions،
 * فتخرج ورقة ناقصة المحتوى.
 */
export function buildAlterationSlipPayload(
  alteration: AlterationSlipSource,
  hindiContent: string
): AlterationSlipPayload {
  const alterationType: AlterationType = alteration.alteration_type ?? 'after_delivery'
  const contentAr = getAlterationText(alteration)
  const contentHi = hindiContent.trim()

  return {
    alteration_id: String(alteration.id || ''),
    alteration_number: String(alteration.alteration_number || '').trim(),
    alteration_type: alterationType,
    title_ar: getAlterationTitleAr(alterationType),
    title_hi: contentHi ? getAlterationTitleHi(alterationType) : '',
    client_name: String(alteration.client_name || '').trim(),
    due_date: formatSlipDate(alteration.alteration_due_date),
    content_ar: contentAr,
    content_hi: contentHi,
    created_at: String(alteration.created_at || new Date().toISOString()),
  }
}
