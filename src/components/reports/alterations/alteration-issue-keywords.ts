/**
 * تصنيف نص التعديل (الملاحظات + ملاحظات السبب) إلى مواضع وإجراءات بقاموس كلمات مكشوف.
 * لا ذكاء اصطناعي ولا تخمين: كل تعديل يُعدّ في الموضع إذا ورد فيه أحد ألفاظه بعد التطبيع.
 * لإضافة لفظ: أضفه بلا «ال» ولا «و» في أوله، وبالهاء بدل التاء المربوطة (مثل «رقبه»).
 */

export interface IssueGroup {
  key: string
  label: string
  /** ألفاظ تُطابَق كلمةً كاملة بعد حذف السوابق واللواحق الشائعة. */
  words: string[]
}

export const ISSUE_AREAS: IssueGroup[] = [
  { key: 'length', label: 'الطول', words: ['طول'] },
  { key: 'bust', label: 'الصدر', words: ['صدر', 'بست'] },
  { key: 'waist', label: 'الخصر', words: ['خصر', 'وسط'] },
  { key: 'sleeves', label: 'الأكمام', words: ['كم', 'اكمام', 'كمام', 'كمين'] },
  { key: 'back', label: 'الظهر', words: ['ظهر', 'خلف'] },
  { key: 'front', label: 'الأمام', words: ['امام', 'قدام'] },
  { key: 'shoulders', label: 'الأكتاف', words: ['كتف', 'اكتاف', 'كتوف'] },
  { key: 'hips', label: 'الأرداف والورك', words: ['ارداف', 'ردف', 'ورك', 'اوراك', 'حوض'] },
  { key: 'neckline', label: 'الرقبة والقبّة', words: ['رقبه', 'قبه', 'ياقه'] },
  { key: 'armhole', label: 'الإبط والحفرة', words: ['ابط', 'باط', 'حفره', 'حفر'] },
  { key: 'skirt', label: 'التنورة والذيل', words: ['تنوره', 'ذيل', 'ديل', 'كلوش'] },
  { key: 'padding', label: 'الحشوات', words: ['حشوات', 'حشوه', 'حشو'] },
  { key: 'lining', label: 'البطانة', words: ['بطانه'] },
  { key: 'zipper', label: 'السحّاب', words: ['سحاب', 'زمام'] },
  { key: 'embroidery', label: 'التطريز والشك', words: ['تطريز', 'شك', 'خرز'] },
]

export const ISSUE_ACTIONS: IssueGroup[] = [
  { key: 'shorten', label: 'تقصير', words: ['تقصير', 'قصير', 'اقصر'] },
  { key: 'lengthen', label: 'تطويل', words: ['تطويل', 'اطول'] },
  { key: 'tighten', label: 'تضييق', words: ['تضييق', 'تضيق', 'ضيق', 'تدخيل', 'تصغير'] },
  { key: 'loosen', label: 'توسيع', words: ['توسيع', 'توسع', 'وسع', 'تكبير', 'تفتيح'] },
  { key: 'raise_lower', label: 'رفع أو تنزيل', words: ['رفع', 'تنزيل', 'نزول'] },
  { key: 'darts', label: 'بنسات', words: ['بنسات', 'بنس', 'بنسه'] },
]

const PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'عال', 'لل', 'ال', 'و', 'ب', 'ف', 'ل']
const SUFFIXES = ['هما', 'ها', 'هم', 'ين', 'ات', 'ه', 'ي']

/** تطبيع عربي بسيط: حذف التشكيل والتطويل، وتوحيد الألف والتاء المربوطة والياء. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
}

function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token])
  for (const prefix of PREFIXES) {
    if (token.startsWith(prefix) && token.length - prefix.length >= 2) {
      variants.add(token.slice(prefix.length))
      break
    }
  }
  for (const base of [...variants]) {
    for (const suffix of SUFFIXES) {
      if (base.endsWith(suffix) && base.length - suffix.length >= 2) {
        variants.add(base.slice(0, -suffix.length))
        break
      }
    }
  }
  return [...variants]
}

const indexOf = (groups: IssueGroup[]) => {
  const map = new Map<string, string>()
  for (const group of groups) for (const word of group.words) map.set(word, group.key)
  return map
}

const AREA_INDEX = indexOf(ISSUE_AREAS)
const ACTION_INDEX = indexOf(ISSUE_ACTIONS)

export function classifyIssueText(text: string | null | undefined): { areas: Set<string>; actions: Set<string> } {
  const areas = new Set<string>()
  const actions = new Set<string>()
  if (!text) return { areas, actions }
  const tokens = normalizeArabic(text).split(/[^ء-ي]+/).filter((token) => token.length >= 2)
  for (const token of tokens) {
    for (const variant of tokenVariants(token)) {
      const area = AREA_INDEX.get(variant)
      if (area) areas.add(area)
      const action = ACTION_INDEX.get(variant)
      if (action) actions.add(action)
    }
  }
  return { areas, actions }
}
