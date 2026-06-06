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
  Boxes,
  Store,
  Users,
  CreditCard,
  Banknote,
  Layers,
  Square,
  BarChart3,
  ChevronDown
} from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { getIncome, createIncome, updateIncome, deleteIncome } from '@/lib/services/simple-accounting-service'
import type { Income, CreateIncomeInput } from '@/types/simple-accounting'
import { getInventoryItems, type FabricInventoryItem } from '@/lib/services/fabric-inventory-service'

// ─── بطاقة إحصائية (عدد الطلبات + إجمالي المدخول) ───
type StatAccent = 'amber' | 'slate' | 'indigo' | 'green' | 'teal' | 'purple'

const ACCENT_CLASSES: Record<StatAccent, { box: string; icon: string; total: string }> = {
  amber: { box: 'bg-amber-50 border-amber-100', icon: 'text-amber-600', total: 'text-amber-700' },
  slate: { box: 'bg-slate-50 border-slate-100', icon: 'text-slate-600', total: 'text-slate-700' },
  indigo: { box: 'bg-indigo-50 border-indigo-100', icon: 'text-indigo-600', total: 'text-indigo-700' },
  green: { box: 'bg-green-50 border-green-100', icon: 'text-green-600', total: 'text-green-700' },
  teal: { box: 'bg-teal-50 border-teal-100', icon: 'text-teal-600', total: 'text-teal-700' },
  purple: { box: 'bg-purple-50 border-purple-100', icon: 'text-purple-600', total: 'text-purple-700' }
}

function StatCard({
  icon: Icon,
  label,
  count,
  total,
  accent,
  formatCurrency
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  total: number
  accent: StatAccent
  formatCurrency: (n: number) => string
}) {
  const c = ACCENT_CLASSES[accent]
  return (
    <div className={`rounded-xl border p-3 ${c.box}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${c.icon}`} />
        <span className="text-sm font-bold text-gray-800">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-gray-500">عدد الطلبات</p>
          <p className="text-lg font-bold text-gray-900">{count}</p>
        </div>
        <div className="text-left">
          <p className="text-[11px] text-gray-500">إجمالي المدخول</p>
          <p className={`text-sm font-bold ${c.total}`}>{formatCurrency(total)}</p>
        </div>
      </div>
    </div>
  )
}

function FabricsIncomeContent() {
  const [income, setIncome] = useState<Income[]>([])
  const [inventoryItems, setInventoryItems] = useState<FabricInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState<Date | null>(new Date())
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)

  // حقول النموذج (مشتركة بين الإضافة والتعديل)
  const [selectedInventoryId, setSelectedInventoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'network' | ''>('')
  const [customerSource, setCustomerSource] = useState<'yasmin_alsham' | 'other' | ''>('')
  const [otherSourceText, setOtherSourceText] = useState('')

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
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().split('T')[0])
    setPaymentMethod('')
    setCustomerSource('')
    setOtherSourceText('')
  }

  const selectedItem = inventoryItems.find((it) => it.id === selectedInventoryId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الحقول الإجبارية (نفس الحقول في الإضافة والتعديل)
    if (!selectedInventoryId || !amount) return
    if (!paymentMethod) {
      alert('يرجى اختيار طريقة الدفع (كاش أو شبكة)')
      return
    }
    if (!customerSource) {
      alert('يرجى اختيار مصدر الزبونة')
      return
    }

    const amt = parseFloat(amount)
    const resolvedSource =
      customerSource === 'yasmin_alsham'
        ? 'ياسمين الشام'
        : otherSourceText.trim() || 'مصدر آخر'

    if (isEditing && editingId) {
      // تعديل سجل موجود
      setSaving(true)
      try {
        const result = await updateIncome(editingId, {
          customer_name: selectedItem?.name ?? '-',
          description: description || selectedItem?.name || '',
          amount: amt,
          payment_method: paymentMethod,
          customer_source: resolvedSource,
          date
        })
        if (result) {
          setIncome(income.map((it) => (it.id === editingId ? result : it)))
        }
        setShowModal(false)
        setIsEditing(false)
        setEditingId(null)
        resetForm()
      } catch {
        alert('❌ حدث خطأ أثناء الحفظ')
      } finally {
        setSaving(false)
      }
      return
    }

    // إضافة جديدة
    setSaving(true)
    try {
      const payload: CreateIncomeInput = {
        branch: 'fabrics',
        category: 'fabric_sale',
        customer_name: selectedItem?.name ?? '-',
        description: description || selectedItem?.name || '',
        amount: amt,
        payment_method: paymentMethod,
        customer_source: resolvedSource,
        date
      }
      const result = await createIncome(payload)
      if (result) {
        setIncome([result, ...income])
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
    // ربط القماش الحالي بالمخزون
    const matched = inventoryItems.find((inv) => inv.name === item.customer_name)
    setSelectedInventoryId(matched?.id ?? '')
    setAmount(item.amount.toString())
    setDescription(item.description || '')
    setDate(item.date)
    setPaymentMethod((item.payment_method as 'cash' | 'network') || '')
    // مصدر الزبونة: تحويل القيمة المخزّنة إلى خيار النموذج
    if (item.customer_source === 'ياسمين الشام') {
      setCustomerSource('yasmin_alsham')
      setOtherSourceText('')
    } else if (item.customer_source) {
      setCustomerSource('other')
      setOtherSourceText(item.customer_source)
    } else {
      setCustomerSource('')
      setOtherSourceText('')
    }
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

  // ─── إحصائيات المبيعات (تتبع نفس الفلترة الحالية: الشهر/البحث) ───
  // تصنيف نوع القماش (شك / سادة) بالاعتماد على بيانات المخزون
  const inventoryByName = new Map(inventoryItems.map((it) => [it.name, it]))
  const classifyFabric = (item: Income): 'shek' | 'plain' | 'other' => {
    const inv = item.customer_name ? inventoryByName.get(item.customer_name) : undefined
    const text = `${inv?.name ?? item.customer_name ?? ''} ${inv?.fabric_type ?? ''}`
    if (text.includes('شك')) return 'shek'
    if (text.includes('سادة')) return 'plain'
    return 'other'
  }

  const emptyStat = () => ({ count: 0, total: 0 })
  const breakdown = {
    yasmin: emptyStat(),
    otherSource: emptyStat(),
    network: emptyStat(),
    cash: emptyStat(),
    plain: emptyStat(),
    shek: emptyStat()
  }
  for (const it of filteredIncome) {
    // حسب مصدر الزبونة
    if (it.customer_source === 'ياسمين الشام') {
      breakdown.yasmin.count++
      breakdown.yasmin.total += it.amount
    } else if (it.customer_source) {
      breakdown.otherSource.count++
      breakdown.otherSource.total += it.amount
    }
    // حسب طريقة الدفع
    if (it.payment_method === 'network') {
      breakdown.network.count++
      breakdown.network.total += it.amount
    } else if (it.payment_method === 'cash') {
      breakdown.cash.count++
      breakdown.cash.total += it.amount
    }
    // حسب نوع القماش
    const fab = classifyFabric(it)
    if (fab === 'plain') {
      breakdown.plain.count++
      breakdown.plain.total += it.amount
    } else if (fab === 'shek') {
      breakdown.shek.count++
      breakdown.shek.total += it.amount
    }
  }

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

        {/* إحصائيات تفصيلية (قائمة منسدلة) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mb-6"
        >
          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            className="w-full flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
            aria-expanded={showStats}
          >
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow">
                <BarChart3 className="w-5 h-5 text-white" />
              </span>
              <span className="text-sm font-bold text-gray-800">الإحصائيات التفصيلية</span>
            </span>
            <ChevronDown
              className={`w-5 h-5 text-gray-400 transition-transform ${showStats ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {showStats && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-4">
          {/* حسب مصدر الزبونة */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">حسب مصدر الزبونة</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Store}
                label="ياسمين الشام"
                count={breakdown.yasmin.count}
                total={breakdown.yasmin.total}
                accent="amber"
                formatCurrency={formatCurrency}
              />
              <StatCard
                icon={Users}
                label="مصدر آخر"
                count={breakdown.otherSource.count}
                total={breakdown.otherSource.total}
                accent="slate"
                formatCurrency={formatCurrency}
              />
            </div>
          </div>

          {/* حسب طريقة الدفع */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">حسب طريقة الدفع</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={CreditCard}
                label="الشبكة"
                count={breakdown.network.count}
                total={breakdown.network.total}
                accent="indigo"
                formatCurrency={formatCurrency}
              />
              <StatCard
                icon={Banknote}
                label="الكاش"
                count={breakdown.cash.count}
                total={breakdown.cash.total}
                accent="green"
                formatCurrency={formatCurrency}
              />
            </div>
          </div>

          {/* حسب نوع القماش */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">حسب نوع القماش</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Square}
                label="قماش سادة"
                count={breakdown.plain.count}
                total={breakdown.plain.total}
                accent="teal"
                formatCurrency={formatCurrency}
              />
              <StatCard
                icon={Layers}
                label="قماش شك"
                count={breakdown.shek.count}
                total={breakdown.shek.total}
                accent="purple"
                formatCurrency={formatCurrency}
              />
            </div>
          </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
                      <div className="flex items-center flex-wrap gap-2 mt-1">
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
                        {item.payment_method && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                            {item.payment_method === 'cash' ? 'كاش' : 'شبكة'}
                          </span>
                        )}
                        {item.customer_source && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                            {item.customer_source}
                          </span>
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
                  {/* نموذج موحّد للإضافة والتعديل */}
                  {(
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
                            onChange={(e) => setSelectedInventoryId(e.target.value)}
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

                      {/* المبلغ */}
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

                      {/* طريقة الدفع */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">طريقة الدفع *</label>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            { value: 'cash', label: 'كاش' },
                            { value: 'network', label: 'شبكة' }
                          ] as const).map((opt) => (
                            <label
                              key={opt.value}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 border rounded-xl cursor-pointer transition-colors ${
                                paymentMethod === opt.value
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="paymentMethod"
                                value={opt.value}
                                checked={paymentMethod === opt.value}
                                onChange={() => setPaymentMethod(opt.value)}
                                className="accent-emerald-600"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* مصدر الزبونة */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">مصدر الزبونة *</label>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            { value: 'yasmin_alsham', label: 'ياسمين الشام' },
                            { value: 'other', label: 'مصدر آخر' }
                          ] as const).map((opt) => (
                            <label
                              key={opt.value}
                              className={`flex items-center justify-center gap-2 px-4 py-2.5 border rounded-xl cursor-pointer transition-colors ${
                                customerSource === opt.value
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="customerSource"
                                value={opt.value}
                                checked={customerSource === opt.value}
                                onChange={() => setCustomerSource(opt.value)}
                                className="accent-emerald-600"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        {customerSource === 'other' && (
                          <input
                            type="text"
                            value={otherSourceText}
                            onChange={(e) => setOtherSourceText(e.target.value)}
                            className="w-full mt-3 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                            placeholder="اكتب اسم المصدر (اختياري)..."
                          />
                        )}
                      </div>

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
                    disabled={saving || inventoryItems.length === 0}
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
