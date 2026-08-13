'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Banknote,
  CreditCard,
  ReceiptText,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import {
  createWomenWorkshopInvoice,
  WOMEN_WORKSHOP_OPERATION_OPTIONS,
  type WomenWorkshopOperationType,
  type WomenWorkshopPaymentMethod,
} from '@/lib/services/women-workshop-service'

interface WomenWorkshopInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
}

type ManualOperationType = Exclude<WomenWorkshopOperationType, 'order_measurement'>

export default function WomenWorkshopInvoiceModal({
  isOpen,
  onClose,
}: WomenWorkshopInvoiceModalProps) {
  const [operationType, setOperationType] = useState<ManualOperationType>('external_measurement')
  const [customOperationName, setCustomOperationName] = useState('')
  const [amount, setAmount] = useState('85')
  const [paymentMethod, setPaymentMethod] = useState<WomenWorkshopPaymentMethod>('card')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const transactionIdRef = useRef('')

  const selectedOperation = useMemo(
    () => WOMEN_WORKSHOP_OPERATION_OPTIONS.find((option) => option.value === operationType),
    [operationType]
  )

  useEffect(() => {
    if (!isOpen) return
    setOperationType('external_measurement')
    setCustomOperationName('')
    setAmount('85')
    setPaymentMethod('card')
    setError(null)
    transactionIdRef.current = crypto.randomUUID()
  }, [isOpen])

  const handleOperationChange = (value: ManualOperationType) => {
    const option = WOMEN_WORKSHOP_OPERATION_OPTIONS.find((item) => item.value === value)
    setOperationType(value)
    setAmount(option?.defaultAmount == null ? '' : String(option.defaultAmount))
    setError(null)
  }

  const handleSubmit = async () => {
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من صفر')
      return
    }
    if (operationType === 'other' && customOperationName.trim().length < 2) {
      setError('يرجى كتابة اسم العملية غير المدرجة')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createWomenWorkshopInvoice({
        transactionId: transactionIdRef.current || crypto.randomUUID(),
        operationType,
        customOperationName: customOperationName.trim(),
        amount: parsedAmount,
        paymentMethod,
      })

      if (!result.success) {
        setError(result.error || 'تعذّر حفظ الفاتورة')
        return
      }

      if (result.warning) {
        toast(result.warning, { icon: '⚠️', duration: 8000 })
      } else if (paymentMethod === 'cash') {
        toast.success('تم حفظ فاتورة الكاش داخل الموقع دون إرسالها للمحاسبة')
      } else {
        const invoiceCode = result.transaction?.alostaz_invoice_code
        toast.success(
          `تم حفظ العملية وإرسال فاتورة الشبكة للمحاسبة${invoiceCode ? ` — ${invoiceCode}` : ''}`
        )
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
            aria-labelledby="women-workshop-invoice-title"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-rose-100 bg-white shadow-2xl"
          >
            <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-l from-rose-600 via-pink-600 to-fuchsia-600 px-6 py-6 text-white">
              <div className="absolute -left-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 right-12 h-32 w-32 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/20">
                    <ReceiptText className="h-7 w-7" />
                  </div>
                  <div>
                    <h2 id="women-workshop-invoice-title" className="text-xl font-bold sm:text-2xl">
                      إضافة فاتورة للمشغل النسائي
                    </h2>
                    <p className="mt-1 text-sm text-rose-50">
                      المبلغ شامل الضريبة، والتاريخ يُسجّل تلقائياً وقت الحفظ
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

            <div className="space-y-6 p-6">
              <div>
                <label htmlFor="women-workshop-operation" className="mb-2 block text-sm font-bold text-slate-800">
                  نوع العملية
                </label>
                <select
                  id="women-workshop-operation"
                  value={operationType}
                  disabled={isSubmitting}
                  onChange={(event) => handleOperationChange(event.target.value as ManualOperationType)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                >
                  {WOMEN_WORKSHOP_OPERATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}{option.defaultAmount == null ? '' : ` — ${option.defaultAmount} ر.س`}
                    </option>
                  ))}
                </select>
                {selectedOperation?.defaultAmount != null && (
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    تم تعبئة السعر الافتراضي ويمكنك تعديله قبل الحفظ.
                  </p>
                )}
              </div>

              {operationType === 'other' && (
                <div>
                  <label htmlFor="women-workshop-custom-operation" className="mb-2 block text-sm font-bold text-slate-800">
                    اسم العملية الأخرى
                  </label>
                  <input
                    id="women-workshop-custom-operation"
                    value={customOperationName}
                    disabled={isSubmitting}
                    onChange={(event) => setCustomOperationName(event.target.value)}
                    placeholder="مثال: تركيب أكمام"
                    maxLength={120}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </div>
              )}

              <div>
                <label htmlFor="women-workshop-amount" className="mb-2 block text-sm font-bold text-slate-800">
                  المبلغ شامل الضريبة
                </label>
                <div className="relative">
                  <input
                    id="women-workshop-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    disabled={isSubmitting}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 pl-20 text-lg font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                    ر.س
                  </span>
                </div>
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-bold text-slate-800">طريقة الدفع</legend>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'card', label: 'شبكة', icon: CreditCard, color: 'emerald' },
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
                          name="women-workshop-payment"
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

              <div className={`rounded-2xl border p-4 text-sm font-medium ${
                paymentMethod === 'card'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}>
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    {paymentMethod === 'card'
                      ? 'ستُحفظ العملية في التقرير وتُرسل فاتورة مدفوعة بالكامل إلى تطبيق الأستاذ في فرع ياسمين الشام.'
                      : 'ستُحفظ العملية في تقرير المشغل النسائي داخل الموقع فقط، ولن تُرسل إلى تطبيق الأستاذ.'}
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
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-600 to-fuchsia-600 px-5 py-3 font-bold text-white shadow-lg shadow-pink-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
                >
                  <Send className={`h-5 w-5 ${isSubmitting ? 'animate-pulse' : ''}`} />
                  <span>
                    {isSubmitting
                      ? 'جاري الحفظ...'
                      : paymentMethod === 'card'
                        ? 'إرسال إلى تطبيق المحاسبة'
                        : 'حفظ فاتورة الكاش'}
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

