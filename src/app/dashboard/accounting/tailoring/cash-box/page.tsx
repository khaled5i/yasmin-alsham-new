'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  HandCoins,
  History,
  Loader2,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  WalletCards,
  X,
} from 'lucide-react'
import DirectPrinterSetup from '@/components/DirectPrinterSetup'
import NumericInput from '@/components/NumericInput'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import {
  getCashBoxBalance,
  getCashBoxTransactions,
  withdrawFromCashBox,
} from '@/lib/services/simple-accounting-service'
import {
  dispatchCashDrawerOpen,
  type CashDrawerWithdrawalVoucher,
} from '@/lib/services/cash-drawer-service'
import type {
  CashBoxTransaction,
  CashBoxTransactionType,
} from '@/types/simple-accounting'

type MovementFilter = 'all' | 'in' | 'out'

const currencyFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  style: 'currency',
  currency: 'SAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const transactionAppearance: Record<
  CashBoxTransactionType,
  {
    icon: typeof Banknote
    iconClass: string
    containerClass: string
    badge: string
  }
> = {
  order_deposit: {
    icon: ShoppingBag,
    iconClass: 'text-emerald-700',
    containerClass: 'bg-emerald-50 ring-emerald-100',
    badge: 'طلب حديث',
  },
  order_delivery: {
    icon: PackageCheck,
    iconClass: 'text-teal-700',
    containerClass: 'bg-teal-50 ring-teal-100',
    badge: 'عند التسليم',
  },
  cash_income: {
    icon: CircleDollarSign,
    iconClass: 'text-green-700',
    containerClass: 'bg-green-50 ring-green-100',
    badge: 'وارد كاش',
  },
  box_expense: {
    icon: ReceiptText,
    iconClass: 'text-orange-700',
    containerClass: 'bg-orange-50 ring-orange-100',
    badge: 'مصروف',
  },
  balance_adjustment: {
    icon: SlidersHorizontal,
    iconClass: 'text-sky-700',
    containerClass: 'bg-sky-50 ring-sky-100',
    badge: 'تعديل رصيد',
  },
  withdrawal: {
    icon: HandCoins,
    iconClass: 'text-rose-700',
    containerClass: 'bg-rose-50 ring-rose-100',
    badge: 'سحب',
  },
}

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTimeFormatter.format(date)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.'
}

interface WithdrawalModalProps {
  balance: number
  submitting: boolean
  onClose: () => void
  onSubmit: (amount: number, reason: string) => Promise<void>
}

function WithdrawalModal({
  balance,
  submitting,
  onClose,
  onSubmit,
}: WithdrawalModalProps) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const numericAmount = Number(amount)
  const balanceAfter =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? Math.max(0, balance - numericAmount)
      : balance

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('أدخل قيمة سحب صحيحة أكبر من صفر.')
      return
    }
    if (numericAmount > balance) {
      setError('قيمة السحب أكبر من الرصيد الموجود في الصندوق.')
      return
    }
    if (reason.trim().length < 3) {
      setError('اكتب سببًا واضحًا للسحب من 3 أحرف على الأقل.')
      return
    }

    try {
      await onSubmit(numericAmount, reason.trim())
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawal-dialog-title"
        className="w-full max-w-lg overflow-hidden rounded-t-[2rem] bg-[#fffdf8] shadow-2xl sm:rounded-[2rem]"
      >
        <div className="relative overflow-hidden bg-stone-950 px-6 py-6 text-white">
          <div className="absolute -left-12 -top-16 h-40 w-40 rounded-full bg-amber-400/15 blur-2xl" />
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="إغلاق نافذة السحب"
            className="absolute left-4 top-4 rounded-full border border-white/10 bg-white/10 p-2 text-stone-200 transition hover:bg-white/20 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-stone-950 shadow-lg shadow-amber-400/20">
              <HandCoins className="h-7 w-7" />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold tracking-[0.18em] text-amber-300">
                حركة نقدية صادرة
              </p>
              <h2 id="withdrawal-dialog-title" className="text-2xl font-black">
                إجراء عملية سحب
              </h2>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div>
              <p className="text-xs font-bold text-stone-500">الرصيد الحالي</p>
              <p className="mt-1 text-lg font-black text-stone-950">
                {formatCurrency(balance)}
              </p>
            </div>
            <div className="border-r border-stone-200 pr-3">
              <p className="text-xs font-bold text-stone-500">بعد السحب</p>
              <p className="mt-1 text-lg font-black text-amber-700">
                {formatCurrency(balanceAfter)}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="withdrawal-amount" className="mb-2 block text-sm font-black text-stone-800">
              قيمة السحب <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <NumericInput
                id="withdrawal-amount"
                value={amount}
                onChange={setAmount}
                type="decimal"
                placeholder="0.00"
                disabled={submitting}
                required
                className="!rounded-2xl !border-stone-200 !bg-white !py-4 !pl-16 !text-xl !font-black !text-stone-950 focus:!ring-amber-400"
              />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-400">
                ر.س
              </span>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="withdrawal-reason" className="text-sm font-black text-stone-800">
                سبب السحب <span className="text-rose-600">*</span>
              </label>
              <span className="text-xs text-stone-400">{reason.length}/500</span>
            </div>
            <textarea
              id="withdrawal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              disabled={submitting}
              required
              rows={3}
              placeholder="مثال: تسليم عهدة نقدية للإدارة"
              className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
            <CalendarClock className="h-5 w-5 shrink-0 text-stone-500" />
            <p>
              سيُسجّل التاريخ والوقت تلقائيًا، ثم يُرسل أمر فتح الدرج بعد نجاح الحفظ.
            </p>
          </div>

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || balance <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-4 text-base font-black text-stone-950 shadow-lg shadow-amber-300/25 transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                جارٍ تسجيل السحب...
              </>
            ) : (
              <>
                <HandCoins className="h-5 w-5" />
                تسجيل السحب وفتح الدرج
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

function CashBoxContent() {
  const { user } = useAuthStore()
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<CashBoxTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all')
  const [drawerRetry, setDrawerRetry] = useState<CashDrawerWithdrawalVoucher | null>(null)
  const [retryingDrawer, setRetryingDrawer] = useState(false)

  const loadCashBox = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setLoadError('')

    try {
      const [nextBalance, nextTransactions] = await Promise.all([
        getCashBoxBalance('tailoring'),
        getCashBoxTransactions('tailoring', 150),
      ])
      setBalance(nextBalance)
      setTransactions(nextTransactions)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadCashBox()
  }, [loadCashBox])

  const filteredTransactions = useMemo(() => {
    if (movementFilter === 'in') return transactions.filter((item) => item.amount > 0)
    if (movementFilter === 'out') return transactions.filter((item) => item.amount < 0)
    return transactions
  }, [movementFilter, transactions])

  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
  const todayTotals = useMemo(() => {
    let incoming = 0
    let outgoing = 0
    let count = 0

    for (const transaction of transactions) {
      const date = new Date(transaction.occurred_at)
      if (Number.isNaN(date.getTime())) continue
      const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })
      if (key !== todayKey) continue
      count += 1
      if (transaction.amount > 0) incoming += transaction.amount
      else outgoing += Math.abs(transaction.amount)
    }

    return { incoming, outgoing, count }
  }, [todayKey, transactions])

  const handleWithdrawal = async (amount: number, reason: string) => {
    setSubmitting(true)

    try {
      const result = await withdrawFromCashBox({
        branch: 'tailoring',
        amount,
        reason,
      })

      const voucher: CashDrawerWithdrawalVoucher = {
        withdrawalId: result.withdrawal.id,
        amount: result.withdrawal.amount,
        reason: result.withdrawal.reason,
        withdrawnAt: result.withdrawal.created_at,
        withdrawnBy: result.withdrawal.created_by_name || user?.full_name || 'مستخدم النظام',
      }

      setBalance(result.newBalance)
      setTransactions((current) => [
        {
          transaction_id: `withdrawal:${result.withdrawal.id}`,
          transaction_type: 'withdrawal',
          amount: -result.withdrawal.amount,
          occurred_at: result.withdrawal.created_at,
          title: 'سحب من الصندوق',
          description: result.withdrawal.reason,
          actor_name: result.withdrawal.created_by_name,
          reference_id: result.withdrawal.id,
        },
        ...current,
      ])
      setShowWithdrawalModal(false)
      setDrawerRetry(null)
      toast.success(
        `تم تسجيل سحب ${formatCurrency(result.withdrawal.amount)} بنجاح`,
        { icon: '✅' }
      )

      try {
        await dispatchCashDrawerOpen(voucher)
        toast.success('تمت إضافة أمر فتح الدرج إلى محطة طباعة التفصيل', { icon: '🗄️' })
      } catch (drawerError) {
        setDrawerRetry(voucher)
        toast.error(
          `تم حفظ السحب، لكن تعذّر فتح الدرج: ${getErrorMessage(drawerError)}`,
          { duration: 8000 }
        )
      }

      void loadCashBox(true)
    } finally {
      setSubmitting(false)
    }
  }

  const retryDrawerOpen = async () => {
    if (!drawerRetry || retryingDrawer) return
    setRetryingDrawer(true)
    try {
      await dispatchCashDrawerOpen(drawerRetry)
      setDrawerRetry(null)
      toast.success('تمت إعادة إرسال أمر فتح الدرج إلى محطة طباعة التفصيل')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setRetryingDrawer(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f0e8] text-stone-950" dir="rtl">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            'linear-gradient(#1c1917 1px, transparent 1px), linear-gradient(90deg, #1c1917 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/accounting/tailoring"
              aria-label="العودة إلى محاسبة قسم التفصيل"
              className="rounded-xl border border-stone-300 bg-white/80 p-2.5 text-stone-700 shadow-sm transition hover:-translate-x-0.5 hover:bg-white"
            >
              <ArrowLeft className="h-5 w-5 rotate-180" />
            </Link>
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-amber-700">
                محاسبة قسم التفصيل
              </p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">الصندوق</h1>
            </div>
          </div>
          <DirectPrinterSetup />
        </header>

        <section className="relative mb-5 overflow-hidden rounded-[2rem] bg-stone-950 p-6 text-white shadow-2xl shadow-stone-900/15 sm:p-8">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-28 w-1/2 bg-[linear-gradient(135deg,transparent_45%,rgba(251,191,36,0.08)_45%)]" />
          <div className="relative grid gap-7 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300">
                  <WalletCards className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-400">الكاش المتاح في الدرج</p>
                  <p className="text-xs text-stone-500">يتحدث تلقائيًا مع دفعات الطلبات</p>
                </div>
              </div>

              {loading ? (
                <div className="h-14 w-56 animate-pulse rounded-2xl bg-white/10" />
              ) : (
                <p className="text-4xl font-black tracking-tight text-amber-300 sm:text-6xl" dir="ltr">
                  {formatCurrency(balance)}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowWithdrawalModal(true)}
              disabled={loading || balance <= 0}
              className="group flex w-full items-center justify-between rounded-2xl bg-amber-400 px-5 py-4 text-right text-stone-950 shadow-xl shadow-amber-500/10 transition hover:-translate-y-0.5 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                <span className="block text-base font-black">إجراء عملية سحب</span>
                <span className="mt-0.5 block text-xs font-bold text-stone-700">
                  تسجيل الحركة ثم فتح الدرج
                </span>
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-950 text-amber-300 transition group-hover:rotate-3">
                <HandCoins className="h-6 w-6" />
              </span>
            </button>
          </div>
        </section>

        <AnimatePresence>
          {drawerRetry ? (
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <Printer className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-black text-amber-950">السحب محفوظ، والدرج لم يُفتح</p>
                  <p className="text-sm text-amber-800">
                    تحقق من اتصال الطابعة ثم أعد إرسال أمر الفتح؛ لن تُسجّل عملية سحب جديدة.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void retryDrawerOpen()}
                disabled={retryingDrawer}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {retryingDrawer ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                إعادة فتح الدرج
              </button>
            </motion.section>
          ) : null}
        </AnimatePresence>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              label: 'وارد اليوم',
              value: todayTotals.incoming,
              icon: ArrowDownLeft,
              className: 'text-emerald-700 bg-emerald-50 border-emerald-100',
            },
            {
              label: 'صادر اليوم',
              value: todayTotals.outgoing,
              icon: ArrowUpRight,
              className: 'text-rose-700 bg-rose-50 border-rose-100',
            },
            {
              label: 'حركات اليوم',
              value: todayTotals.count,
              icon: History,
              className: 'text-stone-700 bg-white/80 border-stone-200',
              count: true,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-4 rounded-2xl border p-4 shadow-sm ${item.className}`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 shadow-sm">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold opacity-70">{item.label}</p>
                <p className="mt-0.5 text-lg font-black" dir={item.count ? 'rtl' : 'ltr'}>
                  {item.count ? item.value : formatCurrency(item.value)}
                </p>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-[#fffdf8] shadow-xl shadow-stone-900/5">
          <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black">
                <History className="h-5 w-5 text-amber-700" />
                سجل العمليات
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                آخر الحركات الداخلة والخارجة من درج النقد
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-stone-200 bg-stone-100 p-1">
                {([
                  ['all', 'الكل'],
                  ['in', 'الوارد'],
                  ['out', 'الصادر'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMovementFilter(value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                      movementFilter === value
                        ? 'bg-white text-stone-950 shadow-sm'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void loadCashBox(true)}
                disabled={refreshing}
                aria-label="تحديث سجل الصندوق"
                className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadError ? (
            <div className="m-5 flex flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-rose-600" />
              <p className="font-black text-rose-800">تعذّر تحميل بيانات الصندوق</p>
              <p className="mt-1 text-sm text-rose-700">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadCashBox()}
                className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-black text-white"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-3 p-5 sm:p-6">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl bg-stone-100" />
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
                <History className="h-8 w-8" />
              </div>
              <p className="text-lg font-black text-stone-800">لا توجد حركات لعرضها</p>
              <p className="mt-1 max-w-sm text-sm text-stone-500">
                ستظهر هنا دفعات الكاش من الطلبات وعمليات السحب فور تسجيلها.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredTransactions.map((transaction, index) => {
                const appearance = transactionAppearance[transaction.transaction_type]
                const Icon = appearance?.icon || Banknote
                const isIncoming = transaction.amount > 0

                return (
                  <motion.article
                    key={transaction.transaction_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.25) }}
                    className="grid gap-3 px-5 py-4 transition hover:bg-stone-50/70 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-6"
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${
                        appearance?.containerClass || 'bg-stone-100 ring-stone-200'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${appearance?.iconClass || 'text-stone-600'}`} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-stone-900">{transaction.title}</h3>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-500">
                          {appearance?.badge || 'حركة'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-stone-600">
                        {transaction.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-400">
                        <span>{formatDateTime(transaction.occurred_at)}</span>
                        {transaction.actor_name ? <span>بواسطة: {transaction.actor_name}</span> : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:block sm:text-left">
                      <span className="text-xs font-bold text-stone-400 sm:hidden">
                        {isIncoming ? 'داخل الصندوق' : 'خارج الصندوق'}
                      </span>
                      <p
                        className={`text-lg font-black ${
                          isIncoming ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                        dir="ltr"
                      >
                        {isIncoming ? '+' : '−'} {formatCurrency(Math.abs(transaction.amount))}
                      </p>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          )}
        </section>

        <footer className="mt-5 flex items-start gap-3 rounded-2xl border border-stone-200 bg-white/60 px-4 py-3 text-xs leading-5 text-stone-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p>
            الرصيد محمي من السحب الزائد، وكل عملية محفوظة بالسبب والمستخدم والتاريخ ولا تُفتح
            لها نافذة تعديل أو حذف.
          </p>
        </footer>
      </div>

      <AnimatePresence>
        {showWithdrawalModal ? (
          <WithdrawalModal
            balance={balance}
            submitting={submitting}
            onClose={() => setShowWithdrawalModal(false)}
            onSubmit={handleWithdrawal}
          />
        ) : null}
      </AnimatePresence>
    </main>
  )
}

export default function TailoringCashBoxPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const { workerType, isLoading: permissionsLoading } = useWorkerPermissions()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
      return
    }

    if (!isLoading && !permissionsLoading && user) {
      const isAdmin = user.role === 'admin'
      const isAccountant = user.role === 'worker' && workerType === 'accountant'
      if (!isAdmin && !isAccountant) router.push('/dashboard')
    }
  }, [isLoading, permissionsLoading, router, user, workerType])

  if (isLoading || permissionsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f0e8]" dir="rtl">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-amber-700" />
          <p className="font-bold text-stone-600">جارٍ تجهيز الصندوق...</p>
        </div>
      </div>
    )
  }

  const authorized =
    user?.role === 'admin' ||
    (user?.role === 'worker' && workerType === 'accountant')

  if (!authorized) return null
  return <CashBoxContent />
}
