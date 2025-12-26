'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Package,
  ArrowLeft,
  TrendingUp,
  Search,
  Calendar,
  Plus,
  X,
  Receipt,
  Ruler,
  Pencil,
  Trash2
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getIncome, createIncome, updateIncome, deleteIncome } from '@/lib/services/simple-accounting-service'
import type { Income, CreateIncomeInput } from '@/types/simple-accounting'
import { getCategories, categoriesToOptions, getCategoryLabel, type AccountingCategory } from '@/lib/services/accounting-category-service'

// ============================================================================
// المكون الرئيسي
// ============================================================================

function FabricsIncomeContent() {
  const [income, setIncome] = useState<Income[]>([])
  const [categories, setCategories] = useState<AccountingCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<CreateIncomeInput>>({
    branch: 'fabrics',
    category: '',
    customer_name: '',
    description: '',
    amount: 0,
    quantity_meters: undefined,
    date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    loadIncome()
    loadCategories()
  }, [])

  const loadIncome = async () => {
    setLoading(true)
    try {
      const data = await getIncome('fabrics')
      setIncome(data)
    } catch (error) {
      console.error('Error loading income:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const data = await getCategories('fabrics', 'income')
      setCategories(data)
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category || !formData.customer_name || !formData.amount) return

    setSaving(true)
    try {
      if (isEditing && editingId) {
        // تحديث مبيعة موجودة
        const result = await updateIncome(editingId, formData as Partial<CreateIncomeInput>)
        if (result) {
          setIncome(income.map(item => item.id === editingId ? result : item))
          alert('✅ تم تحديث المبيعة بنجاح')
        }
      } else {
        // إضافة مبيعة جديدة
        const result = await createIncome(formData as CreateIncomeInput)
        if (result) {
          setIncome([result, ...income])
          alert('✅ تم إضافة المبيعة بنجاح')
        }
      }

      setShowModal(false)
      setIsEditing(false)
      setEditingId(null)
      setFormData({
        branch: 'fabrics',
        category: '',
        customer_name: '',
        description: '',
        amount: 0,
        quantity_meters: undefined,
        date: new Date().toISOString().split('T')[0]
      })
    } catch (error) {
      console.error('Error saving income:', error)
      alert('❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: Income) => {
    setIsEditing(true)
    setEditingId(item.id)
    setFormData({
      branch: item.branch,
      category: item.category || '',
      customer_name: item.customer_name || '',
      description: item.description || '',
      amount: item.amount,
      quantity_meters: item.quantity_meters,
      date: item.date
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المبيعة؟')) return

    try {
      const success = await deleteIncome(id)
      if (success) {
        setIncome(income.filter(item => item.id !== id))
        alert('✅ تم حذف المبيعة بنجاح')
      } else {
        alert('❌ فشل حذف المبيعة')
      }
    } catch (error) {
      console.error('Error deleting income:', error)
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  const filteredIncome = income.filter(item => {
    const matchesSearch = item.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && getCategoryLabel(categories, item.category).includes(searchQuery))
    const matchesDate = !dateFilter || item.date?.startsWith(dateFilter)
    return matchesSearch && matchesDate
  })

  const totalIncome = filteredIncome.reduce((sum, item) => sum + item.amount, 0)
  const categoryOptions = categoriesToOptions(categories)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA').format(amount) + ' ر.س'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
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
              href="/dashboard/accounting/fabrics"
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">المبيعات</h1>
                <p className="text-gray-500">إيرادات مبيعات الأقمشة</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 mb-1">إجمالي المبيعات</p>
              <p className="text-3xl font-bold">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="text-left">
              <p className="text-emerald-100 mb-1">عدد العمليات</p>
              <p className="text-3xl font-bold">{filteredIncome.length}</p>
            </div>
          </div>
        </motion.div>

        {/* Filters and Add Button */}
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
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="month"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditingId(null)
                  setFormData({
                    branch: 'fabrics',
                    category: '',
                    customer_name: '',
                    description: '',
                    amount: 0,
                    quantity_meters: undefined,
                    date: new Date().toISOString().split('T')[0]
                  })
                  setShowModal(true)
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden md:inline">إضافة</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Income List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {loading ? (
            <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
          ) : filteredIncome.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">لا توجد مبيعات</p>
            </div>
          ) : (
            filteredIncome.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{item.customer_name}</p>
                      {item.category && (
                        <p className="text-sm font-medium text-emerald-600">{getCategoryLabel(categories, item.category)}</p>
                      )}
                      <p className="text-sm text-gray-500">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
                        {item.quantity_meters && (
                          <>
                            <span className="text-xs text-gray-300">•</span>
                            <div className="flex items-center gap-1 text-xs text-blue-600">
                              <Ruler className="w-3 h-3" />
                              <span>{item.quantity_meters} متر</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(item.amount)}</p>
                      {item.quantity_meters && item.quantity_meters > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {formatCurrency(item.amount / item.quantity_meters)}/م
                        </p>
                      )}
                    </div>
                    {!item.is_automatic && (
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
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* Add Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {isEditing ? 'تعديل المبيعة' : 'إضافة مبيعة جديدة'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowModal(false)
                      setIsEditing(false)
                      setEditingId(null)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم العميل</label>
                    <input
                      type="text"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">فئة المبيعة</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      required
                    >
                      <option value="">اختر الفئة</option>
                      {categoryOptions.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الوصف (اختياري)</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="تفاصيل إضافية عن المبيعة..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س)</label>
                      <input
                        type="number"
                        value={formData.amount || ''}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Ruler className="w-4 h-4" />
                        الكمية (متر)
                      </label>
                      <input
                        type="number"
                        value={formData.quantity_meters || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          quantity_meters: e.target.value ? parseFloat(e.target.value) : undefined
                        })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        min="0"
                        step="0.1"
                        placeholder="اختياري"
                      />
                    </div>
                  </div>

                  {formData.amount && formData.quantity_meters && formData.quantity_meters > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-sm text-blue-800 flex items-center justify-between">
                        <span>السعر لكل متر:</span>
                        <span className="font-bold">{formatCurrency(formData.amount / formData.quantity_meters)}/م</span>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
                  >
                    {saving ? 'جاري الحفظ...' : (isEditing ? 'تحديث' : 'حفظ')}
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

export default function FabricsIncomePage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <FabricsIncomeContent />
    </ProtectedWorkerRoute>
  )
}

