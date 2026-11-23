/**
 * نظام الصلاحيات التفصيلي للموظفين
 * Staff permission catalog
 *
 * التسلسل:
 *   1. المدير الأكبر (users.role = 'admin') — كل شيء دائماً، ولا تُقيَّد صلاحياته.
 *      هو وحده من يدير العمال ويمنح الصلاحيات.
 *   2. المدير العام (worker_type = 'general_manager') — يحصل افتراضياً على كل
 *      الصلاحيات القابلة للمنح، ويستطيع المدير الأكبر إطفاء أي منها.
 *   3. بقية العمال — افتراضيات نوعهم تطابق ما كانوا يصلون إليه قبل هذا النظام،
 *      ويمكن تشغيل أو إطفاء أي صلاحية لكل عامل على حدة.
 *
 * ⚠️ هذا الملف مرآة لجدول public.staff_permission_catalog في قاعدة البيانات
 *    (هجرة 20261123120000_staff_permissions.sql). القاعدة هي مصدر الحقيقة؛
 *    الافتراضيات هنا للعرض وللاحتياط فقط إذا تعذّر الاتصال.
 *    أي تعديل هنا يجب أن يقابله تعديل في الهجرة — وفحص التطابق:
 *    node scripts/check-staff-permissions-sync.cjs
 */

import type { WorkerType } from './services/worker-service'

export type StaffPermissionKey =
  // الطلبات
  | 'orders.view_all'
  | 'orders.create'
  | 'orders.manage_workflow'
  | 'orders.edit'
  | 'orders.payments'
  | 'orders.delete'
  | 'orders.completed'
  | 'orders.delivered'
  | 'orders.schedule'
  | 'orders.notifications'
  | 'orders.client_phone'
  // التعديلات
  | 'alterations.view_all'
  | 'alterations.create'
  | 'alterations.edit'
  | 'alterations.delete'
  | 'alterations.error_reason'
  // الفواتير السريعة
  | 'invoices.women_workshop'
  | 'invoices.tailoring'
  // الأقمشة والمتجر
  | 'fabrics.manage'
  | 'fabrics.inventory'
  | 'fabrics.online_orders'
  | 'fabrics.online_orders_admin'
  // محاسبة الأقمشة
  | 'accounting.fabrics.income'
  | 'accounting.fabrics.purchases'
  | 'accounting.fabrics.fixed_expenses'
  | 'accounting.fabrics.salaries'
  | 'accounting.fabrics.categories'
  | 'accounting.fabrics.print_station'
  | 'accounting.fabrics.send_alostaz'
  | 'accounting.fabrics.influencers'
  | 'accounting.fabrics.cash_box_edit'
  // محاسبة التفصيل
  | 'accounting.tailoring.cash_box'
  | 'accounting.tailoring.income'
  | 'accounting.tailoring.materials'
  | 'accounting.tailoring.fixed_expenses'
  | 'accounting.tailoring.categories'
  | 'accounting.tailoring.salaries'
  | 'accounting.organization_reports'
  | 'accounting.hala'
  // المشغل النسائي والتصاميم الجاهزة
  | 'accounting.women_workshop'
  | 'accounting.women_workshop_expenses'
  | 'accounting.ready_designs'
  // العمال
  | 'workers.monitoring'
  | 'workers.attendance'
  | 'workers.quality_report'
  | 'workers.manage'
  // التقارير
  | 'reports.view'
  | 'reports.whatsapp'
  // الإعدادات
  | 'settings.print_stations'

export interface StaffPermissionDef {
  key: StaffPermissionKey
  label: string
  description?: string
  /**
   * خاص بالمدير الأكبر: لا يُمنح لأي عامل (ولا للمدير العام) حالياً.
   * يُعرض في الواجهة مقفلاً حتى يكون واضحاً أنه موجود ولمن هو.
   */
  ownerOnly?: boolean
  /** أنواع العمال التي تملك الصلاحية افتراضياً (المدير العام يملك كل غير المقفل). */
  defaultFor?: WorkerType[]
}

export interface StaffPermissionSection {
  id: string
  title: string
  description: string
  permissions: StaffPermissionDef[]
}

export const STAFF_PERMISSION_SECTIONS: StaffPermissionSection[] = [
  {
    id: 'orders',
    title: 'الطلبات',
    description: 'طلبات التفصيل من الاستلام حتى التسليم',
    permissions: [
      { key: 'orders.view_all', label: 'عرض كل الطلبات الحديثة', description: 'بدونها يرى العامل الطلبات المسندة إليه فقط', defaultFor: ['workshop_manager'] },
      { key: 'orders.create', label: 'إضافة طلب جديد' },
      { key: 'orders.manage_workflow', label: 'إسناد القصّاص والخياط وطباعة الطلب', description: 'والاتصال بالعميلة من نافذة الطلب', defaultFor: ['workshop_manager'] },
      { key: 'orders.edit', label: 'تعديل الطلب وتغيير حالته' },
      { key: 'orders.payments', label: 'الأسعار والدفعات والمتبقي', description: 'رؤيتها وتعديلها وتسجيل الدفعات' },
      { key: 'orders.delete', label: 'حذف الطلبات' },
      { key: 'orders.completed', label: 'الطلبات المكتملة', defaultFor: ['workshop_manager'] },
      { key: 'orders.delivered', label: 'الطلبات المسلّمة', defaultFor: ['workshop_manager'] },
      { key: 'orders.schedule', label: 'مواعيد الطلبات', defaultFor: ['workshop_manager'] },
      { key: 'orders.notifications', label: 'مركز الإشعارات', description: 'إشعارات البروفا والاكتمال والتسليم وتنبيهات المتجر' },
      { key: 'orders.client_phone', label: 'رؤية رقم جوال العميلة', description: 'في الطلبات المكتملة والمسلّمة' },
    ],
  },
  {
    id: 'alterations',
    title: 'التعديلات',
    description: 'طلبات التعديل على الطلبات السابقة والخارجية',
    permissions: [
      { key: 'alterations.view_all', label: 'قسم التعديلات (كل التعديلات)', description: 'بدونها يرى العامل التعديلات المسندة إليه فقط' },
      { key: 'alterations.create', label: 'إضافة طلب تعديل' },
      { key: 'alterations.edit', label: 'تعديل طلبات التعديل وتغيير حالتها' },
      { key: 'alterations.delete', label: 'حذف طلبات التعديل' },
      { key: 'alterations.error_reason', label: 'رؤية سبب الخطأ' },
    ],
  },
  {
    id: 'invoices',
    title: 'الفواتير السريعة',
    description: 'أزرار إصدار الفواتير من الصفحة الرئيسية',
    permissions: [
      { key: 'invoices.women_workshop', label: 'إضافة فاتورة للمشغل النسائي' },
      { key: 'invoices.tailoring', label: 'إضافة فاتورة لياسمين الشام للخياطة' },
    ],
  },
  {
    id: 'fabrics',
    title: 'الأقمشة والمتجر الإلكتروني',
    description: 'بطاقات الأقمشة في المتجر والمخزون والطلبات الإلكترونية',
    permissions: [
      { key: 'fabrics.manage', label: 'إدارة الأقمشة', description: 'إضافة وتعديل وحذف بطاقات الأقمشة', defaultFor: ['fabric_store_manager'] },
      { key: 'fabrics.inventory', label: 'مخزون متجر الأقمشة', defaultFor: ['fabric_store_manager'] },
      { key: 'fabrics.online_orders', label: 'طلبات المتجر الإلكتروني', description: 'متابعة الطلبات وتجهيزها وشحنها', defaultFor: ['fabric_store_manager'] },
      { key: 'fabrics.online_orders_admin', label: 'إلغاء وحذف واسترداد طلبات المتجر', ownerOnly: true },
    ],
  },
  {
    id: 'accounting_fabrics',
    title: 'محاسبة قسم الأقمشة',
    description: 'مبيعات ومصاريف ورواتب قسم الأقمشة',
    permissions: [
      { key: 'accounting.fabrics.income', label: 'المبيعات', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.purchases', label: 'المشتريات', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.fixed_expenses', label: 'المصاريف الثابتة', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.salaries', label: 'رواتب عمال الأقمشة', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.categories', label: 'إدارة الفئات', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.print_station', label: 'محطة طباعة فواتير الأقمشة', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.send_alostaz', label: 'إرسال المبيعات للمحاسبة (الأستاذ)', defaultFor: ['fabric_store_manager'] },
      { key: 'accounting.fabrics.influencers', label: 'أكواد المشاهير وشركاء النجاح', ownerOnly: true },
      { key: 'accounting.fabrics.cash_box_edit', label: 'تعديل رصيد صندوق الأقمشة يدوياً', ownerOnly: true },
    ],
  },
  {
    id: 'accounting_tailoring',
    title: 'محاسبة قسم التفصيل',
    description: 'الصندوق والواردات والمصاريف والتقارير المالية',
    permissions: [
      { key: 'accounting.tailoring.cash_box', label: 'الصندوق', description: 'الرصيد والحركات والسحب' },
      { key: 'accounting.tailoring.income', label: 'الواردات' },
      { key: 'accounting.tailoring.materials', label: 'مصروفات المواد', defaultFor: ['accountant'] },
      { key: 'accounting.tailoring.fixed_expenses', label: 'المصاريف الثابتة' },
      { key: 'accounting.tailoring.categories', label: 'إدارة الفئات' },
      { key: 'accounting.tailoring.salaries', label: 'رواتب العمال', ownerOnly: true },
      { key: 'accounting.organization_reports', label: 'تقارير كامل المؤسسة' },
      { key: 'accounting.hala', label: 'مطابقة أجهزة هلا' },
    ],
  },
  {
    id: 'accounting_other',
    title: 'المشغل النسائي والتصاميم الجاهزة',
    description: 'حسابات الفروع الأخرى',
    permissions: [
      { key: 'accounting.women_workshop', label: 'حسابات المشغل النسائي (عرض)', defaultFor: ['accountant'] },
      { key: 'accounting.women_workshop_expenses', label: 'إضافة مصاريف المشغل النسائي وتعديلها' },
      { key: 'accounting.ready_designs', label: 'حسابات التصاميم الجاهزة' },
    ],
  },
  {
    id: 'workers',
    title: 'العمال',
    description: 'متابعة العمال والحضور والجودة',
    permissions: [
      { key: 'workers.monitoring', label: 'متابعة العمال', defaultFor: ['workshop_manager'] },
      { key: 'workers.attendance', label: 'الحضور والانصراف', defaultFor: ['workshop_manager'] },
      { key: 'workers.quality_report', label: 'تقييم الجودة في متابعة العمال' },
      { key: 'workers.manage', label: 'إدارة العمال ومنح الصلاحيات', ownerOnly: true },
    ],
  },
  {
    id: 'reports',
    title: 'التقارير والإحصائيات',
    description: 'التقارير العامة وإحصائيات التواصل',
    permissions: [
      { key: 'reports.view', label: 'التقارير' },
      { key: 'reports.whatsapp', label: 'ضغطات واتساب' },
    ],
  },
  {
    id: 'settings',
    title: 'الإعدادات',
    description: 'إعدادات الأجهزة والطباعة',
    permissions: [
      { key: 'settings.print_stations', label: 'إدارة محطات الطباعة', ownerOnly: true },
    ],
  },
]

export const STAFF_PERMISSIONS: StaffPermissionDef[] = STAFF_PERMISSION_SECTIONS.flatMap(s => s.permissions)

export const STAFF_PERMISSION_KEYS: StaffPermissionKey[] = STAFF_PERMISSIONS.map(p => p.key)

const PERMISSION_BY_KEY = new Map<StaffPermissionKey, StaffPermissionDef>(
  STAFF_PERMISSIONS.map(p => [p.key, p])
)

export type StaffPermissionMap = Record<StaffPermissionKey, boolean>
export type StaffPermissionOverrides = Partial<Record<StaffPermissionKey, boolean>>

export function isStaffPermissionKey(value: unknown): value is StaffPermissionKey {
  return typeof value === 'string' && PERMISSION_BY_KEY.has(value as StaffPermissionKey)
}

export function getStaffPermissionDef(key: StaffPermissionKey): StaffPermissionDef | undefined {
  return PERMISSION_BY_KEY.get(key)
}

/** القيمة الافتراضية لنوع عامل — مطابقة لما في قاعدة البيانات. */
export function getDefaultPermission(workerType: WorkerType | null | undefined, key: StaffPermissionKey): boolean {
  const def = PERMISSION_BY_KEY.get(key)
  if (!def || def.ownerOnly || !workerType) return false
  if (workerType === 'general_manager') return true
  return def.defaultFor?.includes(workerType) ?? false
}

export function getDefaultPermissions(workerType: WorkerType | null | undefined): StaffPermissionMap {
  const map = {} as StaffPermissionMap
  for (const key of STAFF_PERMISSION_KEYS) map[key] = getDefaultPermission(workerType, key)
  return map
}

/** الصلاحيات الفعلية: الافتراضي حسب النوع ثم تخصيص العامل. المقفل لا يُمنح أبداً. */
export function resolveStaffPermissions(
  workerType: WorkerType | null | undefined,
  overrides: StaffPermissionOverrides | null | undefined
): StaffPermissionMap {
  const map = getDefaultPermissions(workerType)
  if (!overrides) return map
  for (const key of STAFF_PERMISSION_KEYS) {
    const def = PERMISSION_BY_KEY.get(key)
    if (def?.ownerOnly) continue
    const value = overrides[key]
    if (typeof value === 'boolean') map[key] = value
  }
  return map
}

export function allStaffPermissions(value: boolean): StaffPermissionMap {
  const map = {} as StaffPermissionMap
  for (const key of STAFF_PERMISSION_KEYS) map[key] = value
  return map
}

/** يحذف من التخصيص كل ما يساوي الافتراضي أو المقفل أو مفتاحاً غير معروف. */
export function normalizeStaffOverrides(
  workerType: WorkerType | null | undefined,
  overrides: Record<string, unknown> | null | undefined
): StaffPermissionOverrides {
  const clean: StaffPermissionOverrides = {}
  if (!overrides) return clean
  for (const [key, value] of Object.entries(overrides)) {
    if (!isStaffPermissionKey(key) || typeof value !== 'boolean') continue
    if (PERMISSION_BY_KEY.get(key)?.ownerOnly) continue
    if (value === getDefaultPermission(workerType, key)) continue
    clean[key] = value
  }
  return clean
}

// ============================================================================
// مجموعات تفتح صفحات تجميعية (المحاسبة وفروعها)
// ============================================================================

export const TAILORING_ACCOUNTING_KEYS: StaffPermissionKey[] = [
  'accounting.tailoring.cash_box', 'accounting.tailoring.income', 'accounting.tailoring.materials',
  'accounting.tailoring.fixed_expenses', 'accounting.tailoring.categories', 'accounting.tailoring.salaries',
  'accounting.organization_reports',
]

export const FABRICS_ACCOUNTING_KEYS: StaffPermissionKey[] = [
  'accounting.fabrics.income', 'accounting.fabrics.purchases', 'accounting.fabrics.fixed_expenses',
  'accounting.fabrics.salaries', 'accounting.fabrics.categories', 'accounting.fabrics.print_station',
  'accounting.fabrics.influencers', 'fabrics.inventory', 'fabrics.online_orders',
]

export const WOMEN_WORKSHOP_KEYS: StaffPermissionKey[] = [
  'accounting.women_workshop', 'accounting.women_workshop_expenses',
]

export const READY_DESIGNS_KEYS: StaffPermissionKey[] = ['accounting.ready_designs']

/** أي صلاحية محاسبية تفتح «النظام المحاسبي». */
export const ACCOUNTING_HUB_KEYS: StaffPermissionKey[] = [
  ...TAILORING_ACCOUNTING_KEYS,
  ...FABRICS_ACCOUNTING_KEYS,
  ...WOMEN_WORKSHOP_KEYS,
  ...READY_DESIGNS_KEYS,
]

// ============================================================================
// أسماء الأدوار
// ============================================================================

export const OWNER_ROLE_LABEL = 'المدير الأكبر'
export const OWNER_ROLE_LABEL_EN = 'Top Manager'
export const GENERAL_MANAGER_LABEL = 'المدير العام'

/** اسم دور الموظف كما يظهر في الواجهة. */
export function getStaffRoleLabel(
  role: string | null | undefined,
  workerType: WorkerType | null | undefined,
  lang: 'ar' | 'en' = 'ar'
): string {
  if (role === 'admin') return lang === 'ar' ? OWNER_ROLE_LABEL : OWNER_ROLE_LABEL_EN
  if (workerType === 'general_manager') return lang === 'ar' ? GENERAL_MANAGER_LABEL : 'General Manager'
  return lang === 'ar' ? 'عامل' : 'Worker'
}
