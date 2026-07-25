'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle,
  CreditCard,
  Split,
  X,
  XCircle,
} from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import type {
  RemainingPaymentDetails,
  RemainingPaymentMethod,
} from '@/lib/payment-breakdown'

export type {
  RemainingPaymentDetails,
  RemainingPaymentMethod,
} from '@/lib/payment-breakdown'

interface RemainingPaymentWarningModalProps {
  isOpen: boolean
  remainingAmount: number
  onMarkAsPaid: (payment: RemainingPaymentDetails) => void
  onIgnore: () => void
  onCancel: () => void
}

const MONEY_TOLERANCE = 0.005

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
}: RemainingPaymentWarningModalProps) {
  const { t, isArabic } = useTranslation()
  const [method, setMethod] = useState<RemainingPaymentMethod | null>(null)
  const [cashAmount, setCashAmount] = useState('')
  const [networkAmount, setNetworkAmount] = useState('')

  const normalizedRemaining = roundMoney(Math.max(0, Number(remainingAmount) || 0))
  const parsedCash = roundMoney(parseAmount(cashAmount))
  const parsedNetwork = roundMoney(parseAmount(networkAmount))
  const splitTotal = parsedCash + parsedNetwork
  const splitDifference = normalizedRemaining - splitTotal
  const isSplitValid =
    method === 'split' &&
    parsedCash > 0 &&
    parsedNetwork > 0 &&
    Math.abs(splitDifference) < MONEY_TOLERANCE
  const canSubmit = method === 'cash' || method === 'card' || isSplitValid

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
  }, [isOpen])

  const selectMethod = (nextMethod: RemainingPaymentMethod) => {
    setMethod(nextMethod)
    if (nextMethod !== 'split') {
      setCashAmount('')
      setNetworkAmount('')
    }
  }

  const submitPayment = () => {
    if (!method || !canSubmit) return

    if (method === 'cash') {
      onMarkAsPaid({
        method,
        cashAmount: normalizedRemaining,
        networkAmount: 0,
      })
      return
    }

    if (method === 'card') {
      onMarkAsPaid({
        method,
        cashAmount: 0,
        networkAmount: normalizedRemaining,
      })
      return
    }

    onMarkAsPaid({
      method,
      cashAmount: Number(parsedCash.toFixed(2)),
      networkAmount: Number(parsedNetwork.toFixed(2)),
    })
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
            onClick={onCancel}
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
                  aria-label={t('cancel') || (isArabic ? 'إلغاء' : 'Cancel')}
                  className="rounded-lg p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
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
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3">
                      <span className="text-sm text-gray-600">
                        {t('remaining_amount') || (isArabic ? 'الدفعة المتبقية' : 'Remaining amount')}:
                      </span>
                      <span className="text-xl font-bold text-orange-600 sm:text-2xl" dir="ltr">
                        {normalizedRemaining.toFixed(2)} {t('sar') || (isArabic ? 'ر.س' : 'SAR')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

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

              <AnimatePresence initial={false}>
                {method === 'split' ? (
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
                  disabled={!canSubmit}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 font-semibold transition-all duration-300 ${
                    canSubmit
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:from-green-600 hover:to-emerald-700 hover:shadow-xl'
                      : 'cursor-not-allowed bg-gray-200 text-gray-500'
                  }`}
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>
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
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onIgnore}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-500 px-6 py-4 font-semibold text-white shadow-md transition-all duration-300 hover:bg-gray-600 hover:shadow-lg"
                >
                  <Ban className="h-5 w-5" />
                  <span>{t('ignore_and_deliver') || (isArabic ? 'تجاهل وتسليم الطلب' : 'Ignore and deliver')}</span>
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-6 py-4 font-semibold text-white shadow-md transition-all duration-300 hover:bg-red-600 hover:shadow-lg"
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
