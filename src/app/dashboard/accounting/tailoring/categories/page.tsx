'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Scissors,
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
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import {
  getAllCategoriesForBranch,
  createCategory,
  updateCategory,
  deleteCategory,
  type AccountingCategory,
  type CategoryType
} from '@/lib/services/accounting-category-service'

// ============================================================================
// أسماء الأقسام
// ============================================================================

const CATEGORY_TYPE_NAMES: Record<CategoryType, { name: string; icon: any; color: string }> = {
  income: { name: 'المبيعات', icon: TrendingUp, color: 'emerald' },
  purchase: { name: 'المواد', icon: ShoppingBag, color: 'orange' },
  fixed_expense: { name: 'المصاريف الثابتة', icon: Home, color: 'blue' },
  salary: { name: 'الرواتب', icon: Users, color: 'purple' }
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
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<CategoryType>('purchase')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<AccountingCategory | null>(null)
  const [formData, setFormData] = useState({
    category_id: '',
    label_ar: '',
    label_en: '',
    description: ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
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
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
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
          loadCategories()
        } else {
          showMessage('error', result.error || 'خطأ في تحديث الفئة')
        }
      } else {
        // إضافة فئة جديدة
        const result = await createCategory({
          category_type: selectedType,
          branch: 'tailoring',
          category_id: formData.category_id,
          label_ar: formData.label_ar,
          label_en: formData.label_en || undefined,
          description: formData.description || undefined
        })

        if (result.success) {
          showMessage('success', 'تم إضافة الفئة بنجاح')
          setShowAddModal(false)
          loadCategories()
        } else {
          showMessage('error', result.error || 'خطأ في إضافة الفئة')
        }
      }
    } catch (error) {
      showMessage('error', 'حدث خطأ غير متوقع')
    } finally {
      setSaving(false)
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
        loadCategories()
      } else {
        showMessage('error', result.error || 'خطأ في حذف الفئة')
      }
    } catch (error) {
      showMessage('error', 'حدث خطأ غير متوقع')
    }
  }

  const currentCategories = categories[selectedType] || []

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
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة فئة</span>
            </button>
          </div>

          {/* تبويبات الأقسام */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(Object.keys(CATEGORY_TYPE_NAMES) as CategoryType[]).map((type) => {
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
                    {categories[type]?.length || 0}
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
            {CATEGORY_TYPE_NAMES[selectedType].name} ({currentCategories.length})
          </h2>

          {currentCategories.length === 0 ? (
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
                    {editingCategory ? 'تعديل الفئة' : 'إضافة فئة جديدة'}
                  </h3>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
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


