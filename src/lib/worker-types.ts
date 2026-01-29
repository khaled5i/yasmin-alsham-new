/**
 * Worker Types Utilities
 * أدوات مساعدة لأنواع العمال
 */

import type { WorkerType } from './services/worker-service'

// أسماء أنواع العمال بالعربية
export const WORKER_TYPE_NAMES_AR: Record<WorkerType, string> = {
  tailor: 'خياط/خياطة',
  fabric_store_manager: 'مدير متجر الأقمشة',
  accountant: 'محاسب',
  general_manager: 'مدير عام',
  workshop_manager: 'مدير الورشة'
}

// أسماء أنواع العمال بالإنجليزية
export const WORKER_TYPE_NAMES_EN: Record<WorkerType, string> = {
  tailor: 'Tailor',
  fabric_store_manager: 'Fabric Store Manager',
  accountant: 'Accountant',
  general_manager: 'General Manager',
  workshop_manager: 'Workshop Manager'
}

// الصلاحيات المتاحة لكل نوع عامل
export const WORKER_PERMISSIONS: Record<WorkerType, {
  canAccessOrders: boolean
  canAccessFabrics: boolean
  canAccessProducts: boolean
  canAccessAccounting: boolean
  canAccessWorkers: boolean
  canAccessAppointments: boolean
  canAccessSettings: boolean
  dashboardRoute: string
}> = {
  tailor: {
    canAccessOrders: true,
    canAccessFabrics: false,
    canAccessProducts: false,
    canAccessAccounting: false,
    canAccessWorkers: false,
    canAccessAppointments: false,
    canAccessSettings: false,
    dashboardRoute: '/dashboard/worker' // ✅ تم التغيير من '/dashboard/orders' إلى '/dashboard/worker'
  },
  fabric_store_manager: {
    canAccessOrders: false,
    canAccessFabrics: true,
    canAccessProducts: false,
    canAccessAccounting: true, // يمكنه الوصول إلى محاسبة الأقمشة فقط
    canAccessWorkers: false,
    canAccessAppointments: false,
    canAccessSettings: false,
    dashboardRoute: '/dashboard/fabric-manager'
  },
  accountant: {
    canAccessOrders: false,
    canAccessFabrics: false,
    canAccessProducts: false,
    canAccessAccounting: true,
    canAccessWorkers: false,
    canAccessAppointments: false,
    canAccessSettings: false,
    dashboardRoute: '/dashboard/accountant'
  },
  general_manager: {
    canAccessOrders: true,
    canAccessFabrics: true,
    canAccessProducts: true,
    canAccessAccounting: true,
    canAccessWorkers: true,
    canAccessAppointments: true,
    canAccessSettings: true,
    dashboardRoute: '/dashboard'
  },
  workshop_manager: {
    canAccessOrders: true,
    canAccessFabrics: false,
    canAccessProducts: false,
    canAccessAccounting: false,
    canAccessWorkers: false,
    canAccessAppointments: false,
    canAccessSettings: false,
    dashboardRoute: '/dashboard/workshop-manager'
  }
}

// الحصول على اسم نوع العامل
export function getWorkerTypeName(type: WorkerType, lang: 'ar' | 'en' = 'ar'): string {
  return lang === 'ar' ? WORKER_TYPE_NAMES_AR[type] : WORKER_TYPE_NAMES_EN[type]
}

// الحصول على صلاحيات نوع العامل
export function getWorkerPermissions(type: WorkerType) {
  return WORKER_PERMISSIONS[type]
}

// التحقق من صلاحية معينة
export function hasPermission(type: WorkerType, permission: keyof typeof WORKER_PERMISSIONS[WorkerType]): boolean {
  return WORKER_PERMISSIONS[type][permission] as boolean
}

// الحصول على مسار لوحة التحكم المناسب
export function getWorkerDashboardRoute(type: WorkerType): string {
  return WORKER_PERMISSIONS[type].dashboardRoute
}

// قائمة جميع أنواع العمال للاستخدام في القوائم المنسدلة
export const WORKER_TYPES_OPTIONS = [
  { value: 'tailor', label: 'خياط/خياطة', labelEn: 'Tailor' },
  { value: 'fabric_store_manager', label: 'مدير متجر الأقمشة', labelEn: 'Fabric Store Manager' },
  { value: 'accountant', label: 'محاسب', labelEn: 'Accountant' },
  { value: 'general_manager', label: 'مدير عام', labelEn: 'General Manager' },
  { value: 'workshop_manager', label: 'مدير الورشة', labelEn: 'Workshop Manager' }
] as const

// وصف كل نوع عامل
export const WORKER_TYPE_DESCRIPTIONS: Record<WorkerType, string> = {
  tailor: 'مسؤول عن تنفيذ طلبات التفصيل والخياطة',
  fabric_store_manager: 'مسؤول عن إدارة متجر الأقمشة (إضافة، تعديل، حذف الأقمشة)',
  accountant: 'مسؤول عن النظام المحاسبي والتقارير المالية',
  general_manager: 'صلاحيات كاملة على جميع أقسام النظام',
  workshop_manager: 'مسؤول عن متابعة الطلبات (الحديثة، المكتملة، المسلمة)'
}

