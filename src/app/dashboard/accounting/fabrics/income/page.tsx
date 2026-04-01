'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  Search,
  Calendar,
  Plus,
  X,
  Receipt,
  Ruler,
  Pencil,
  Trash2,
  Boxes
} from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getIncome, createIncome, updateIncome, deleteIncome } from '@/lib/services/simple-accounting-service'
import type { Income, CreateIncomeInput } from '@/types/simple-accounting'
import { getInventoryItems, addMovement, type FabricInventoryItem } from '@/lib/services/fabric-inventory-service'

function FabricsIncomeContent() {
  const [income, setIncome] = useState<Income[]>([])
  const [inventoryItems, setInventoryItems] = useState<FabricInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<Date | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // حقول النموذج
  const [selectedInventoryId, setSelectedInventoryId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  // عند التعديل — لا يوجد ربط بالمخزون (التعديل على السجل المالي فقط)
  const [editAmount, setEditAmount] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCategoryLabel, setEditCategoryLabel] = useState('')
  const [editQuantity, setEditQuantity] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [incomeData, invData] = await Promise.all([
        getIncome('fabrics'),
        getInventoryItems()
      ])
      setIncome(incomeData)
      setInventoryItems(invData)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSelectedInventoryId('')
    setQuantity('')
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().split('T')[0])
  }

  const selectedItem = inventoryItems.find((it) => it.id === selectedInventoryId)
  const unitLabel = selectedItem?.unit === 'meter' ? 'متر' : 'قطعة'
  const pricePerUnit =
    amount && quantity && parseFloat(quantity) > 0
      ? parseFloat(amount) / parseFloat(quantity)
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isEditing && editingId) {
      // تعديل — سجل مالي فقط
      if (!editAmount) return
      setSaving(true)
      try {
        const result = await updateIncome(editingId, {
          amount: parseFloat(editAmount),
          description: editDescription || undefined,
          date: editDate,
          quantity_meters: editQuantity ? parseFloat(editQuantity) : undefined
        })
        if (result) {
          setIncome(income.map((it) => (it.id === editingId ? result : it)))
        }
        setShowModal(false)
        setIsEditing(false)
        setEditingId(null)
      } catch {
        alert('❌ حدث خطأ أثناء الحفظ')
      } finally {
        setSaving(false)
      }
      return
    }

    // إضافة جديدة
    if (!selectedInventoryId || !amount) return
    const qty = parseFloat(quantity)
    const amt = parseFloat(amount)

    if (quantity && qty <= 0) {
      alert('يرجى إدخال كمية صحيحة')
      return
    }
    if (selectedItem && quantity && qty > selectedItem.current_quantity) {
      alert(`❌ الكمية (${qty}) أكبر من الرصيد المتاح (${selectedItem.current_quantity} ${unitLabel})`)
      return
    }

    setSaving(true)
    try {
      const payload: CreateIncomeInput = {
        branch: 'fabrics',
        category: 'fabric_sale',
        customer_name: selectedItem?.name ?? '-',
        description: description || selectedItem?.name || '',
        amount: amt,
        quantity_meters: quantity ? qty : undefined,
        date
      }
      const result = await createIncome(payload)
      if (result) {
        setIncome([result, ...income])
        // إخراج من المخزون
        if (quantity && qty > 0) {
          await addMovement({
            inventory_item_id: selectedInventoryId,
            movement_type: 'out',
            quantity: qty,
            description: description || 'بيع',
            date
          })
          setInventoryItems((prev) =>
            prev.map((it) =>
              it.id === selectedInventoryId
                ? { ...it, current_quantity: it.current_quantity - qty }
                : it
            )
          )
        }
      }
      setShowModal(false)
      resetForm()
    } catch {
      alert('❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: Income) => {
    setIsEditing(true)
    setEditingId(item.id)
    setEditAmount(item.amount.toString())
    setEditDescription(item.description || '')
    setEditDate(item.date)
    setEditCategoryLabel(item.customer_name || item.description || '')
    setEditQuantity(item.quantity_meters?.toString() || '')
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المبيعة؟')) return
    try {
      const success = await deleteIncome(id)
      if (success) {
        setIncome(income.filter((it) => it.id !== id))
      } else {
        alert('❌ فشل الحذف')
      }
    } catch {
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  const filteredIncome = income.filter((item) => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      item.customer_name?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)

    let matchDate = true
    if (dateFilter) {
      const d = new Date(item.date)
      matchDate =
        d.getMonth() === dateFilter.getMonth() &&
        d.getFullYear() === dateFilter.getFullYear()
    }
    return matchSearch && matchDate
  })

  const totalIncome = filteredIncome.reduce((sum, it) => sum + it.amount, 0)

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('ar-SA').format(n) + ' ر.س'

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/dashboard/accounting/fabrics" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
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

        {/* Summary */}
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
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <DatePicker
                  selected={dateFilter}
                  onChange={(d: Date | null) => setDateFilter(d)}
                  dateFormat="yyyy/MM"
                  showMonthYearPicker
                  placeholderText="اختر الشهر"
                  className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-right"
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
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
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
                      <Boxes className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">
                        {item.customer_name && item.customer_name !== '-'
                          ? item.customer_name
                          : item.description || 'مبيعة قماش'}
                      </p>
                      {item.description && item.customer_name !== item.description && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
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
                className="bg-white rounded-2xl p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">
                    {isEditing ? 'تعديل المبيعة' : 'إضافة مبيعة جديدة'}
                  </h2>
                  <button
                    onClick={() => { setShowModal(false); setIsEditing(false); setEditingId(null) }}
                    className="p-2 hover:bg-gray-100 rounded-xl"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {isEditing ? (
                    /* ─── نموذج التعديل ─── */
                    <>
                      <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
                        {editCategoryLabel}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س) *</label>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          min="0" step="0.01" required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الكمية (متر)</label>
                        <input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          min="0" step="0.1" placeholder="اختياري"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          placeholder="ملاحظات..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>
                    </>
                  ) : (
                    /* ─── نموذج الإضافة ─── */
                    <>
                      {/* اختيار القماش من المخزون */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          القماش *
                        </label>
                        {inventoryItems.length === 0 ? (
                          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                            <Boxes className="w-4 h-4 shrink-0" />
                            <span>
                              لا يوجد مخزون بعد.{' '}
                              <Link href="/dashboard/accounting/fabrics/inventory" className="underline font-medium">
                                أضف أصنافاً للمخزون
                              </Link>
                            </span>
                          </div>
                        ) : (
                          <select
                            value={selectedInventoryId}
                            onChange={(e) => {
                              setSelectedInventoryId(e.target.value)
                              // إذا كان هناك كمية مدخلة ومخزون محدد بوحدة المتر، ملأ الكمية تلقائياً
                              if (!quantity) {
                                const it = inventoryItems.find((i) => i.id === e.target.value)
                                if (it?.unit === 'meter' && it.cost_per_unit) {
                                  // لا نملأ تلقائياً — المستخدم يختار هو
                                }
                              }
                            }}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white"
                            required
                          >
                            <option value="">اختر القماش...</option>
                            {inventoryItems.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}
                                {it.fabric_type ? ` — ${it.fabric_type}` : ''}
                                {' '}(الرصيد: {it.current_quantity} {it.unit === 'meter' ? 'م' : 'ق'})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* الكمية والمبلغ */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            الكمية {selectedItem ? `(${unitLabel})` : ''}
                          </label>
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                            min="0.01" step="0.01" placeholder="0"
                          />
                          {selectedItem && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              متاح: {selectedItem.current_quantity} {unitLabel}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (ر.س) *</label>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                            min="0" step="0.01" required
                          />
                        </div>
                      </div>

                      {/* سعر الوحدة */}
                      {pricePerUnit !== null && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                          <p className="text-sm text-emerald-800 flex items-center justify-between">
                            <span>سعر المتر:</span>
                            <span className="font-bold">{formatCurrency(pricePerUnit)}/م</span>
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
                        <input
                          type="text"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          placeholder="أي تفاصيل إضافية..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={saving || (!isEditing && inventoryItems.length === 0)}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
                  >
                    {saving ? 'جاري الحفظ...' : isEditing ? 'تحديث' : 'حفظ'}
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
