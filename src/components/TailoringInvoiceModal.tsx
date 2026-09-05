'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Banknote,
  CalendarDays,
  CreditCard,
  ReceiptText,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { createTailoringInvoice } from '@/lib/services/tailoring-invoice-service'
import {
  dispatchCashDrawerOpen,
  type CashDrawerWithdrawalVoucher,
} from '@/lib/services/cash-drawer-service'
import type { PaymentMethod } from '@/types/simple-accounting'
import { useAuthStore } from '@/store/authStore'

interface TailoringInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
}

/** اسم المنتج الثابت المسجَّل مسبقاً في تطبيق الأستاذ. */
const SERVICE_PRODUCT_NAME = 'أجرة تفصيل فستان'

/** تاريخ اليوم بتوقيت الرياض بصيغة YYYY-MM-DD (نفس صيغة عمود income.date). */
function riyadhToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
}

/** عرض التاريخ للمستخدم بصيغة عربية مقروءة. */
function formatArabicDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function TailoringInvoiceModal({
  isOpen,
  onClose,
}: TailoringInvoiceModalProps) {
  const { user } = useAuthStore()
  const [amount, setAmount] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(riyadhToday)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('network')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const transactionIdRef = useRef('')

  useEffect(() => {
    if (!isOpen) return
    setAmount('')
    setInvoiceDate(riyadhToday())
    setPaymentMethod('network')
    setNotes('')
    setError(null)
    transactionIdRef.current = crypto.randomUUID()
  }, [isOpen])

  /**
   * الكاش يدخل درج المحل فعلياً، لذلك نُتبِع الحفظ بأمر فتح الدرج عبر
   * محطة طباعة التفصيل. فشل الدرج لا يلغي الفاتورة المحفوظة.
   */
  const openCashDrawer = async (incomeId: string, savedAmount: number) => {
    const voucher: CashDrawerWithdrawalVoucher = {
      withdrawalId: incomeId,
      amount: savedAmount,
      reason: 'فاتورة كاش — ياسمين الشام للخياطة',
      withdrawnAt: new Date().toISOString(),
      withdrawnBy: user?.full_name || 'مستخدم النظام',
    }

    try {
      await dispatchCashDrawerOpen(voucher)
      toast.success('تمت إضافة أمر فتح الدرج إلى محطة طباعة التفصيل', { icon: '🗄️' })
    } catch (drawerError) {
      const message = drawerError instanceof Error
        ? drawerError.message
        : 'تعذّر إرسال أمر فتح الدرج'
      toast.error(
        `تم حفظ الفاتورة وإضافة المبلغ للصندوق، لكن تعذّر فتح الدرج: ${message} — يمكنك فتحه من صفحة الصندوق.`,
        { duration: 9000 }
      )
    }
  }

  const handleSubmit = async () => {
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من صفر')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      setError('يرجى اختيار تاريخ صحيح للفاتورة')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const transactionId = transactionIdRef.current || crypto.randomUUID()
      const result = await createTailoringInvoice({
        transactionId,
        amount: parsedAmount,
        paymentMethod,
        notes: notes.trim(),
        date: invoiceDate,
      })

      if (!result.success) {
        setError(result.error || 'تعذّر حفظ الفاتورة')
        return
      }

      if (result.warning) {
        toast(result.warning, { icon: '⚠️', duration: 8000 })
      } else if (paymentMethod === 'cash') {
        toast.success('تم حفظ فاتورة الكاش وإضافة المبلغ إلى صندوق المحل')
      } else {
        const invoiceCode = result.income?.alostaz_invoice_code
        toast.success(
          `تم حفظ العملية وإرسال فاتورة الشبكة للمحاسبة${invoiceCode ? ` — ${invoiceCode}` : ''}`
        )
      }

      if (paymentMethod === 'cash' && result.income?.id) {
        await openCashDrawer(result.income.id, parsedAmount)
      }

      transactionIdRef.current = ''
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          dir="rtl"
          onMouseDown={() => !isSubmitting && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tailoring-invoice-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-violet-100 bg-white shadow-2xl"
          >
            <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-l from-violet-700 via-purple-700 to-indigo-700 px-6 py-6 text-white">
              <div className="absolute -left-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 right-12 h-32 w-32 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/20">
                    <ReceiptText className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 id="tailoring-invoice-title" className="text-xl font-bold sm:text-2xl">
                      إضافة فاتورة لياسمين الشام للخياطة
                    </h2>
                    <p className="mt-1 text-sm text-violet-50">
                      المبلغ شامل الضريبة، ويمكنك تعديل تاريخ الفاتورة قبل الحفظ
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  aria-label="إغلاق"
                  className="rounded-xl bg-white/10 p-2 transition hover:bg-white/20 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6" dir="rtl">
              <div>
                <label htmlFor="tailoring-invoice-amount" className="mb-2 block text-sm font-bold text-slate-800">
                  المبلغ شامل الضريبة
                </label>
                <div className="relative">
                  <input
                    id="tailoring-invoice-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    disabled={isSubmitting}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pl-20 text-lg font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                    ر.س
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="tailoring-invoice-date" className="block text-sm font-bold text-slate-800">
                    تاريخ الفاتورة
                  </label>
                  {invoiceDate !== riyadhToday() && (
                    <button
                      type="button"
                      onClick={() => setInvoiceDate(riyadhToday())}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>تاريخ اليوم</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="tailoring-invoice-date"
                    type="date"
                    value={invoiceDate}
                    disabled={isSubmitting}
                    onChange={(event) => setInvoiceDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pr-12 text-base font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />
                  <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {invoiceDate
                    ? `تُسجَّل العملية بتاريخ ${formatArabicDate(invoiceDate)}.`
                    : 'اختر تاريخ الفاتورة.'}
                </p>
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-bold text-slate-800">طريقة الدفع</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'network', label: 'شبكة', icon: CreditCard, color: 'emerald' },
                    { value: 'cash', label: 'كاش', icon: Banknote, color: 'amber' },
                  ] as const).map(({ value, label, icon: Icon, color }) => {
                    const selected = paymentMethod === value
                    return (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-4 font-bold transition ${
                          selected
                            ? color === 'emerald'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100'
                              : 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-100'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="tailoring-invoice-payment"
                          value={value}
                          checked={selected}
                          disabled={isSubmitting}
                          onChange={() => setPaymentMethod(value)}
                          className="sr-only"
                        />
                        <Icon className="h-5 w-5" />
                        <span>{label}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="tailoring-invoice-notes" className="mb-2 block text-sm font-bold text-slate-800">
                  ملاحظات <span className="font-medium text-slate-400">(اختياري)</span>
                </label>
                <textarea
                  id="tailoring-invoice-notes"
                  value={notes}
                  disabled={isSubmitting}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="أي تفاصيل تُحفظ مع هذه العملية"
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  الملاحظات تُحفظ داخل الموقع فقط ولا تُرسل إلى تطبيق المحاسبة.
                </p>
              </div>

              <div className={`rounded-2xl border p-4 text-sm font-medium ${
                paymentMethod === 'network'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}>
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    {paymentMethod === 'network'
                      ? `ستُرسل فاتورة مدفوعة بالكامل إلى تطبيق الأستاذ في فرع ياسمين الشام على المنتج «${SERVICE_PRODUCT_NAME}»، وسيكون تاريخا الإصدار والاستحقاق فيها مطابقين لتاريخ الفاتورة المختار أعلاه.`
                      : 'سيُفتح درج صندوق المحل ويُضاف المبلغ إلى رصيد الصندوق بالتاريخ المختار، ولن تُرسل الفاتورة إلى تطبيق الأستاذ.'}
                  </p>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-1/3"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-violet-600 to-indigo-600 px-5 py-3 font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
                >
                  {paymentMethod === 'cash'
                    ? <Banknote className={`h-5 w-5 ${isSubmitting ? 'animate-pulse' : ''}`} />
                    : <Send className={`h-5 w-5 ${isSubmitting ? 'animate-pulse' : ''}`} />}
                  <span>
                    {isSubmitting
                      ? 'جاري الحفظ...'
                      : paymentMethod === 'network'
                        ? 'إرسال إلى تطبيق المحاسبة'
                        : 'حفظ وفتح الصندوق'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
