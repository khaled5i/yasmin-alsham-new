'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle,
  CreditCard,
  History,
  LoaderCircle,
  Pencil,
  Receipt,
  Save,
  Split,
  X,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from '@/hooks/useTranslation'
import { useAuthStore } from '@/store/authStore'
import { useOrderStore } from '@/store/orderStore'
import type { Order } from '@/lib/services/order-service'
import {
  buildRemainingAdjustmentUpdates,
  describePriceAdjustment,
  formatAdjustmentDate,
  getOrderPriceBreakdown,
} from '@/lib/order-price-extras'
import type {
  RemainingPaymentDetails,
  RemainingPaymentMethod,
} from '@/lib/payment-breakdown'

export type {
  RemainingPaymentDetails,
  RemainingPaymentMethod,
} from '@/lib/payment-breakdown'

/** بيانات الطلب اللازمة لعرض تفصيل السعر وتعديل الدفعة المتبقية. */
export interface RemainingPaymentOrderInfo {
  id: string
  price?: number | string | null
  paid_amount?: number | string | null
  order_expenses?: unknown
  price_adjustments?: unknown
}

interface RemainingPaymentWarningModalProps {
  isOpen: boolean
  remainingAmount: number
  /** عند تمريره: يظهر تفصيل السعر/المصروفات وسجل التعديلات وزر تعديل المتبقي (للمدير). */
  order?: RemainingPaymentOrderInfo | null
  /** يُستدعى بعد حفظ تعديل الدفعة المتبقية بالطلب المحدّث من قاعدة البيانات. */
  onOrderUpdated?: (order: Order) => void
  onMarkAsPaid: (payment: RemainingPaymentDetails) => void | Promise<void>
  onIgnore: () => void | Promise<void>
  onCancel: () => void
}

const MONEY_TOLERANCE = 0.005
type SubmissionAction = 'paid' | 'ignore'

function parseAmount(value: string): number {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export default function RemainingPaymentWarningModal({
  isOpen,
  remainingAmount,
  onMarkAsPaid,
  onIgnore,
  onCancel,
  order,
  onOrderUpdated,
}: RemainingPaymentWarningModalProps) {
  const { t, isArabic } = useTranslation()
  const { user } = useAuthStore()
  const { updateOrder } = useOrderStore()
  const [isEditingRemaining, setIsEditingRemaining] = useState(false)
  const [editedRemaining, setEditedRemaining] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false)
  const [method, setMethod] = useState<RemainingPaymentMethod | null>(null)
  const [cashAmount, setCashAmount] = useState('')
  const [networkAmount, setNetworkAmount] = useState('')
  const [submittingAction, setSubmittingAction] = useState<SubmissionAction | null>(null)
  const isSubmittingRef = useRef(false)

  const normalizedRemaining = roundMoney(Math.max(0, Number(remainingAmount) || 0))
  const hasRemaining = normalizedRemaining >= MONEY_TOLERANCE
  const priceBreakdown = order ? getOrderPriceBreakdown(order) : null
  const paidSoFar = roundMoney(Number(order?.paid_amount) || 0)
  const canAdjustRemaining = !!order && !!onOrderUpdated && user?.role === 'admin'
  const parsedEditedRemaining = roundMoney(parseAmount(editedRemaining))
  const editedRemainingValid =
    editedRemaining.trim() !== '' &&
    parsedEditedRemaining >= 0 &&
    Math.abs(parsedEditedRemaining - normalizedRemaining) >= MONEY_TOLERANCE
  const editedPricePreview = roundMoney(paidSoFar + parsedEditedRemaining)
  const parsedCash = roundMoney(parseAmount(cashAmount))
  const parsedNetwork = roundMoney(parseAmount(networkAmount))
  const splitTotal = parsedCash + parsedNetwork
  const splitDifference = normalizedRemaining - splitTotal
  const isSplitValid =
    method === 'split' &&
    parsedCash > 0 &&
    parsedNetwork > 0 &&
    Math.abs(splitDifference) < MONEY_TOLERANCE
  const canSubmit = !hasRemaining || method === 'cash' || method === 'card' || isSplitValid

  let validationMessage: string | null = null
  if (method === 'split') {
    if (parsedCash <= 0 || parsedNetwork <= 0) {
      validationMessage = isArabic
        ? 'أدخل قيمة أكبر من صفر لكل من الكاش والشبكة'
        : 'Enter an amount greater than zero for both cash and network'
    } else if (Math.abs(splitDifference) >= MONEY_TOLERANCE) {
      const difference = Math.abs(splitDifference).toFixed(2)
      validationMessage = splitDifference > 0
        ? isArabic
          ? `باقي ${difference} ر.س لإكمال الدفعة`
          : `${difference} SAR is still needed`
        : isArabic
          ? `المجموع أكبر من المتبقي بمقدار ${difference} ر.س`
          : `The total exceeds the balance by ${difference} SAR`
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setMethod(null)
    setCashAmount('')
    setNetworkAmount('')
    setIsEditingRemaining(false)
    setEditedRemaining('')
    setAdjustReason('')
  }, [isOpen])

  const startEditingRemaining = () => {
    setEditedRemaining(normalizedRemaining.toFixed(2))
    setAdjustReason('')
    setIsEditingRemaining(true)
  }

  const saveRemainingAdjustment = async () => {
    if (!order || !onOrderUpdated || !editedRemainingValid || isSavingAdjustment) return

    let built: ReturnType<typeof buildRemainingAdjustmentUpdates>
    try {
      built = buildRemainingAdjustmentUpdates(order, parsedEditedRemaining, adjustReason, user?.full_name)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تعديل الدفعة المتبقية')
      return
    }

    setIsSavingAdjustment(true)
    try {
      const result = await updateOrder(order.id, built.updates)
      if (!result.success || !result.data) {
        toast.error(result.error || 'تعذّر حفظ تعديل الدفعة المتبقية')
        return
      }
      onOrderUpdated(result.data)
      setIsEditingRemaining(false)
      setMethod(null)
      setCashAmount('')
      setNetworkAmount('')
      toast.success(`تم تعديل الدفعة المتبقية إلى ${built.adjustment.new_remaining.toFixed(2)} ر.س`)
    } finally {
      setIsSavingAdjustment(false)
    }
  }

  const selectMethod = (nextMethod: RemainingPaymentMethod) => {
    if (isSubmittingRef.current) return

    setMethod(nextMethod)
    if (nextMethod !== 'split') {
      setCashAmount('')
      setNetworkAmount('')
    }
  }

  const runSubmission = async (
    action: SubmissionAction,
    submit: () => void | Promise<void>,
  ) => {
    // The ref closes the same-render gap before React applies the disabled state.
    if (isSubmittingRef.current) return

    isSubmittingRef.current = true
    setSubmittingAction(action)
    try {
      await submit()
    } finally {
      isSubmittingRef.current = false
      setSubmittingAction(null)
    }
  }

  const submitPayment = () => {
    if (!canSubmit || isSubmittingRef.current) return

    // بعد تخفيض المتبقي إلى صفر: تسليم عادي دون توزيع كاش/شبكة
    if (!hasRemaining) {
      void runSubmission('paid', () =>
        onMarkAsPaid({ method: 'cash', cashAmount: 0, networkAmount: 0 }),
      )
      return
    }

    if (!method) return

    if (method === 'cash') {
      void runSubmission('paid', () =>
        onMarkAsPaid({
          method,
          cashAmount: normalizedRemaining,
          networkAmount: 0,
        }),
      )
      return
    }

    if (method === 'card') {
      void runSubmission('paid', () =>
        onMarkAsPaid({
          method,
          cashAmount: 0,
          networkAmount: normalizedRemaining,
        }),
      )
      return
    }

    void runSubmission('paid', () =>
      onMarkAsPaid({
        method,
        cashAmount: Number(parsedCash.toFixed(2)),
        networkAmount: Number(parsedNetwork.toFixed(2)),
      }),
    )
  }

  const ignoreAndDeliver = () => {
    void runSubmission('ignore', onIgnore)
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={submittingAction ? undefined : onCancel}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 18 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remaining-payment-title"
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm">
                    <AlertTriangle className="h-7 w-7 text-white sm:h-8 sm:w-8" />
                  </div>
                  <h3 id="remaining-payment-title" className="text-lg font-bold text-white sm:text-xl">
                    {t('payment_warning') || (isArabic ? 'تنبيه دفعة متبقية' : 'Remaining payment')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submittingAction !== null}
                  aria-label={t('cancel') || (isArabic ? 'إلغاء' : 'Cancel')}
                  className="rounded-lg p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-base font-semibold text-amber-900">
                      {t('remaining_payment_warning_message') ||
                        (isArabic ? 'يوجد مبلغ متبقٍ غير مدفوع' : 'There is an unpaid balance')}
                    </p>
                    {priceBreakdown ? (
                      <div className="mb-2 space-y-1.5 rounded-lg border border-amber-200 bg-white p-3 text-sm">
                        {priceBreakdown.expensesTotal > 0 ? (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-gray-600">{isArabic ? 'السعر الأساسي' : 'Base price'}</span>
                              <span className="font-semibold text-gray-800" dir="ltr">
                                {priceBreakdown.basePrice.toFixed(2)} {t('sar') || 'SAR'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1 text-amber-800">
                                <Receipt className="h-4 w-4" />
                                {isArabic ? 'المصروفات' : 'Expenses'}
                              </span>
                              <span className="font-semibold text-amber-700" dir="ltr">
                                + {priceBreakdown.expensesTotal.toFixed(2)} {t('sar') || 'SAR'}
                              </span>
                            </div>
                            {priceBreakdown.expenses.some(expense => expense.note) ? (
                              <ul className="space-y-0.5 pr-5 text-xs text-gray-500">
                                {priceBreakdown.expenses.map(expense => (
                                  <li key={expense.id} className="break-words">
                                    • {expense.amount.toFixed(2)}{expense.note ? ` — ${expense.note}` : ''}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1.5">
                          <span className="font-medium text-gray-700">{isArabic ? 'السعر الكلي' : 'Total price'}</span>
                          <span className="font-bold text-gray-900" dir="ltr">
                            {priceBreakdown.totalPrice.toFixed(2)} {t('sar') || 'SAR'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-600">{isArabic ? 'المدفوع' : 'Paid'}</span>
                          <span className="font-semibold text-blue-700" dir="ltr">
                            {paidSoFar.toFixed(2)} {t('sar') || 'SAR'}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3">
                      <span className="text-sm text-gray-600">
                        {t('remaining_amount') || (isArabic ? 'الدفعة المتبقية' : 'Remaining amount')}:
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xl font-bold text-orange-600 sm:text-2xl" dir="ltr">
                          {normalizedRemaining.toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                        </span>
                        {canAdjustRemaining && !isEditingRemaining ? (
                          <button
                            type="button"
                            onClick={startEditingRemaining}
                            disabled={submittingAction !== null}
                            className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {isArabic ? 'تعديل' : 'Edit'}
                          </button>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isEditingRemaining ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                      <p className="text-sm font-bold text-orange-900">
                        {isArabic ? 'تعديل الدفعة المتبقية' : 'Adjust remaining balance'}
                      </p>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                          {isArabic ? 'الدفعة المتبقية الجديدة' : 'New remaining balance'}
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={editedRemaining}
                            onChange={(event) => setEditedRemaining(event.target.value)}
                            autoFocus
                            className="w-full rounded-lg border border-orange-300 bg-white px-3 py-3 pl-14 text-left text-base font-bold text-gray-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                            dir="ltr"
                          />
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                            {isArabic ? 'ر.س' : 'SAR'}
                          </span>
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                          {isArabic ? 'سبب التعديل (رسالة تبقى محفوظة مع الطلب)' : 'Reason (kept on the order)'}
                        </span>
                        <textarea
                          value={adjustReason}
                          onChange={(event) => setAdjustReason(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder={isArabic ? 'مثال: خصم للزبونة، تعديل إضافي...' : 'e.g. customer discount'}
                          className="w-full resize-none rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                      </label>
                      {editedRemainingValid ? (
                        <p className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700">
                          {parsedEditedRemaining < normalizedRemaining
                            ? isArabic ? 'تخفيض' : 'Decrease'
                            : isArabic ? 'زيادة' : 'Increase'}{' '}
                          {isArabic ? 'بمقدار' : 'by'}{' '}
                          <span className="font-bold" dir="ltr">
                            {Math.abs(parsedEditedRemaining - normalizedRemaining).toFixed(2)}
                          </span>{' '}
                          {isArabic ? 'ر.س — سيصبح سعر الطلب' : 'SAR — new order price'}{' '}
                          <span className="font-bold" dir="ltr">{editedPricePreview.toFixed(2)}</span>{' '}
                          {isArabic ? 'ر.س' : 'SAR'}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingRemaining(false)}
                          disabled={isSavingAdjustment}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                        >
                          {t('cancel') || (isArabic ? 'إلغاء' : 'Cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveRemainingAdjustment()}
                          disabled={!editedRemainingValid || isSavingAdjustment}
                          className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          {isSavingAdjustment ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {isArabic ? 'حفظ التعديل' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {priceBreakdown && priceBreakdown.adjustments.length > 0 ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-violet-900">
                    <History className="h-4 w-4" />
                    {isArabic ? 'تنبيه: تم تعديل سعر هذا الطلب' : 'Note: this order price was adjusted'}
                  </p>
                  <ul className="space-y-1.5">
                    {priceBreakdown.adjustments.map(adjustment => (
                      <li key={adjustment.id} className="rounded-lg bg-white px-3 py-2 text-xs text-gray-700">
                        <p>{describePriceAdjustment(adjustment)}</p>
                        {adjustment.reason ? (
                          <p className="mt-0.5 break-words text-gray-500">
                            {isArabic ? 'السبب' : 'Reason'}: {adjustment.reason}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {[formatAdjustmentDate(adjustment.created_at), adjustment.created_by_name].filter(Boolean).join(' • ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {hasRemaining ? (
              <div>
                <p className="mb-3 text-center text-sm font-semibold text-gray-700">
                  {isArabic ? 'طريقة دفع المبلغ المتبقي' : 'Remaining payment method'}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => selectMethod('cash')}
                    aria-pressed={method === 'cash'}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-semibold transition-all ${
                      method === 'cash'
                        ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                    }`}
                  >
                    <Banknote className="h-5 w-5" />
                    <span>{isArabic ? 'كاش' : 'Cash'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectMethod('card')}
                    aria-pressed={method === 'card'}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-semibold transition-all ${
                      method === 'card'
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                    }`}
                  >
                    <CreditCard className="h-5 w-5" />
                    <span>{isArabic ? 'شبكة' : 'Network'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectMethod('split')}
                    aria-pressed={method === 'split'}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-semibold transition-all ${
                      method === 'split'
                        ? 'border-teal-500 bg-teal-50 text-teal-700 ring-2 ring-teal-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300'
                    }`}
                  >
                    <Split className="h-5 w-5" />
                    <span>{isArabic ? 'كاش وشبكة بنفس الوقت' : 'Cash & network'}</span>
                  </button>
                </div>
              </div>
              ) : (
                <p className="flex items-center justify-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm font-semibold text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  {isArabic ? 'لم يعد على الطلب أي مبلغ متبقٍ' : 'No balance remains on this order'}
                </p>
              )}

              <AnimatePresence initial={false}>
                {hasRemaining && method === 'split' ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-green-800">
                            <Banknote className="h-4 w-4" />
                            {isArabic ? 'قيمة الكاش' : 'Cash amount'}
                          </span>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max={normalizedRemaining}
                              step="0.01"
                              value={cashAmount}
                              onChange={(event) => setCashAmount(event.target.value)}
                              placeholder="0.00"
                              autoFocus
                              className="w-full rounded-lg border border-green-300 bg-white px-3 py-3 pl-14 text-left text-base font-bold text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-200"
                              dir="ltr"
                            />
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                              {isArabic ? 'ر.س' : 'SAR'}
                            </span>
                          </div>
                        </label>

                        <label className="block">
                          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-blue-800">
                            <CreditCard className="h-4 w-4" />
                            {isArabic ? 'قيمة الشبكة' : 'Network amount'}
                          </span>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max={normalizedRemaining}
                              step="0.01"
                              value={networkAmount}
                              onChange={(event) => setNetworkAmount(event.target.value)}
                              placeholder="0.00"
                              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-3 pl-14 text-left text-base font-bold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              dir="ltr"
                            />
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                              {isArabic ? 'ر.س' : 'SAR'}
                            </span>
                          </div>
                        </label>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                        <span className="font-medium text-gray-600">
                          {isArabic ? 'المجموع' : 'Total'}
                        </span>
                        <span
                          className={`font-bold ${
                            isSplitValid ? 'text-green-700' : 'text-gray-800'
                          }`}
                          dir="ltr"
                        >
                          {splitTotal.toFixed(2)} / {normalizedRemaining.toFixed(2)}{' '}
                          {isArabic ? 'ر.س' : 'SAR'}
                        </span>
                      </div>

                      {validationMessage ? (
                        <p className="mt-2 text-center text-xs font-medium text-red-600" role="alert">
                          {validationMessage}
                        </p>
                      ) : (
                        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle className="h-4 w-4" />
                          {isArabic ? 'تم توزيع كامل الدفعة المتبقية' : 'The full balance is allocated'}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={submitPayment}
                  disabled={!canSubmit || submittingAction !== null}
                  aria-busy={submittingAction === 'paid'}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-semibold transition-all duration-300 ${
                    canSubmit && !submittingAction
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:from-green-600 hover:to-emerald-700 hover:shadow-xl'
                      : 'cursor-not-allowed bg-gray-200 text-gray-500'
                  }`}
                >
                  {submittingAction === 'paid' ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  <span>
                    {submittingAction === 'paid'
                      ? isArabic
                        ? 'جارٍ تحديث الدفع وتسليم الطلب...'
                        : 'Updating payment and delivering...'
                      : !hasRemaining
                        ? isArabic ? 'تسليم الطلب' : 'Deliver order'
                        : (
                        <>
                          {t('mark_as_paid') || (isArabic ? 'تم الدفع - تحديث المبلغ' : 'Mark as paid')}
                          {method
                            ? ` (${
                                method === 'cash'
                                  ? isArabic ? 'كاش' : 'Cash'
                                  : method === 'card'
                                    ? isArabic ? 'شبكة' : 'Network'
                                    : isArabic ? 'كاش وشبكة بنفس الوقت' : 'Cash & network'
                              })`
                            : ''}
                        </>
                      )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={ignoreAndDeliver}
                  disabled={submittingAction !== null}
                  aria-busy={submittingAction === 'ignore'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-500 px-6 py-4 font-semibold text-white shadow-md transition-all duration-300 hover:bg-gray-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingAction === 'ignore' ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Ban className="h-5 w-5" />
                  )}
                  <span className="flex flex-col items-center">
                    <span>
                      {submittingAction === 'ignore'
                        ? isArabic
                          ? 'جارٍ تسليم الطلب بصمت...'
                          : 'Delivering silently...'
                        : t('ignore_and_deliver') || (isArabic ? 'تجاهل وتسليم بصمت' : 'Ignore and deliver silently')}
                    </span>
                    {submittingAction !== 'ignore' ? (
                      <span className="mt-0.5 text-xs font-normal text-white/80">
                        {isArabic
                          ? 'بدون واتساب أو طباعة أو إرسال للمحاسبة'
                          : 'No WhatsApp, printing, or accounting sync'}
                      </span>
                    ) : null}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submittingAction !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-6 py-4 font-semibold text-white shadow-md transition-all duration-300 hover:bg-red-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle className="h-5 w-5" />
                  <span>{t('cancel') || (isArabic ? 'إلغاء' : 'Cancel')}</span>
                </button>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-center text-xs text-blue-800">
                  <span className="font-semibold">{t('note') || (isArabic ? 'ملاحظة' : 'Note')}:</span>{' '}
                  {isArabic
                    ? 'عند تأكيد الدفع سيُسجّل مبلغ الكاش ومبلغ الشبكة كلٌّ على حدة في الطلب.'
                    : 'When confirmed, cash and network amounts are recorded separately on the order.'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
