'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  Search,
  Plus,
  X,
  Receipt,
  Ruler,
  Pencil,
  Trash2,
  Boxes,
  Store,
  Users,
  Phone,
  CreditCard,
  Banknote,
  Layers,
  Square,
  BarChart3,
  ChevronDown,
  Images,
  Printer,
  Send,
  Calculator,
  CheckCircle2,
  Loader,
  UserRound,
  AlertTriangle,
  LockKeyhole
} from 'lucide-react'
import toast from 'react-hot-toast'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import ImageUpload from '@/components/ImageUpload'
import ReportPeriodPicker, {
  computePresetRange,
  type DateFilter,
  type DateRange,
} from '@/components/ReportPeriodPicker'
import { getIncome, createIncome, updateIncome, deleteIncome } from '@/lib/services/simple-accounting-service'
import type { Income, CreateIncomeInput, FabricSaleItem } from '@/types/simple-accounting'
import { getInventoryItems, type FabricInventoryItem } from '@/lib/services/fabric-inventory-service'
import { getFabricReceiptNumber } from '@/lib/print-fabric-receipt'
import { queueFabricReceiptPrint } from '@/lib/services/print-job-service'
import {
  sendFabricInvoiceToAlostaz,
  getFabricsAutoSendEnabled
} from '@/lib/services/alostaz-client'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import {
  formatFabricCurrency as formatCurrency,
  formatFabricNumber,
  roundFabricNumber,
} from '@/lib/fabric-number-format'

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

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function StatCard({
  icon: Icon,
  label,
  count,
  total,
  accent,
  formatCurrency,
  action
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  total: number
  accent: StatAccent
  formatCurrency: (n: number) => string
  action?: React.ReactNode
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
      {action}
    </div>
  )
}

// ─── بطاقة مصدر الزبونة مع تفصيل نوع القماش (سادة / شك) ───
function SourceStatCard({
  icon: Icon,
  label,
  stat,
  accent,
  formatCurrency
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  stat: {
    plain: { count: number; total: number }
    shek: { count: number; total: number }
    count: number
    total: number
  }
  accent: StatAccent
  formatCurrency: (n: number) => string
}) {
  const c = ACCENT_CLASSES[accent]
  return (
    <div className={`rounded-xl border p-3 ${c.box}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${c.icon}`} />
          <span className="text-sm font-bold text-gray-800">{label}</span>
        </span>
        <span className={`text-sm font-bold ${c.total}`}>{formatCurrency(stat.total)}</span>
      </div>
      <div className="space-y-2">
        {/* سادة */}
        <div className="flex items-center justify-between bg-white/60 rounded-lg px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <Square className="w-3.5 h-3.5 text-teal-600" />
            سادة
            <span className="text-[11px] text-gray-500">({stat.plain.count} قطعة)</span>
          </span>
          <span className="text-xs font-bold text-gray-900">{formatCurrency(stat.plain.total)}</span>
        </div>
        {/* شك */}
        <div className="flex items-center justify-between bg-white/60 rounded-lg px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            شك
            <span className="text-[11px] text-gray-500">({stat.shek.count} قطعة)</span>
          </span>
          <span className="text-xs font-bold text-gray-900">{formatCurrency(stat.shek.total)}</span>
        </div>
      </div>
    </div>
  )
}

function FabricsIncomeContent() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const {
    permissions,
    workerType,
    isLoading: workerPermissionsLoading,
  } = useWorkerPermissions()
  const canSendToAccounting = isAdmin || !!permissions?.canAccessAccounting
  const isFabricStoreManager = user?.role === 'worker' && workerType === 'fabric_store_manager'
  const [income, setIncome] = useState<Income[]>([])
  const [inventoryItems, setInventoryItems] = useState<FabricInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<DateRange>('month')
  const [periodRange, setPeriodRange] = useState<DateFilter>(() => computePresetRange('month'))
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)
  // حقول النموذج (مشتركة بين الإضافة والتعديل)
  // أسطر الأقمشة: كل سطر قماش من المخزون + كميته بالمتر (تدعم عدّة أقمشة في مبيعة واحدة)
  type FabricLine = { inventory_id: string; quantity_meters: string }
  const [fabricLines, setFabricLines] = useState<FabricLine[]>([{ inventory_id: '', quantity_meters: '' }])
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'network' | ''>('')
  const [customerSource, setCustomerSource] = useState<'yasmin_alsham' | 'other' | ''>('')
  const [otherSourceText, setOtherSourceText] = useState('')
  const [fabricImages, setFabricImages] = useState<string[]>([])
  // اسم العميل ورقم هاتفه (اختياريان — لا يمنعان حفظ المبيعة)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  // يبقى ثابتاً عند فشل الشبكة حتى تكون إعادة الحفظ آمنة ولا تنشئ مبيعة مكررة.
  const pendingIncomeIdRef = useRef<string | null>(null)

  // ── الربط مع الأستاذ للمحاسبة ──────────────────────────────
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sentMap, setSentMap] = useState<Record<string, { code?: string }>>({})

  useEffect(() => {
    loadAll()
  }, [])

  // مزامنة حالة إرسال الفاتورة لحظياً بين الهواتف المفتوحة على الصفحة.
  useEffect(() => {
    const channel = supabase
      .channel('fabrics_income_alostaz_sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'income',
          filter: 'branch=eq.fabrics',
        },
        (payload) => {
          const updated = payload.new as Partial<Income> & { id?: string }
          if (!updated.id) return

          setIncome((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    alostaz_customer_id:
                      updated.alostaz_customer_id ?? item.alostaz_customer_id,
                    alostaz_invoice_id:
                      updated.alostaz_invoice_id ?? item.alostaz_invoice_id,
                    alostaz_invoice_code:
                      updated.alostaz_invoice_code ?? item.alostaz_invoice_code,
                    alostaz_sync_status:
                      updated.alostaz_sync_status ?? item.alostaz_sync_status,
                    alostaz_synced_at:
                      updated.alostaz_synced_at ?? item.alostaz_synced_at,
                  }
                : item
            )
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
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
    pendingIncomeIdRef.current = null
    setFabricLines([{ inventory_id: '', quantity_meters: '' }])
    setAmount('')
    setDescription('')
    setDate(new Date().toISOString().split('T')[0])
    setPaymentMethod('')
    setCustomerSource('')
    setOtherSourceText('')
    setFabricImages([])
    setBuyerName('')
    setBuyerPhone('')
  }

  // ── إدارة أسطر الأقمشة المتعدّدة ──────────────────────────────
  const getInventoryItem = (id: string) => inventoryItems.find((it) => it.id === id)
  const addFabricLine = () =>
    setFabricLines((ls) => [...ls, { inventory_id: '', quantity_meters: '' }])
  const removeFabricLine = (idx: number) =>
    setFabricLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls))
  const updateFabricLine = (idx: number, patch: Partial<FabricLine>) =>
    setFabricLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))

  // هل القماش من نوع "شك"؟ (يُظهر خيار رفع صور القماش)
  const isShekFabric = (item?: FabricInventoryItem | null): boolean => {
    if (!item) return false
    return `${item.name ?? ''} ${item.fabric_type ?? ''}`.includes('شك')
  }
  // تُعرض صور القماش إذا كان أيّ قماش مختار من نوع "شك"
  const showFabricImages = fabricLines.some((l) => isShekFabric(getInventoryItem(l.inventory_id)))

  // بعد الحفظ أو عند إعادة الطباعة: أرسل الفاتورة دائماً إلى محطة طباعة الأقمشة.
  const sendReceiptToPrintStation = async (rec: Income, afterSave = true) => {
    try {
      // الشبكة: ننتظر رقم الأستاذ أولاً عند تفعيل الإرسال التلقائي.
      // التحقق الصريح يمنع وضع رقم الكاش المحلي على فاتورة شبكة.
      const recordWithKnownCode: Income = {
        ...rec,
        alostaz_invoice_code: rec.alostaz_invoice_code || sentMap[rec.id]?.code || null,
      }
      const printableRecord = await maybeAutoSendFabricInvoice(recordWithKnownCode)
      getFabricReceiptNumber(printableRecord)

      await queueFabricReceiptPrint(printableRecord)
      alert(afterSave
        ? '✅ تم الحفظ وأُرسلت الفاتورة للطباعة على الكاشير'
        : '✅ أُرسلت الفاتورة إلى محطة الطباعة على الكاشير')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '')
      alert(`${afterSave ? '⚠️ تم الحفظ لكن تعذّرت الطباعة' : '❌ تعذّرت الطباعة'}${message ? `\n${message}` : ''}`)
    }
  }

  const isSent = (item: Income) =>
    !!item.alostaz_invoice_id ||
    !!item.alostaz_invoice_code?.trim() ||
    item.alostaz_sync_status === 'sent' ||
    !!sentMap[item.id]

  const isLockedForFabricStoreManager = (item: Income) =>
    isFabricStoreManager && item.payment_method === 'network' && isSent(item)

  const handleApplyPeriod = (period: DateRange, range: DateFilter) => {
    setSelectedPeriod(period)
    setPeriodRange(range)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // بناء بنود القماش المختارة (كل قماش له صنف من المخزون + كميته بالمتر)
    const items: FabricSaleItem[] = fabricLines
      .filter((l) => l.inventory_id)
      .map((l) => {
        const it = getInventoryItem(l.inventory_id)
        const q = roundFabricNumber(parseFloat(l.quantity_meters))
        return {
          inventory_id: l.inventory_id,
          name: it?.name ?? '-',
          quantity_meters: Number.isFinite(q) && q > 0 ? q : null,
        }
      })

    // التحقق من الحقول الإجبارية (نفس الحقول في الإضافة والتعديل)
    if (items.length === 0) {
      alert('يرجى اختيار قماش واحد على الأقل')
      return
    }
    if (items.some((it) => it.quantity_meters == null)) {
      alert('يرجى إدخال الكمية بالمتر لكل قماش')
      return
    }
    if (!amount) return
    if (!paymentMethod) {
      alert('يرجى اختيار طريقة الدفع (كاش أو شبكة)')
      return
    }
    if (!customerSource) {
      alert('يرجى اختيار مصدر الزبونة')
      return
    }

    const amt = roundFabricNumber(parseFloat(amount))
    const resolvedSource =
      customerSource === 'yasmin_alsham'
        ? 'ياسمين الشام'
        : otherSourceText.trim() || 'مصدر آخر'

    // الاسم الأساسي = أول قماش (توافقاً مع العرض/الإحصائيات)؛ الأمتار = مجموع كل الأقمشة
    const fabricNames = items.map((it) => it.name).join('، ')
    const totalMeters = roundFabricNumber(
      items.reduce((s, it) => s + (it.quantity_meters || 0), 0)
    )

    // الحقول المشتركة بين الإضافة والتعديل
    const commonFields = {
      customer_name: items[0].name,
      description: description || fabricNames,
      amount: amt,
      quantity_meters: totalMeters > 0 ? totalMeters : null,
      fabric_items: items,
      payment_method: paymentMethod,
      customer_source: resolvedSource,
      fabric_images: showFabricImages ? fabricImages : [],
      buyer_name: buyerName.trim() || null,
      buyer_phone: buyerPhone.trim() || null,
      date,
    }

    if (isEditing && editingId) {
      const currentItem = income.find((item) => item.id === editingId)
      if (currentItem && isLockedForFabricStoreManager(currentItem)) {
        toast.error('لا يمكن لمدير متجر الأقمشة تعديل مبيعة شبكة أُرسلت إلى المحاسبة')
        return
      }

      // تعديل سجل موجود
      setSaving(true)
      try {
        const result = await updateIncome(editingId, commonFields)
        if (result) {
          setIncome((current) => current.map((it) => (it.id === editingId ? result : it)))
          await sendReceiptToPrintStation(result)
        } else {
          alert('❌ تعذّر تأكيد حفظ التعديل. بقي النموذج مفتوحاً؛ تحقق من الاتصال ثم أعد المحاولة.')
          return
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
      const incomeId = pendingIncomeIdRef.current || globalThis.crypto.randomUUID()
      pendingIncomeIdRef.current = incomeId
      const payload: CreateIncomeInput = {
        id: incomeId,
        branch: 'fabrics',
        category: 'fabric_sale',
        ...commonFields,
      }
      const result = await createIncome(payload)
      if (result) {
        setIncome((current) => [result, ...current])
        await sendReceiptToPrintStation(result)
      } else {
        alert(
          '⚠️ تعذّر تأكيد نتيجة الحفظ بسبب الاتصال. بقي النموذج مفتوحاً، وإعادة الضغط على الحفظ آمنة ولن تنشئ فاتورة مكررة.'
        )
        return
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
    if (isLockedForFabricStoreManager(item)) {
      toast.error('لا يمكن لمدير متجر الأقمشة تعديل مبيعة شبكة أُرسلت إلى المحاسبة')
      return
    }

    setIsEditing(true)
    setEditingId(item.id)
    // تحميل أسطر الأقمشة: من fabric_items إن وُجدت، وإلا سطر واحد من القماش القديم
    if (item.fabric_items && item.fabric_items.length > 0) {
      setFabricLines(
        item.fabric_items.map((fi) => {
          const matched =
            (fi.inventory_id ? inventoryItems.find((inv) => inv.id === fi.inventory_id) : null) ||
            inventoryItems.find((inv) => inv.name === fi.name)
          return {
            inventory_id: matched?.id ?? '',
            quantity_meters: fi.quantity_meters != null ? String(fi.quantity_meters) : '',
          }
        })
      )
    } else {
      const matched = inventoryItems.find((inv) => inv.name === item.customer_name)
      setFabricLines([
        {
          inventory_id: matched?.id ?? '',
          quantity_meters: item.quantity_meters != null ? String(item.quantity_meters) : '',
        },
      ])
    }
    setAmount(item.amount.toString())
    setDescription(item.description || '')
    setDate(item.date)
    setFabricImages(item.fabric_images ?? [])
    setBuyerName(item.buyer_name ?? '')
    setBuyerPhone(item.buyer_phone ?? '')
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

  const handleDelete = async (item: Income) => {
    if (isLockedForFabricStoreManager(item)) {
      toast.error('لا يمكن لمدير متجر الأقمشة حذف مبيعة شبكة أُرسلت إلى المحاسبة')
      return
    }

    if (!confirm('هل أنت متأكد من حذف هذه المبيعة؟')) return
    try {
      const success = await deleteIncome(item.id)
      if (success) {
        setIncome((current) => current.filter((it) => it.id !== item.id))
      } else {
        alert('❌ فشل الحذف')
      }
    } catch {
      alert('❌ حدث خطأ أثناء الحذف')
    }
  }

  // ── الربط مع الأستاذ للمحاسبة ──────────────────────────────
  const getSentCode = (item: Income) => item.alostaz_invoice_code || sentMap[item.id]?.code

  // تحديث السجل محلياً بعد إرسال فعلي (وضع الفواتير الحقيقية)
  const markIncomeSent = (id: string, invoiceId?: number, code?: string) => {
    setSentMap((prev) => ({ ...prev, [id]: { code } }))
    setIncome((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, alostaz_invoice_id: invoiceId ?? it.alostaz_invoice_id, alostaz_invoice_code: code ?? it.alostaz_invoice_code }
          : it
      )
    )
  }

  // إرسال فاتورة مبيعة واحدة إلى الأستاذ (يدوي — يعمل للكاش والشبكة)
  const handleSendToAccounting = async (item: Income) => {
    if (sendingId) return
    setSendingId(item.id)
    const res = await sendFabricInvoiceToAlostaz(item.id)
    setSendingId(null)

    if (res.success) {
      if (res.inProgress) {
        toast('هذه الفاتورة قيد الإرسال من جهاز آخر؛ تم منع محاولة مكررة.', { icon: '🛡️' })
        return
      }
      // تحويل الزر إلى علامة صح في الحالتين (مسودة/حقيقية) لمعرفة أنها أُرسِلت
      markIncomeSent(item.id, res.invoice_id, res.invoice_code)
      if (res.isDraft) {
        toast(`مسودة اختبار أُنشئت في الأستاذ${res.invoice_code ? ' — ' + res.invoice_code : ''}. تحقّق منها ثم احذفها.`, { icon: '🧪', duration: 6000 })
      } else if (res.alreadySent) {
        toast('هذه الفاتورة مُرسَلة مسبقاً إلى المحاسبة')
      } else {
        toast.success(`تم إرسال الفاتورة للمحاسبة${res.invoice_code ? ' — ' + res.invoice_code : ''}`)
        if (res.warning) toast(res.warning, { icon: '⚠️' })
      }
    } else {
      toast.error(res.error || 'فشل إرسال الفاتورة للمحاسبة')
    }
  }

  // الإرسال التلقائي عند إنشاء مبيعة جديدة (الشبكة فقط — الكاش لا يُرسَل تلقائياً)
  async function maybeAutoSendFabricInvoice(rec: Income): Promise<Income> {
    if (rec.payment_method !== 'network' || rec.alostaz_invoice_code) return rec
    if (!canSendToAccounting) return rec

    // نقرأ الإعداد عند كل فاتورة، كي يطبَّق الإيقاف من محطة الطباعة فوراً
    // حتى لو كانت صفحة المبيعات مفتوحة مسبقاً على هاتف آخر.
    const autoSendEnabled = await getFabricsAutoSendEnabled()
    if (!autoSendEnabled) return rec

    const res = await sendFabricInvoiceToAlostaz(rec.id)
    if (res.success) {
      if (res.inProgress) {
        toast('الفاتورة قيد الإرسال من جهاز آخر؛ تم منع محاولة مكررة.', { icon: '🛡️' })
        return rec
      }
      // تحويل الزر إلى علامة صح في الحالتين (مسودة/حقيقية)
      markIncomeSent(rec.id, res.invoice_id, res.invoice_code)
      if (res.isDraft) {
        toast(`مسودة اختبار أُنشئت في الأستاذ${res.invoice_code ? ' — ' + res.invoice_code : ''}. تحقّق منها ثم احذفها.`, { icon: '🧪', duration: 6000 })
      } else {
        toast.success(`تم إرسال الفاتورة للمحاسبة تلقائياً${res.invoice_code ? ' — ' + res.invoice_code : ''}`)
        if (res.warning) toast(res.warning, { icon: '⚠️' })
      }
      return {
        ...rec,
        alostaz_invoice_id: res.invoice_id ?? rec.alostaz_invoice_id,
        alostaz_invoice_code: res.invoice_code ?? rec.alostaz_invoice_code,
      }
    } else {
      toast.error('تعذّر الإرسال التلقائي للمحاسبة: ' + (res.error || ''))
    }
    return rec
  }

  const filteredIncome = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const startDateKey = toLocalDateKey(periodRange.startDate)
    const endDateKey = toLocalDateKey(periodRange.endDate)

    return income.filter((item) => {
      const matchSearch =
        !q ||
        item.customer_name?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.buyer_phone?.toLowerCase().includes(q)
      const saleDateKey = item.date.slice(0, 10)
      const matchDate = saleDateKey >= startDateKey && saleDateKey <= endDateKey

      return matchSearch && matchDate
    })
  }, [income, periodRange, searchQuery])

  // الإحصائيات والإجمالي يتبعان الفترة والبحث، ولا يعاد حسابهما أثناء تعبئة النموذج.
  const { totalIncome, breakdown } = useMemo(() => {
    const inventoryByName = new Map(inventoryItems.map((it) => [it.name, it]))
    const classifyFabric = (item: Income): 'shek' | 'plain' | 'other' => {
      const inv = item.customer_name ? inventoryByName.get(item.customer_name) : undefined
      const text = `${inv?.name ?? item.customer_name ?? ''} ${inv?.fabric_type ?? ''}`
      if (text.includes('شك')) return 'shek'
      if (text.includes('سادة')) return 'plain'
      return 'other'
    }

    const emptyStat = () => ({ count: 0, total: 0 })
    const emptySourceStat = () => ({
      plain: emptyStat(),
      shek: emptyStat(),
      count: 0,
      total: 0
    })
    const nextBreakdown = {
      yasmin: emptySourceStat(),
      otherSource: emptySourceStat(),
      network: emptyStat(),
      cash: emptyStat(),
      plain: emptyStat(),
      shek: emptyStat()
    }

    let nextTotalIncome = 0
    for (const item of filteredIncome) {
      nextTotalIncome += item.amount
      const fabricKind = classifyFabric(item)
      let sourceBucket: ReturnType<typeof emptySourceStat> | null = null

      if (item.customer_source === 'ياسمين الشام') {
        sourceBucket = nextBreakdown.yasmin
      } else if (item.customer_source) {
        sourceBucket = nextBreakdown.otherSource
      }

      if (sourceBucket) {
        sourceBucket.count++
        sourceBucket.total += item.amount
        if (fabricKind === 'plain') {
          sourceBucket.plain.count++
          sourceBucket.plain.total += item.amount
        } else if (fabricKind === 'shek') {
          sourceBucket.shek.count++
          sourceBucket.shek.total += item.amount
        }
      }

      if (item.payment_method === 'network') {
        nextBreakdown.network.count++
        nextBreakdown.network.total += item.amount
      } else if (item.payment_method === 'cash') {
        nextBreakdown.cash.count++
        nextBreakdown.cash.total += item.amount
      }

      if (fabricKind === 'plain') {
        nextBreakdown.plain.count++
        nextBreakdown.plain.total += item.amount
      } else if (fabricKind === 'shek') {
        nextBreakdown.shek.count++
        nextBreakdown.shek.total += item.amount
      }
    }

    return { totalIncome: nextTotalIncome, breakdown: nextBreakdown }
  }, [filteredIncome, inventoryItems])

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/dashboard/accounting/fabrics" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">المبيعات</h1>
                <p className="text-gray-500">إيرادات مبيعات الأقمشة</p>
              </div>
            </div>
            <Link
              href="/dashboard/accounting/fabrics/print-station"
              className="flex items-center gap-2 px-3 py-2 bg-sky-50 text-sky-700 rounded-xl hover:bg-sky-100 transition-colors text-sm font-medium flex-shrink-0"
              title="محطة الطباعة (تُفتح على جهاز الكاشير)"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">محطة الطباعة</span>
            </Link>
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
              <SourceStatCard
                icon={Store}
                label="ياسمين الشام"
                stat={breakdown.yasmin}
                accent="amber"
                formatCurrency={formatCurrency}
              />
              <SourceStatCard
                icon={Users}
                label="مصدر آخر"
                stat={breakdown.otherSource}
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
                action={
                  <Link
                    href="/dashboard/accounting/fabrics/income/shek-images"
                    className="mt-3 flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition-colors"
                  >
                    <Images className="w-3.5 h-3.5" />
                    عرض صور الأقمشة
                  </Link>
                }
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
            <div className="flex flex-col sm:flex-row gap-2">
              <ReportPeriodPicker
                period={selectedPeriod}
                range={periodRange}
                onApply={handleApplyPeriod}
                className="w-full sm:w-auto justify-center"
              />
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
            filteredIncome.map((item, index) => {
              // بنود القماش (قد تكون عدّة أقمشة في مبيعة واحدة)
              const fabricItems = item.fabric_items ?? []
              const isMultiFabric = fabricItems.length > 1
              const mutationPermissionPending =
                user?.role === 'worker' && (workerPermissionsLoading || !workerType)
              const mutationLocked = isLockedForFabricStoreManager(item)
              const titleName =
                fabricItems.length > 0
                  ? fabricItems.map((f) => f.name).join('، ')
                  : item.customer_name && item.customer_name !== '-'
                    ? item.customer_name
                    : item.description || 'مبيعة قماش'
              return (
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
                      <p className="font-bold text-gray-900">{titleName}</p>
                      {item.description && item.description !== titleName && (
                        <p className="text-sm text-gray-500">{item.description}</p>
                      )}
                      {/* تفصيل كميات الأقمشة عند تعدّدها */}
                      {isMultiFabric && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {fabricItems.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 text-xs text-blue-600">
                              <Ruler className="w-3 h-3" />
                              <span>
                                {f.name}
                                {f.quantity_meters != null ? ` — ${formatFabricNumber(f.quantity_meters)} م` : ''}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <p className="text-xs text-gray-400">{formatDate(item.date)}</p>
                        {!isMultiFabric && item.quantity_meters && (
                          <>
                            <span className="text-xs text-gray-300">•</span>
                            <div className="flex items-center gap-1 text-xs text-blue-600">
                              <Ruler className="w-3 h-3" />
                              <span>{formatFabricNumber(item.quantity_meters)} متر</span>
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
                        {item.buyer_phone && (
                          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium" dir="ltr">
                            <Phone className="w-3 h-3" />
                            {item.buyer_phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(item.amount)}</p>
                      {!isMultiFabric && item.quantity_meters && item.quantity_meters > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {formatCurrency(item.amount / item.quantity_meters)}/م
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {/* إرسال للمحاسبة (الأستاذ) — لمدير النظام والعامل المخوّل محاسبياً */}
                      {canSendToAccounting && (
                        isSent(item) ? (
                          <div
                            className="p-2 text-emerald-600 rounded-lg border border-emerald-100 bg-emerald-50 cursor-default"
                            title={`تم الإرسال للمحاسبة${getSentCode(item) ? ' — ' + getSentCode(item) : ''}`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : item.alostaz_sync_status === 'sending' ? (
                          <div
                            className="p-2 text-sky-600 rounded-lg border border-sky-100 bg-sky-50 cursor-wait"
                            title="الفاتورة قيد الإرسال من جهاز آخر"
                          >
                            <Loader className="w-4 h-4 animate-spin" />
                          </div>
                        ) : item.alostaz_sync_status === 'review_required' ? (
                          <div
                            className="p-2 text-amber-700 rounded-lg border border-amber-200 bg-amber-50 cursor-default"
                            title="توقفت إعادة الإرسال للحماية من التكرار؛ راجع تطبيق الأستاذ"
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSendToAccounting(item)}
                            disabled={sendingId === item.id}
                            className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-emerald-100"
                            title="إرسال للمحاسبة (الأستاذ)"
                          >
                            {sendingId === item.id
                              ? <Loader className="w-4 h-4 animate-spin" />
                              : <Calculator className="w-4 h-4" />}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => { void sendReceiptToPrintStation(item, false) }}
                        className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                        title="إرسال للطباعة على الكاشير"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      {!item.is_automatic && (
                        mutationPermissionPending ? (
                          <div
                            className="p-2 text-gray-400 rounded-lg border border-gray-100 bg-gray-50"
                            title="جاري التحقق من الصلاحيات"
                          >
                            <Loader className="w-4 h-4 animate-spin" />
                          </div>
                        ) : mutationLocked ? (
                          <div
                            className="p-2 text-amber-700 rounded-lg border border-amber-200 bg-amber-50 cursor-default"
                            title="مبيعة شبكة مرسلة للمحاسبة — التعديل والحذف متاحان للإدارة فقط"
                          >
                            <LockKeyhole className="w-4 h-4" />
                          </div>
                        ) : (
                          <>
                          <button
                            onClick={() => handleEdit(item)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
              )
            })
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
                      {/* اختيار الأقمشة من المخزون (قماش متعدد: قماش + كمية بالمتر لكل سطر) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          الأقمشة والكمية *
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
                          <>
                            <div className="space-y-2">
                              {fabricLines.map((line, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                  <select
                                    value={line.inventory_id}
                                    onChange={(e) => updateFabricLine(idx, { inventory_id: e.target.value })}
                                    dir="rtl"
                                    className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white text-sm text-right truncate"
                                    required={idx === 0}
                                  >
                                    <option value="">اختر القماش...</option>
                                    {inventoryItems.map((it) => (
                                      <option key={it.id} value={it.id}>
                                        {it.name}
                                        {it.fabric_type ? ` — ${it.fabric_type}` : ''}
                                        {' '}— الرصيد {formatFabricNumber(it.current_quantity)} {it.unit === 'meter' ? 'م' : 'ق'}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="relative w-24 shrink-0">
                                    <input
                                      type="number"
                                      value={line.quantity_meters}
                                      onChange={(e) => updateFabricLine(idx, { quantity_meters: e.target.value })}
                                      className="w-full pl-7 pr-2 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                                      placeholder="الكمية"
                                      min="0"
                                      step="0.01"
                                    />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                                      م
                                    </span>
                                  </div>
                                  {fabricLines.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeFabricLine(idx)}
                                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl shrink-0 transition-colors"
                                      title="حذف هذا القماش"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={addFabricLine}
                              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                            >
                              <Plus className="w-4 h-4" />
                              إضافة قماش
                            </button>
                          </>
                        )}
                      </div>

                      {/* صور القماش — تظهر فقط عند اختيار قماش "شك" */}
                      {showFabricImages && (
                        <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-purple-800 mb-2">
                            <Images className="w-4 h-4" />
                            صور القماش (شك)
                          </label>
                          <ImageUpload
                            images={fabricImages}
                            onImagesChange={setFabricImages}
                            acceptVideo={false}
                            alwaysShowDeleteOnMobileAndTablet
                          />
                        </div>
                      )}

                      {/* المبلغ الإجمالي للمبيعة كلها */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ الإجمالي (ر.س) *</label>
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

                      {/* اسم العميل (اختياري) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">اسم العميل (اختياري)</label>
                        <div className="relative">
                          <UserRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            className="w-full pr-9 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                            placeholder="اسم العميل..."
                          />
                        </div>
                      </div>

                      {/* رقم هاتف العميل (اختياري) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف (اختياري)</label>
                        <div className="relative">
                          <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="tel"
                            value={buyerPhone}
                            onChange={(e) => setBuyerPhone(e.target.value)}
                            dir="ltr"
                            className="w-full pr-9 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-right"
                            placeholder="05xxxxxxxx"
                          />
                        </div>
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
                    {saving
                      ? 'جاري الحفظ...'
                      : isEditing
                        ? 'تحديث وإرسال'
                        : 'حفظ وإرسال'}
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
