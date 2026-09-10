/**
 * بحث الأقمشة المشترك بين متجر الأقمشة وصفحة إدارة المتجر.
 * يغطي: الاسم، الرقم (كود القماش)، النوع/الفئات، والألوان.
 */

/** توحيد الحروف العربية (الألف/التاء المربوطة/الألف المقصورة) وإزالة التشكيل */
export const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()

export interface FabricSearchable {
  name?: string | null
  name_en?: string | null
  description?: string | null
  fabric_code?: string | null
  category?: string | null
  type?: string | null
  categories?: string[] | null
  available_colors?: string[] | null
}

export interface FabricSearchOptions {
  /** تضمين الوصف ضمن حقول البحث (مستخدم في واجهة المتجر) */
  includeDescription?: boolean
}

/** الحقول القابلة للبحث بعد التطبيع */
export const getFabricSearchTargets = (
  fabric: FabricSearchable,
  options: FabricSearchOptions = {}
): string[] => {
  const code = fabric.fabric_code || ''
  return [
    fabric.name || '',
    fabric.name_en || '',
    options.includeDescription ? (fabric.description || '') : '',
    code,
    // نسخة بلا فواصل حتى يطابق «SLK0012» أو «12» الكود «SLK-0012»
    code.replace(/[^a-zA-Z0-9]/g, ''),
    fabric.category || '',
    fabric.type || '',
    ...(fabric.categories || []),
    ...(fabric.available_colors || [])
  ]
    .filter(Boolean)
    .map(normalizeSearchText)
}

/** كل كلمة في البحث يجب أن تطابق أحد الحقول (بحث تراكمي: «حرير احمر») */
export const matchesFabricSearch = (
  fabric: FabricSearchable,
  query: string,
  options: FabricSearchOptions = {}
): boolean => {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return true
  const targets = getFabricSearchTargets(fabric, options)
  return terms.every(term => targets.some(target => target.includes(term)))
}
