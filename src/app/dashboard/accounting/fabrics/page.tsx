'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Package,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Home,
  Users,
  ChevronLeft,
  Settings,
  Boxes,
  Wallet,
  Pencil,
  X,
  Calendar
} from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getFinancialSummary, setCashBoxBalance } from '@/lib/services/simple-accounting-service'
import type { FinancialSummary } from '@/types/simple-accounting'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'

// ============================================================================
// أقسام المحاسبة
// ============================================================================

const sections = [
  {
    id: 'income',
    name: 'المبيعات',
    description: 'إيرادات مبيعات الأقمشة',
    icon: TrendingUp,
    href: '/dashboard/accounting/fabrics/income',
    color: 'from-emerald-500 to-emerald-600'
  },
  {
    id: 'purchases',
    name: 'المشتريات',
    description: 'شراء الأقمشة والمواد',
    icon: ShoppingCart,
    href: '/dashboard/accounting/fabrics/purchases',
    color: 'from-orange-500 to-orange-600'
  },
  {
    id: 'fixed',
    name: 'المصاريف الثابتة',
    description: 'إيجار، كهرباء، إنترنت',
    icon: Home,
    href: '/dashboard/accounting/fabrics/fixed-expenses',
    color: 'from-blue-500 to-blue-600'
  },
  {
    id: 'salaries',
    name: 'رواتب العمال',
    description: 'رواتب ومكافآت العاملين',
    icon: Users,
    href: '/dashboard/accounting/fabrics/salaries',
    color: 'from-purple-500 to-purple-600'
  },
  {
    id: 'categories',
    name: 'إدارة الفئات',
    description: 'إضافة وتعديل فئات المحاسبة',
    icon: Settings,
    href: '/dashboard/accounting/fabrics/categories',
    color: 'from-pink-500 to-rose-600'
  },
  {
    id: 'inventory',
    name: 'المخزون',
    description: 'إدارة مخزون الأقمشة والحركات',
    icon: Boxes,
    href: '/dashboard/accounting/fabrics/inventory',
    color: 'from-teal-500 to-teal-600'
  }
]

// ============================================================================
// المكون الرئيسي
// ============================================================================

function FabricsAccountingContent() {
  const [stats, setStats] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()
  const { workerType, getDashboardRoute } = useWorkerPermissions()

  // فلتر الشهر لعرض ملخص الشهور السابقة (الافتراضي: الشهر الحالي)
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date())

  // هل الشهر المعروض هو الشهر الحالي؟
  const now = new Date()
  const isCurrentMonth =
    selectedMonth.getFullYear() === now.getFullYear() &&
    selectedMonth.getMonth() === now.getMonth()

  // زر تعديل الصندوق يظهر لمدير النظام فقط، وفقط عند عرض الشهر الحالي
  // (رصيد الشهور السابقة تاريخي ولا يُعدَّل)
  const isAdmin = user?.role === 'admin'
  const canEditCashBox = isAdmin && isCurrentMonth

  // حالة نافذة تعديل رصيد الصندوق (خاص بالمدير)
  const [showCashBoxModal, setShowCashBoxModal] = useState(false)
  const [cashBoxInput, setCashBoxInput] = useState('')
  const [cashBoxNote, setCashBoxNote] = useState('')
  const [savingCashBox, setSavingCashBox] = useState(false)

  // حساب بداية ونهاية شهر معيّن بصيغة ISO (بدون مشاكل المنطقة الزمنية)
  const getMonthRange = (d: Date) => {
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const lastDay = new Date(year, month, 0).getDate()
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { start, end }
  }

  const loadStats = async (monthDate: Date = selectedMonth) => {
    setLoading(true)
    try {
      const { start, end } = getMonthRange(monthDate)
      const data = await getFinancialSummary('fabrics', start, end)
      setStats(data)
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats(selectedMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  const openCashBoxModal = () => {
    setCashBoxInput(String(stats?.cashBoxBalance ?? 0))
    setCashBoxNote('')
    setShowCashBoxModal(true)
  }

  const handleSaveCashBox = async (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseFloat(cashBoxInput)
    if (Number.isNaN(target)) {
      alert('يرجى إدخال مبلغ صحيح')
      return
    }

    setSavingCashBox(true)
    try {
      const result = await setCashBoxBalance('fabrics', target, {
        note: cashBoxNote,
        createdByName: user?.full_name
      })
      if (result.success) {
        setStats((prev) => (prev ? { ...prev, cashBoxBalance: result.newBalance } : prev))
        setShowCashBoxModal(false)
      } else {
        alert('❌ تعذّر تعديل رصيد الصندوق. تأكد من تطبيق التحديث على قاعدة البيانات.')
      }
    } catch {
      alert('❌ حدث خطأ أثناء حفظ رصيد الصندوق')
    } finally {
      setSavingCashBox(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA-u-nu-latn').format(amount) + ' ر.س'
  }

  // تحديد مسار العودة حسب نوع المستخدم
  const getBackRoute = () => {
    if (user?.role === 'admin') {
      return '/dashboard/accounting'
    }
    if (user?.role === 'worker' && workerType === 'fabric_store_manager') {
      return '/dashboard/fabric-manager'
    }
    return '/dashboard/accounting'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Link
              href={getBackRoute()}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">قسم الأقمشة</h1>
                <p className="text-gray-500">إدارة الحسابات المالية</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* الملخص المالي */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              {isCurrentMonth ? 'ملخص الشهر الحالي' : 'ملخص شهر'}
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <DatePicker
                  selected={selectedMonth}
                  onChange={(d: Date | null) => d && setSelectedMonth(d)}
                  dateFormat="yyyy/MM"
                  showMonthYearPicker
                  maxDate={new Date()}
                  className="w-40 pr-10 pl-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-right text-sm"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(new Date())}
                  className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-xl transition-colors whitespace-nowrap"
                >
                  الشهر الحالي
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-4 bg-emerald-50 rounded-xl">
                <TrendingUp className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">المبيعات</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(stats?.totalIncome || 0)}</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-xl">
                <ShoppingCart className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">المشتريات</p>
                <p className="text-xl font-bold text-orange-700">{formatCurrency(stats?.totalMaterialExpenses || 0)}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <Home className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">مصاريف ثابتة</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(stats?.totalFixedExpenses || 0)}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">الرواتب</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(stats?.totalSalaries || 0)}</p>
              </div>
              <div className={`text-center p-4 rounded-xl ${(stats?.netProfit || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <DollarSign className={`w-8 h-8 mx-auto mb-2 ${(stats?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                <p className="text-sm text-gray-500 mb-1">صافي الربح</p>
                <p className={`text-xl font-bold ${(stats?.netProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(stats?.netProfit || 0)}
                </p>
              </div>
              <div className="relative text-center p-4 bg-amber-50 rounded-xl">
                {canEditCashBox && (
                  <button
                    type="button"
                    onClick={openCashBoxModal}
                    className="absolute top-2 left-2 p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
                    title="تعديل رصيد الصندوق"
                    aria-label="تعديل رصيد الصندوق"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <Wallet className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">
                  الصندوق{!isCurrentMonth && <span className="block text-[10px] text-gray-400">نهاية الشهر</span>}
                </p>
                <p className={`text-xl font-bold ${(stats?.cashBoxBalance || 0) >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                  {formatCurrency(stats?.cashBoxBalance || 0)}
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* أقسام المحاسبة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">الأقسام</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section, index) => (
              <Link key={section.id} href={section.href}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={{ scale: 1.02, x: -4 }}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <section.icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {section.name}
                      </h3>
                      <p className="text-sm text-gray-500">{section.description}</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* نافذة تعديل رصيد الصندوق (مدير النظام فقط - الشهر الحالي) */}
        <AnimatePresence>
          {showCashBoxModal && canEditCashBox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowCashBoxModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-600" />
                    تعديل رصيد الصندوق
                  </h2>
                  <button
                    onClick={() => setShowCashBoxModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  الرصيد الحالي: <span className="font-bold text-amber-700">{formatCurrency(stats?.cashBoxBalance || 0)}</span>
                </p>

                <form onSubmit={handleSaveCashBox} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      الرصيد الجديد (ر.س) *
                    </label>
                    <input
                      type="number"
                      value={cashBoxInput}
                      onChange={(e) => setCashBoxInput(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500"
                      step="0.01"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ملاحظة (اختياري)
                    </label>
                    <input
                      type="text"
                      value={cashBoxNote}
                      onChange={(e) => setCashBoxNote(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500"
                      placeholder="سبب التعديل..."
                    />
                  </div>

                  <p className="text-xs text-gray-400">
                    يُسجَّل التعديل كفرق عن الرصيد الحالي، وتبقى حركات المبيعات والمشتريات القادمة تُحتسب فوق القيمة الجديدة.
                  </p>

                  <button
                    type="submit"
                    disabled={savingCashBox}
                    className="w-full py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors disabled:opacity-50 font-medium"
                  >
                    {savingCashBox ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function FabricsAccountingPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <FabricsAccountingContent />
    </ProtectedWorkerRoute>
  )
}
