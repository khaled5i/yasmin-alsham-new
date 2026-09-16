'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  ShoppingBag,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Trash2,
  X,
  Pencil
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '@/lib/services/simple-accounting-service'
import { MATERIAL_EXPENSE_CATEGORIES } from '@/types/simple-accounting'
import { getCategories, createCategory, type AccountingCategory } from '@/lib/services/accounting-category-service'
import type { Expense, CreateExpenseInput } from '@/types/simple-accounting'
import { getSuppliers, type Supplier } from '@/lib/services/supplier-service'

function MaterialExpensesContent() {
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [categoryFilter, setCategoryFilter] = useState('')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<AccountingCategory[]>([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryForm, setCategoryForm] = useState({
    label_ar: '',
    label_en: '',
    label_ar_latin: ''
  })
  const [supplierFilter, setSupplierFilter] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<CreateExpenseInput>>({
    branch: 'tailoring',
    type: 'material',
    category: '',
    description: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    supplier_id: '',
    supplier_name: ''
  })

  const loadExpenses = async () => {
    try {
      const data = await getExpenses('tailoring', 'material')
      setExpenses(data)
    } catch (error) {
      console.error('Error loading expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
    loadSuppliers()
    loadCategories()
  }, [])

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliers()
      setSuppliers(data)
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }

  const loadCategories = async () => {
    try {
      const data = await getCategories('tailoring', 'purchase')
      setCategories(data)
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  // توليد معرف الفئة تلقائياً من الاسم الإنجليزي أو العربي بأحرف إنجليزية
  const buildCategoryId = (source: string) => {
    const base = source
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    const prefix = base || `category_${Date.now()}`
    const taken = new Set(categories.map(c => c.category_id))
    if (!taken.has(prefix)) return prefix

    let counter = 2
    while (taken.has(`${prefix}_${counter}`)) counter++
    return `${prefix}_${counter}`
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryForm.label_ar.trim()) return

    setSavingCategory(true)
    try {
      const categoryId = buildCategoryId(categoryForm.label_en || categoryForm.label_ar_latin)
      const result = await createCategory({
        category_type: 'purchase',
        branch: 'tailoring',
        category_id: categoryId,
        label_ar: categoryForm.label_ar.trim(),
        label_en: categoryForm.label_en.trim() || undefined,
        label_ar_latin: categoryForm.label_ar_latin.trim() || undefined
      })

      if (!result.success) {
        alert(`❌ ${result.error || 'فشل إضافة الفئة'}`)
        return
      }

      await loadCategories()
      setFormData(prev => ({ ...prev, category: categoryId }))
      setShowCategoryModal(false)
      setCategoryForm({ label_ar: '', label_en: '', label_ar_latin: '' })
    } catch (error) {
      console.error('Error creating category:', error)
      alert('❌ حدث خطأ أثناء إضافة الفئة')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category || !formData.amount) return

    try {
      // تنظيف البيانات: تحويل السلاسل النصية الفارغة إلى undefined
      const cleanedData = {
        ...formData,
        supplier_id: formData.supplier_id && formData.supplier_id.trim() !== ''
          ? formData.supplier_id
          : undefined,
        supplier_name: formData.supplier_name && formData.supplier_name.trim() !== ''
          ? formData.supplier_name
          : undefined,
        notes: formData.notes && formData.notes.trim() !== ''
          ? formData.notes
          : undefined,
      }

      if (isEditing && editingId) {
        const result = await updateExpense(editingId, cleanedData as Partial<CreateExpenseInput>)
        if (result) {
          setExpenses(expenses.map(item => item.id === editingId ? result : item))
          alert('✅ تم تحديث المصروف بنجاح')
        } else {
          alert('❌ فشل تحديث المصروف، يرجى المحاولة مجدداً')
          return
        }
      } else {
        const result = await createExpense(cleanedData as CreateExpenseInput)
        if (result) {
          setExpenses([result, ...expenses])
          alert('✅ تم إضافة المصروف بنجاح')
        }
      }

      setShowModal(false)
      setIsEditing(false)
      setEditingId(null)
      setFormData({
        branch: 'tailoring',
        type: 'material',
        category: '',
        description: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        supplier_id: '',
        supplier_name: ''
      })
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('❌ حدث خطأ أثناء الحفظ')
    }
  }

  const handleEdit = (item: Expense) => {
    setIsEditing(true)
    setEditingId(item.id)
    setFormData({
      branch: item.branch,
      type: item.type,
      category: item.category || '',
      description: item.description || '',
      amount: item.amount,
      date: item.date,
      notes: item.notes || '',
      supplier_id: item.supplier_id || '',
      supplier_name: item.supplier_name || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return

    try {
      await deleteExpense(id)
      setExpenses(expenses.filter(item => item.id !== id))
      alert('✅ تم حذف المصروف بنجاح')
    } catch (error) {
      console.error('Error deleting expense:', error)
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  const goToPrevMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 }
      return { year: prev.year, month: prev.month - 1 }
    })
  }

  const goToNextMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 }
      return { year: prev.year, month: prev.month + 1 }
    })
  }

  const selectedMonthLabel = new Date(selectedMonth.year, selectedMonth.month, 1)
    .toLocaleDateString('ar-SA-u-nu-latn', { month: 'long', year: 'numeric' })

  const isCurrentMonth = (() => {
    const now = new Date()
    return selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth()
  })()

  const filteredExpenses = expenses.filter(item => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !categoryFilter || item.category === categoryFilter
    const matchesSupplier = !supplierFilter || item.supplier_id === supplierFilter

    const itemDate = new Date(item.date)
    const matchesMonth = itemDate.getFullYear() === selectedMonth.year &&
      itemDate.getMonth() === selectedMonth.month

    return matchesSearch && matchesCategory && matchesSupplier && matchesMonth
  })

  const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US').format(amount) + ' ر.س'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // خيارات القوائم المنسدلة: الاسم العربي ويليه الإنجليزي إن وُجد
  const categoryOptions = categories.map(cat => ({
    id: cat.category_id,
    label: [cat.label_ar, cat.label_en, cat.label_ar_latin].filter(Boolean).join(' - ')
  }))

  // اسم الفئة من قسم الفئات، مع الرجوع للفئات القديمة لعرض السجلات السابقة
  const getCategoryLabel = (categoryId: string) => {
    return categories.find(c => c.category_id === categoryId)?.label_ar
      || MATERIAL_EXPENSE_CATEGORIES.find(c => c.id === categoryId)?.label
      || categoryId
  }

  // الاسم الإنجليزي للفئة كما هو مضاف في قسم الفئات
  const getCategoryLabelEn = (categoryId: string) => {
    return categories.find(c => c.category_id === categoryId)?.label_en || ''
  }

  // الاسم العربي بأحرف إنجليزية كما هو مضاف في قسم الفئات
  const getCategoryLabelArLatin = (categoryId: string) => {
    return categories.find(c => c.category_id === categoryId)?.label_ar_latin || ''
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/accounting/tailoring"
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-6 h-6 rotate-180" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
                  <ShoppingBag className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">مصروفات المواد</h1>
                  <p className="text-gray-500">أقمشة، خيوط، إكسسوارات</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setIsEditing(false)
                setEditingId(null)
                setFormData({
                  branch: 'tailoring',
                  type: 'material',
                  category: '',
                  description: '',
                  amount: 0,
                  date: new Date().toISOString().split('T')[0],
                  notes: ''
                })
                setShowModal(true)
              }}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg transition-all"
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
          className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 mb-1">إجمالي المصروفات</p>
              <p className="text-3xl font-bold">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="text-left">
              <p className="text-orange-100 mb-1">عدد العمليات</p>
              <p className="text-3xl font-bold">{filteredExpenses.length}</p>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="">كل الفئات</option>
                {categoryOptions.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>

            <div className="relative">
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="">كل الموردين</option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <button
                onClick={goToPrevMonth}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
              <span className="font-medium text-gray-700 text-sm flex-1 text-center">
                {selectedMonthLabel}
              </span>
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

        {/* قائمة المصروفات */}
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
              <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">لا توجد مصروفات</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 text-orange-600 hover:text-orange-700"
              >
                + إضافة مصروف جديد
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredExpenses.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                          <span>{getCategoryLabel(item.category)}</span>
                          {getCategoryLabelEn(item.category) && (
                            <span className="text-sm font-medium text-gray-400" dir="ltr">
                              {getCategoryLabelEn(item.category)}
                            </span>
                          )}
                          {getCategoryLabelArLatin(item.category) && (
                            <span className="text-sm font-medium text-gray-400" dir="ltr">
                              {getCategoryLabelArLatin(item.category)}
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">{item.description || 'بدون وصف'}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(item.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold text-orange-600">{formatCurrency(item.amount)}</p>
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
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Modal إضافة مصروف */}
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
                  <h3 className="text-xl font-bold text-gray-900">
                    {isEditing ? 'تعديل مصروف المواد' : 'إضافة مصروف مواد'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowModal(false)
                      setIsEditing(false)
                      setEditingId(null)
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">الفئة</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                        required
                      >
                        <option value="">اختر الفئة</option>
                        {categoryOptions.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="p-3 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-colors"
                        title="إضافة فئة جديدة"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">المورد (اختياري)</label>
                    <select
                      value={formData.supplier_id}
                      onChange={(e) => {
                        const supplier = suppliers.find(s => s.id === e.target.value)
                        setFormData({
                          ...formData,
                          supplier_id: e.target.value,
                          supplier_name: supplier?.name || ''
                        })
                      }}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">اختر المورد</option>
                      {suppliers.map(sup => (
                        <option key={sup.id} value={sup.id}>{sup.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">المبلغ</label>
                    <input
                      type="number"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
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
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">الوصف (اختياري)</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      rows={2}
                      placeholder="وصف إضافي..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition-all"
                  >
                    {isEditing ? 'تحديث المصروف' : 'حفظ المصروف'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal إضافة فئة جديدة */}
        <AnimatePresence>
          {showCategoryModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
              onClick={() => setShowCategoryModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900">إضافة فئة جديدة</h3>
                  <button
                    onClick={() => setShowCategoryModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateCategory} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">الاسم بالعربية *</label>
                    <input
                      type="text"
                      value={categoryForm.label_ar}
                      onChange={(e) => setCategoryForm({ ...categoryForm, label_ar: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      placeholder="مثال: خيوط حريرية"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">الاسم بالإنجليزية</label>
                    <input
                      type="text"
                      value={categoryForm.label_en}
                      onChange={(e) => setCategoryForm({ ...categoryForm, label_en: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      placeholder="Example: Silk Threads"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">عربي بأحرف إنجليزية</label>
                    <input
                      type="text"
                      value={categoryForm.label_ar_latin}
                      onChange={(e) => setCategoryForm({ ...categoryForm, label_ar_latin: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      placeholder="مثال: Khoyot Hareeriya"
                      dir="ltr"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    تُضاف الفئة إلى قسم الفئات (المواد) وتُختار تلقائياً في هذا المصروف.
                  </p>
                  <button
                    type="submit"
                    disabled={savingCategory}
                    className="w-full py-3 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {savingCategory ? 'جاري الحفظ...' : 'حفظ الفئة'}
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

export default function MaterialExpensesPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
      return
    }

    if (!isLoading && !permissionsLoading && user) {
      const isAdmin = user.role === 'admin'
      const isAccountant = user.role === 'worker' && workerType === 'accountant'

      if (!isAdmin && !isAccountant) {
        router.push('/dashboard')
        return
      }
    }
  }, [user, workerType, isLoading, permissionsLoading, router])

  if (isLoading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return <MaterialExpensesContent />
}
