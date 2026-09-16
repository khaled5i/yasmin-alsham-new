'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  UserRound,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Trash2,
  X,
  Pencil,
  Banknote,
  CreditCard
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import {
  getPersonalExpenses,
  createPersonalExpense,
  updatePersonalExpense,
  deletePersonalExpense
} from '@/lib/services/personal-expense-service'
import type {
  PersonalExpense,
  PersonalExpenseInput,
  PersonalExpensePaymentMethod
} from '@/lib/services/personal-expense-service'

function getTodayISODate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const emptyForm = (): PersonalExpenseInput => ({
  amount: 0,
  payment_method: 'cash',
  description: '',
  date: getTodayISODate()
})

const PAYMENT_METHODS: { id: PersonalExpensePaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'كاش', icon: Banknote },
  { id: 'network', label: 'شبكة', icon: CreditCard }
]

function PersonalExpensesContent() {
  const [expenses, setExpenses] = useState<PersonalExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PersonalExpenseInput>(emptyForm)

  const loadExpenses = async () => {
    try {
      setExpenses(await getPersonalExpenses())
    } catch (error) {
      console.error('Error loading personal expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  const openAddModal = () => {
    setEditingId(null)
    setFormData(emptyForm())
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.amount || formData.amount <= 0) {
      alert('يرجى إدخال مبلغ صحيح')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await updatePersonalExpense(editingId, formData)
        alert('✅ تم تحديث المصروف بنجاح')
      } else {
        await createPersonalExpense(formData)
        alert('✅ تم إضافة المصروف بنجاح')
      }
      closeModal()
      setFormData(emptyForm())
      loadExpenses()
    } catch (error) {
      console.error('Error saving personal expense:', error)
      alert('❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: PersonalExpense) => {
    setEditingId(item.id)
    setFormData({
      amount: item.amount,
      payment_method: item.payment_method,
      description: item.description || '',
      date: item.date
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return

    try {
      await deletePersonalExpense(id)
      loadExpenses()
    } catch (error) {
      console.error('Error deleting personal expense:', error)
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  const goToPrevMonth = () => {
    setSelectedMonth(prev => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 }))
  }

  const goToNextMonth = () => {
    setSelectedMonth(prev => (prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 }))
  }

  const selectedMonthLabel = new Date(selectedMonth.year, selectedMonth.month, 1)
    .toLocaleDateString('ar-SA-u-nu-latn', { month: 'long', year: 'numeric' })

  const isCurrentMonth = (() => {
    const now = new Date()
    return selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth()
  })()

  const monthPrefix = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}`
  const filteredExpenses = expenses.filter(item =>
    item.date.startsWith(monthPrefix) &&
    (item.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0)
  const cashTotal = filteredExpenses.filter(i => i.payment_method === 'cash').reduce((s, i) => s + i.amount, 0)
  const networkTotal = totalExpenses - cashTotal

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US').format(amount) + ' ر.س'

  const formatDate = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString('ar-SA-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/accounting/tailoring"
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-6 h-6 rotate-180" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl shadow-lg">
                  <UserRound className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">مصروفات شخصية</h1>
                  <p className="text-gray-500">مصروفات خاصة لا تدخل في حسابات القسم</p>
                </div>
              </div>
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden md:inline">إضافة مصروف</span>
            </button>
          </div>
        </motion.div>

        {/* ملخص */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl p-6 text-white mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-violet-100 mb-1">إجمالي المصروفات الشخصية</p>
              <p className="text-3xl font-bold">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="text-left">
              <p className="text-violet-100 mb-1">عدد العمليات</p>
              <p className="text-3xl font-bold">{filteredExpenses.length}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/15 rounded-xl p-3 flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              <span className="text-sm">كاش:</span>
              <span className="font-bold">{formatCurrency(cashTotal)}</span>
            </div>
            <div className="bg-white/15 rounded-xl p-3 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              <span className="text-sm">شبكة:</span>
              <span className="font-bold">{formatCurrency(networkTotal)}</span>
            </div>
          </div>
        </motion.div>

        {/* فلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث في الوصف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <button onClick={goToPrevMonth} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
              <span className="font-medium text-gray-700 text-sm flex-1 text-center">{selectedMonthLabel}</span>
              <button
                onClick={goToNextMonth}
                disabled={isCurrentMonth}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* القائمة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          {loading ? (
            <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-12">
              <UserRound className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">لا توجد مصروفات شخصية</p>
              <button onClick={openAddModal} className="mt-4 text-violet-600 hover:text-violet-700">
                + إضافة مصروف جديد
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredExpenses.map((item) => {
                const isCash = item.payment_method === 'cash'
                const MethodIcon = isCash ? Banknote : CreditCard
                return (
                  <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${isCash ? 'bg-emerald-100' : 'bg-sky-100'}`}>
                          <MethodIcon className={`w-6 h-6 ${isCash ? 'text-emerald-600' : 'text-sky-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-gray-900 break-words">{item.description || 'بدون وصف'}</h4>
                          <div className="flex items-center flex-wrap gap-2 mt-1">
                            <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${isCash ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                              {isCash ? 'كاش' : 'شبكة'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-lg font-bold text-violet-600">{formatCurrency(item.amount)}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Modal إضافة/تعديل مصروف */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={closeModal}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">
                    {editingId ? 'تعديل مصروف شخصي' : 'إضافة مصروف شخصي'}
                  </h3>
                  <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الدفع</label>
                    <div className="grid grid-cols-2 gap-3">
                      {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => {
                        const active = formData.payment_method === id
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setFormData({ ...formData, payment_method: id })}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium transition-all ${
                              active
                                ? id === 'cash'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-sky-500 bg-sky-50 text-sky-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">المبلغ</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500"
                      placeholder="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">التاريخ</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">الوصف</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500"
                      rows={2}
                      maxLength={500}
                      placeholder="مثال: بنزين، مطعم..."
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-60"
                  >
                    {saving ? 'جاري الحفظ...' : editingId ? 'تحديث المصروف' : 'حفظ'}
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

export default function PersonalExpensesPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <PersonalExpensesContent />
    </ProtectedRoute>
  )
}
