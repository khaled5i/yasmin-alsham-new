'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Package,
  ArrowLeft,
  ShoppingCart,
  Search,
  Calendar,
  Plus,
  X,
  Trash2,
  Receipt,
  Pencil,
  Banknote,
  CreditCard,
  Wallet,
  ExternalLink
} from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '@/lib/services/simple-accounting-service'
import type { Expense, CreateExpenseInput, PaymentMethod, ExpenseCashSource } from '@/types/simple-accounting'
import { getCategories, categoriesToOptions, getCategoryLabel, type AccountingCategory } from '@/lib/services/accounting-category-service'
import {
  getInventoryItems,
  createInventoryItem,
  addMovement,
  type FabricInventoryItem
} from '@/lib/services/fabric-inventory-service'

function FabricsPurchasesContent() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<AccountingCategory[]>([])
  const [inventoryItems, setInventoryItems] = useState<FabricInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<Date | null>(new Date())
  const [categoryFilter, setCategoryFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<'' | 'cash' | 'network'>('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [cashSource, setCashSource] = useState<ExpenseCashSource | ''>('')
  // حقول ربط المخزون
  const [addToInventory, setAddToInventory] = useState(false)
  const [inventoryItemId, setInventoryItemId] = useState('')
  const [inventoryNewName, setInventoryNewName] = useState('')
  const [inventoryQuantity, setInventoryQuantity] = useState('')
  const [formData, setFormData] = useState<Partial<CreateExpenseInput>>({
    branch: 'fabrics',
    type: 'material',
    category: '',
    description: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    loadExpenses()
    loadCategories()
    loadInventoryItems()
  }, [])

  const loadExpenses = async () => {
    setLoading(true)
    try {
      const data = await getExpenses('fabrics', 'material')
      setExpenses(data)
    } catch (error) {
      console.error('Error loading expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const data = await getCategories('fabrics', 'purchase')
      setCategories(data)
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const loadInventoryItems = async () => {
    try {
      const data = await getInventoryItems()
      setInventoryItems(data)
    } catch (error) {
      console.error('Error loading inventory:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      branch: 'fabrics',
      type: 'material',
      category: '',
      description: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
    })
    setPaymentMethod('')
    setCashSource('')
    setAddToInventory(false)
    setInventoryItemId('')
    setInventoryNewName('')
    setInventoryQuantity('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category || !formData.amount) return

    if (!paymentMethod) {
      alert('يرجى اختيار طريقة الدفع (كاش أو شبكة)')
      return
    }

    if (!cashSource) {
      alert('يرجى اختيار مصدر التمويل (من الصندوق أو من خارج الصندوق)')
      return
    }

    // التحقق من حقول المخزون إذا كان الربط مفعلاً
    if (!isEditing && addToInventory) {
      if (!inventoryItemId && !inventoryNewName.trim()) {
        alert('يرجى اختيار صنف من المخزون أو كتابة اسم صنف جديد')
        return
      }
      if (!inventoryQuantity || parseFloat(inventoryQuantity) <= 0) {
        alert('يرجى إدخال كمية صحيحة للمخزون')
        return
      }
    }

    const payload = {
      ...formData,
      payment_method: paymentMethod as PaymentMethod,
      cash_source: cashSource as ExpenseCashSource,
    }

    setSaving(true)
    try {
      if (isEditing && editingId) {
        const result = await updateExpense(editingId, payload)
        if (result) {
          setExpenses(expenses.map(item => item.id === editingId ? result : item))
          alert('✅ تم تحديث المشترى بنجاح')
        } else {
          alert('❌ فشل تحديث المشترى، يرجى المحاولة مجدداً')
          return
        }
      } else {
        const result = await createExpense(payload as CreateExpenseInput)
        if (result) {
          setExpenses([result, ...expenses])

          // ربط المخزون تلقائياً
          if (addToInventory) {
            let targetItemId = inventoryItemId
            const qty = parseFloat(inventoryQuantity)
            const costUnit = formData.amount && qty > 0
              ? formData.amount / qty
              : undefined

            if (!targetItemId && inventoryNewName.trim()) {
              const newItem = await createInventoryItem({
                name: inventoryNewName.trim(),
                unit: 'meter',
                cost_per_unit: costUnit,
              })
              setInventoryItems((prev) => [newItem, ...prev])
              targetItemId = newItem.id
            }

            if (targetItemId) {
              await addMovement({
                inventory_item_id: targetItemId,
                movement_type: 'in',
                quantity: qty,
                cost_per_unit: costUnit,
                description: formData.description || 'شراء',
                purchase_expense_id: result.id,
                date: formData.date
              })
              setInventoryItems((prev) =>
                prev.map((it) =>
                  it.id === targetItemId
                    ? { ...it, current_quantity: it.current_quantity + qty }
                    : it
                )
              )
            }
          }

          alert('✅ تم إضافة المشترى بنجاح')
        }
      }

      setShowModal(false)
      setIsEditing(false)
      setEditingId(null)
      resetForm()
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
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
    })
    setPaymentMethod((item.payment_method as PaymentMethod) || '')
    setCashSource((item.cash_source as ExpenseCashSource) || '')
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه العملية؟')) return

    try {
      const success = await deleteExpense(id)
      if (success) {
        setExpenses(expenses.filter(e => e.id !== id))
        alert('✅ تم حذف المشترى بنجاح')
      } else {
        alert('❌ فشل حذف المشترى')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  const filteredExpenses = expenses.filter(item => {
    const matchesSearch = item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getCategoryLabel(categories, item.category).includes(searchQuery)
    const matchesCategory = !categoryFilter || item.category === categoryFilter
    const matchesPayment = !paymentFilter || item.payment_method === paymentFilter

    let matchesDate = true
    if (dateFilter) {
      const itemDate = new Date(item.date)
      matchesDate = itemDate.getMonth() === dateFilter.getMonth() &&
        itemDate.getFullYear() === dateFilter.getFullYear()
    }

    return matchesSearch && matchesCategory && matchesPayment && matchesDate
  })

  const categoryOptions = categoriesToOptions(categories)

  const totalExpenses = filteredExpenses.reduce((sum, item) => sum + item.amount, 0)
  const cashTotal = filteredExpenses.filter(i => i.payment_method === 'cash').reduce((s, i) => s + i.amount, 0)
  const networkTotal = filteredExpenses.filter(i => i.payment_method === 'network').reduce((s, i) => s + i.amount, 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA-u-nu-latn').format(amount) + ' ر.س'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn', {
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
              <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">المشتريات</h1>
                <p className="text-gray-500">شراء الأقمشة والمواد</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-orange-100 mb-1">إجمالي المشتريات</p>
              <p className="text-3xl font-bold">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="text-left">
              <p className="text-orange-100 mb-1">عدد العمليات</p>
              <p className="text-3xl font-bold">{filteredExpenses.length}</p>
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-orange-400/40">
            <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 flex-1">
              <Banknote className="w-4 h-4 text-green-200" />
              <div>
                <p className="text-xs text-orange-100">كاش</p>
                <p className="text-sm font-bold">{formatCurrency(cashTotal)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/15 rounded-xl px-3 py-2 flex-1">
              <CreditCard className="w-4 h-4 text-blue-200" />
              <div>
                <p className="text-xs text-orange-100">شبكة</p>
                <p className="text-sm font-bold">{formatCurrency(networkTotal)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
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
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            <div className="relative min-w-[180px]">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent appearance-none bg-white font-sans"
              >
                <option value="">كل الفئات</option>
                {categoryOptions.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* فلتر طريقة الدفع */}
            <div className="flex gap-2">
              {(['', 'cash', 'network'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentFilter(method)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    paymentFilter === method
                      ? method === 'cash'
                        ? 'bg-green-500 text-white'
                        : method === 'network'
                        ? 'bg-blue-500 text-white'
                        : 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {method === '' && 'الكل'}
                  {method === 'cash' && <><Banknote className="w-4 h-4" />كاش</>}
                  {method === 'network' && <><CreditCard className="w-4 h-4" />شبكة</>}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative">
                <DatePicker
                  selected={dateFilter}
                  onChange={(date: Date | null) => setDateFilter(date)}
                  dateFormat="yyyy/MM"
                  showMonthYearPicker
                  placeholderText="اختر الشهر"
                  className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent text-right"
                  isClearable
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditingId(null)
                  resetForm()
                  setShowModal(true)
                }}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden md:inline">إضافة</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {loading ? (
            <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">لا توجد مشتريات</p>
            </div>
          ) : (
            filteredExpenses.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{getCategoryLabel(categories, item.category)}</p>
                        {item.payment_method && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.payment_method === 'cash'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.payment_method === 'cash'
                              ? <><Banknote className="w-3 h-3" />كاش</>
                              : <><CreditCard className="w-3 h-3" />شبكة</>
                            }
                          </span>
                        )}
                        {item.cash_source && (
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.cash_source === 'box'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.cash_source === 'box'
                              ? <><Wallet className="w-3 h-3" />من الصندوق</>
                              : <><ExternalLink className="w-3 h-3" />من خارج الصندوق</>
                            }
                          </span>
                        )}
                      </div>
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
            ))
          )}
        </motion.div>

        {/* Modal */}
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
                className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {isEditing ? 'تعديل المشتريات' : 'إضافة مشتريات'}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">نوع القماش</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      required
                    >
                      <option value="">اختر النوع</option>
                      {categoryOptions.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الدفع</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium transition-all ${
                          paymentMethod === 'cash'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50'
                        }`}
                      >
                        <Banknote className="w-5 h-5" />
                        كاش
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('network')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium transition-all ${
                          paymentMethod === 'network'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <CreditCard className="w-5 h-5" />
                        شبكة
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">مصدر التمويل</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCashSource('box')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium transition-all ${
                          cashSource === 'box'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50'
                        }`}
                      >
                        <Wallet className="w-5 h-5" />
                        من الصندوق
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashSource('external')}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium transition-all ${
                          cashSource === 'external'
                            ? 'border-slate-500 bg-slate-50 text-slate-700'
                            : 'border-gray-200 text-gray-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <ExternalLink className="w-5 h-5" />
                        من خارج الصندوق
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      placeholder="تفاصيل الشراء..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س)</label>
                    <input
                      type="number"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      required
                    />
                  </div>

                  {/* ربط المخزون — يظهر فقط عند الإضافة */}
                  {!isEditing && (
                    <div className="border border-teal-200 rounded-xl p-3 bg-teal-50">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={addToInventory}
                          onChange={(e) => {
                            setAddToInventory(e.target.checked)
                            if (!e.target.checked) {
                              setInventoryItemId('')
                              setInventoryNewName('')
                              setInventoryQuantity('')
                            }
                          }}
                          className="w-4 h-4 text-teal-600 rounded"
                        />
                        <span className="text-sm font-medium text-teal-800">إضافة للمخزون</span>
                      </label>

                      {addToInventory && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              اختر صنفاً موجوداً أو أضف جديداً
                            </label>
                            <select
                              value={inventoryItemId}
                              onChange={(e) => {
                                setInventoryItemId(e.target.value)
                                if (e.target.value) setInventoryNewName('')
                              }}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 bg-white"
                            >
                              <option value="">— صنف جديد —</option>
                              {inventoryItems.map((it) => (
                                <option key={it.id} value={it.id}>{it.name}</option>
                              ))}
                            </select>
                          </div>

                          {!inventoryItemId && (
                            <div>
                              <input
                                type="text"
                                value={inventoryNewName}
                                onChange={(e) => setInventoryNewName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                placeholder="اسم الصنف الجديد..."
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">الكمية</label>
                            <input
                              type="number"
                              value={inventoryQuantity}
                              onChange={(e) => setInventoryQuantity(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                              min="0.01"
                              step="0.01"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50"
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

export default function FabricsPurchasesPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <FabricsPurchasesContent />
    </ProtectedWorkerRoute>
  )
}
