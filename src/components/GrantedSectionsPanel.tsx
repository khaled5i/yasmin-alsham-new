'use client'

/**
 * «أقسام إضافية متاحة لك» — يظهر في صفحات العمال الخاصة (مدير الورشة، مدير الأقمشة،
 * المحاسب، الخياط…) ويعرض روابط الأقسام التي منحها المدير الأكبر للعامل زيادةً على
 * افتراضي نوعه. ما كان في صفحته أصلاً لا يتكرر هنا.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ReceiptText, ShieldCheck } from 'lucide-react'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { getDefaultPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import WomenWorkshopInvoiceModal from '@/components/WomenWorkshopInvoiceModal'
import TailoringInvoiceModal from '@/components/TailoringInvoiceModal'

const SECTION_LINKS: Array<{ key: StaffPermissionKey; href: string; label: string }> = [
  { key: 'orders.view_all', href: '/dashboard/orders', label: 'كل الطلبات الحديثة' },
  { key: 'orders.create', href: '/dashboard/add-order', label: 'إضافة طلب جديد' },
  { key: 'orders.completed', href: '/dashboard/completed-orders', label: 'الطلبات المكتملة' },
  { key: 'orders.delivered', href: '/dashboard/delivered-orders', label: 'الطلبات المسلّمة' },
  { key: 'orders.schedule', href: '/dashboard/order-schedule', label: 'مواعيد الطلبات' },
  { key: 'orders.notifications', href: '/dashboard/notifications', label: 'مركز الإشعارات' },
  { key: 'alterations.view_all', href: '/dashboard/alterations', label: 'قسم التعديلات' },
  { key: 'alterations.create', href: '/dashboard/alterations/add', label: 'إضافة طلب تعديل' },
  { key: 'fabrics.manage', href: '/dashboard/fabrics', label: 'إدارة الأقمشة' },
  { key: 'fabrics.inventory', href: '/dashboard/accounting/fabrics/inventory', label: 'مخزون متجر الأقمشة' },
  { key: 'fabrics.online_orders', href: '/dashboard/accounting/fabrics/online-orders', label: 'طلبات المتجر الإلكتروني' },
  { key: 'accounting.fabrics.income', href: '/dashboard/accounting/fabrics/income', label: 'مبيعات الأقمشة' },
  { key: 'accounting.fabrics.purchases', href: '/dashboard/accounting/fabrics/purchases', label: 'مشتريات الأقمشة' },
  { key: 'accounting.fabrics.fixed_expenses', href: '/dashboard/accounting/fabrics/fixed-expenses', label: 'مصاريف الأقمشة الثابتة' },
  { key: 'accounting.fabrics.salaries', href: '/dashboard/accounting/fabrics/salaries', label: 'رواتب عمال الأقمشة' },
  { key: 'accounting.fabrics.categories', href: '/dashboard/accounting/fabrics/categories', label: 'فئات الأقمشة' },
  { key: 'accounting.fabrics.print_station', href: '/dashboard/accounting/fabrics/print-station', label: 'محطة طباعة الأقمشة' },
  { key: 'accounting.tailoring.cash_box', href: '/dashboard/accounting/tailoring/cash-box', label: 'الصندوق' },
  { key: 'accounting.tailoring.income', href: '/dashboard/accounting/tailoring/income', label: 'واردات التفصيل' },
  { key: 'accounting.tailoring.materials', href: '/dashboard/accounting/tailoring/materials', label: 'مصروفات المواد' },
  { key: 'accounting.tailoring.fixed_expenses', href: '/dashboard/accounting/tailoring/fixed-expenses', label: 'مصاريف التفصيل الثابتة' },
  { key: 'accounting.tailoring.categories', href: '/dashboard/accounting/tailoring/categories', label: 'فئات التفصيل' },
  { key: 'accounting.organization_reports', href: '/dashboard/accounting/tailoring/organization-reports', label: 'تقارير كامل المؤسسة' },
  { key: 'accounting.hala', href: '/dashboard/accounting/hala-reconciliation', label: 'مطابقة هلا' },
  { key: 'accounting.women_workshop', href: '/dashboard/accounting/women-workshop', label: 'حسابات المشغل النسائي' },
  { key: 'accounting.ready_designs', href: '/dashboard/accounting/ready-designs', label: 'حسابات التصاميم الجاهزة' },
  { key: 'workers.monitoring', href: '/dashboard/worker-monitoring', label: 'متابعة العمال' },
  { key: 'workers.attendance', href: '/dashboard/worker-monitoring/attendance', label: 'الحضور والانصراف' },
  { key: 'reports.view', href: '/dashboard/reports', label: 'التقارير' },
  { key: 'reports.whatsapp', href: '/dashboard/whatsapp-stats', label: 'ضغطات واتساب' },
]

export default function GrantedSectionsPanel() {
  const { isWorker, isGeneralManager, workerType, can, isLoading } = useWorkerPermissions()
  const [showWomenInvoice, setShowWomenInvoice] = useState(false)
  const [showTailoringInvoice, setShowTailoringInvoice] = useState(false)

  if (!isWorker || isGeneralManager || isLoading || !workerType) return null

  // الممنوح زيادةً على افتراضي النوع فقط
  const extra = (key: StaffPermissionKey) => can(key) && !getDefaultPermission(workerType, key)
  const links = SECTION_LINKS.filter(link => extra(link.key))
  const womenInvoice = extra('invoices.women_workshop')
  const tailoringInvoice = extra('invoices.tailoring')

  if (links.length === 0 && !womenInvoice && !tailoringInvoice) return null

  return (
    <section className="mt-6 rounded-2xl border border-purple-100 bg-white/80 p-4 sm:p-5" dir="rtl" aria-label="أقسام إضافية متاحة لك">
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-800">
        <ShieldCheck className="h-5 w-5 text-purple-600" />
        أقسام إضافية متاحة لك
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {links.map(link => (
          <Link
            key={link.key}
            href={link.href}
            className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-3 text-center text-sm font-semibold text-purple-800 transition-colors hover:bg-purple-100"
          >
            {link.label}
          </Link>
        ))}
        {womenInvoice && (
          <button
            type="button"
            onClick={() => setShowWomenInvoice(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-100"
          >
            <ReceiptText className="h-4 w-4" />
            فاتورة المشغل النسائي
          </button>
        )}
        {tailoringInvoice && (
          <button
            type="button"
            onClick={() => setShowTailoringInvoice(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-800 hover:bg-violet-100"
          >
            <ReceiptText className="h-4 w-4" />
            فاتورة الخياطة
          </button>
        )}
      </div>

      {womenInvoice && (
        <WomenWorkshopInvoiceModal isOpen={showWomenInvoice} onClose={() => setShowWomenInvoice(false)} />
      )}
      {tailoringInvoice && (
        <TailoringInvoiceModal isOpen={showTailoringInvoice} onClose={() => setShowTailoringInvoice(false)} />
      )}
    </section>
  )
}
