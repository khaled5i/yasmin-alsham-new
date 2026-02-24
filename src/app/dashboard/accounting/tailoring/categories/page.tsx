'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  Settings,
  Plus,
  Trash2,
  Edit2,
  X,
  Save,
  TrendingUp,
  ShoppingBag,
  Home,
  Users
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import {
  getAllCategoriesForBranch,
  createCategory,
  updateCategory,
  deleteCategory,
  type AccountingCategory,
  type CategoryType
} from '@/lib/services/accounting-category-service'
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type Supplier
} from '@/lib/services/supplier-service'

// ============================================================================
// أسماء الأقسام
// ============================================================================

const CATEGORY_TYPE_NAMES: Record<CategoryType | 'suppliers', { name: string; icon: LucideIcon; color: string }> = {
  income: { name: 'المبيعات', icon: TrendingUp, color: 'emerald' },
  purchase: { name: 'المواد', icon: ShoppingBag, color: 'orange' },
  fixed_expense: { name: 'المصاريف الثابتة', icon: Home, color: 'blue' },
  salary: { name: 'الرواتب', icon: Users, color: 'purple' },
  suppliers: { name: 'الموردين', icon: Users, color: 'indigo' }
}


// ============================================================================
// المكون الرئيسي
// ============================================================================

function CategoriesManagementContent() {
  const [categories, setCategories] = useState<Record<CategoryType, AccountingCategory[]>>({
    income: [],
    purchase: [],
    fixed_expense: [],
    salary: []
  })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<CategoryType | 'suppliers'>('purchase')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<AccountingCategory | null>(null)
  const [formData, setFormData] = useState({
    category_id: '',
    label_ar: '',
    label_en: '',
    description: ''
  })
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [supplierFormData, setSupplierFormData] = useState({
    name: '',
    contact_info: '',
    notes: ''
  })

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllCategoriesForBranch('tailoring')
      setCategories(data)
    } catch (error) {
      console.error('Error loading categories:', error)
      showMessage('error', 'خطأ في تحميل الفئات')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await getSuppliers()
      setSuppliers(data)
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }, [])

  useEffect(() => {
    void loadCategories()
    void loadSuppliers()
  }, [loadCategories, loadSuppliers])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadSuppliers()
    }, 10000)

    const handleFocus = () => {
      void loadSuppliers()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadSuppliers])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }


  const handleAdd = () => {
    setEditingCategory(null)
    setFormData({
      category_id: '',
      label_ar: '',
      label_en: '',
      description: ''
    })
    setShowAddModal(true)
  }

  const handleEdit = (category: AccountingCategory) => {
    setEditingCategory(category)
    setFormData({
      category_id: category.category_id,
      label_ar: category.label_ar,
      label_en: category.label_en || '',
      description: category.description || ''
    })
    setShowAddModal(true)
  }

  const handleAddSupplier = () => {
    setEditingSupplier(null)
    setSupplierFormData({
      name: '',
      contact_info: '',
      notes: ''
    })
    setShowAddModal(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setSupplierFormData({
      name: supplier.name,
      contact_info: supplier.contact_info || '',
      notes: supplier.notes || ''
    })
    setShowAddModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      if (selectedType === 'suppliers') {
        if (editingSupplier) {
          const updatedSupplier = await updateSupplier(editingSupplier.id, supplierFormData)
          setSuppliers((prev) =>
            prev.map((supplier) =>
              supplier.id === editingSupplier.id ? updatedSupplier : supplier
            )
          )
          showMessage('success', 'تم تحديث المورد بنجاح')
        } else {
          const createdSupplier = await createSupplier(supplierFormData)
          setSuppliers((prev) =>
            [...prev, createdSupplier].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
          )
          showMessage('success', 'تم إضافة المورد بنجاح')
        }
        setShowAddModal(false)
        setEditingSupplier(null)
        return
      }

      if (editingCategory) {
        // تحديث فئة موجودة
        const result = await updateCategory(editingCategory.id, {
          label_ar: formData.label_ar,
          label_en: formData.label_en || undefined,
          description: formData.description || undefined
        })

        if (result.success) {
          showMessage('success', 'تم تحديث الفئة بنجاح')
          setShowAddModal(false)
          void loadCategories()
        } else {
          showMessage('error', result.error || 'خطأ في تحديث الفئة')
        }
      } else {
        // إضافة فئة جديدة
        const result = await createCategory({
          category_type: selectedType as CategoryType,
          branch: 'tailoring',
          category_id: formData.category_id,
          label_ar: formData.label_ar,
          label_en: formData.label_en || undefined,
          description: formData.description || undefined
        })

        if (result.success) {
          showMessage('success', 'تم إضافة الفئة بنجاح')
          setShowAddModal(false)
          void loadCategories()
        } else {
          showMessage('error', result.error || 'خطأ في إضافة الفئة')
        }
      }
    } catch (error) {
      console.error(error)
      showMessage('error', 'حدث خطأ غير متوقع')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف المورد "${name}"؟`)) return

    try {
      await deleteSupplier(id)
      showMessage('success', 'تم حذف المورد بنجاح')
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== id))
    } catch {
      showMessage('error', 'خطأ في حذف المورد')
    }
  }

  const handleDelete = async (category: AccountingCategory) => {
    const confirmMessage = category.is_default
      ? `تحذير: هذه فئة افتراضية. هل أنت متأكد من حذف الفئة "${category.label_ar}"؟`
      : `هل أنت متأكد من حذف الفئة "${category.label_ar}"؟`

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      const result = await deleteCategory(category.id)
      if (result.success) {
        showMessage('success', 'تم حذف الفئة بنجاح')
        void loadCategories()
      } else {
        showMessage('error', result.error || 'خطأ في حذف الفئة')
      }
    } catch {
      showMessage('error', 'حدث خطأ غير متوقع')
    }
  }

  const currentCategories = selectedType === 'suppliers' ? [] : (categories[selectedType] || [])
  const getTabCount = (type: CategoryType | 'suppliers') =>
    type === 'suppliers' ? suppliers.length : (categories[type]?.length || 0)


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* رسالة النجاح/الخطأ */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-4 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
            >
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-blue-100 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/accounting/tailoring"
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">إدارة الفئات المحاسبية</h1>
                  <p className="text-gray-500">قسم التفصيل</p>
                </div>
              </div>
            </div>
            <button
              onClick={selectedType === 'suppliers' ? handleAddSupplier : handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>{selectedType === 'suppliers' ? '\u0625\u0636\u0627\u0641\u0629 \u0645\u0648\u0631\u062F' : '\u0625\u0636\u0627\u0641\u0629 \u0641\u0626\u0629'}</span>
            </button>
          </div>

          {/* تبويبات الأقسام */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(Object.keys(CATEGORY_TYPE_NAMES) as Array<CategoryType | 'suppliers'>).map((type) => {
              const typeInfo = CATEGORY_TYPE_NAMES[type]
              const Icon = typeInfo.icon
              const isActive = selectedType === type
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${isActive
                    ? `bg-${typeInfo.color}-100 text-${typeInfo.color}-700 border-2 border-${typeInfo.color}-300`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{typeInfo.name}</span>
                  <span className="text-xs bg-white px-2 py-0.5 rounded-full">
                    {getTabCount(type)}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* قائمة الفئات */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-blue-100"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {CATEGORY_TYPE_NAMES[selectedType].name} ({selectedType === 'suppliers' ? suppliers.length : currentCategories.length})
          </h2>

          {selectedType === 'suppliers' ? (
            suppliers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>لا يوجد موردين</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {suppliers.map((supplier, index) => (
                  <motion.div
                    key={supplier.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                          {index + 1}
                        </span>
                        <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
                      </div>
                      {supplier.contact_info && (
                        <p className="text-sm text-gray-500 mt-1">{supplier.contact_info}</p>
                      )}
                      {supplier.notes && (
                        <p className="text-sm text-gray-600 mt-1">{supplier.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditSupplier(supplier)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.id, supplier.name)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            currentCategories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Settings className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>لا توجد فئات في هذا القسم</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {currentCategories.map((category, index) => (
                  <motion.div
                    key={category.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{category.label_ar}</h3>
                        {category.is_default && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            افتراضي
                          </span>
                        )}
                      </div>
                      {category.label_en && (
                        <p className="text-sm text-gray-500 mt-1">{category.label_en}</p>
                      )}
                      {category.description && (
                        <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">المعرف: {category.category_id}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          )}
        </motion.div>

        {/* نموذج الإضافة/التعديل */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
              onClick={() => setShowAddModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedType === 'suppliers' ? (editingSupplier ? '\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0648\u0631\u062F' : '\u0625\u0636\u0627\u0641\u0629 \u0645\u0648\u0631\u062F \u062C\u062F\u064A\u062F') : (editingCategory ? '\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0641\u0626\u0629' : '\u0625\u0636\u0627\u0641\u0629 \u0641\u0626\u0629 \u062C\u062F\u064A\u062F\u0629')}
                  </h3>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {selectedType === 'suppliers' ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          اسم المورد *
                        </label>
                        <input
                          type="text"
                          value={supplierFormData.name}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          placeholder="مثال: شركة الأقمشة العالمية"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          معلومات الاتصال
                        </label>
                        <input
                          type="text"
                          value={supplierFormData.contact_info}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, contact_info: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          placeholder="رقم الهاتف أو البريد الإلكتروني"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ملاحظات
                        </label>
                        <textarea
                          value={supplierFormData.notes}
                          onChange={(e) => setSupplierFormData({ ...supplierFormData, notes: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          rows={3}
                          placeholder="أي ملاحظات إضافية"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {!editingCategory && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            المعرف (ID) *
                          </label>
                          <input
                            type="text"
                            value={formData.category_id}
                            onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                            placeholder="مثال: new_category"
                            required
                            disabled={!!editingCategory}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            يستخدم في الكود (حروف إنجليزية صغيرة وشرطة سفلية فقط)
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          الاسم بالعربية *
                        </label>
                        <input
                          type="text"
                          value={formData.label_ar}
                          onChange={(e) => setFormData({ ...formData, label_ar: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          placeholder="مثال: خيوط حريرية"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          الاسم بالإنجليزية
                        </label>
                        <input
                          type="text"
                          value={formData.label_en}
                          onChange={(e) => setFormData({ ...formData, label_en: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          placeholder="Example: Silk Threads"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          الوصف
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                          rows={3}
                          placeholder="وصف اختياري للفئة"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all disabled:opacity-50"
                    >
                      <Save className="w-5 h-5" />
                      <span>{saving ? 'جاري الحفظ...' : 'حفظ'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function CategoriesManagementPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <CategoriesManagementContent />
    </ProtectedWorkerRoute>
  )
}

