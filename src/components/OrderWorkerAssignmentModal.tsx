'use client'

import { useRef, useState } from 'react'
import { Dialog } from '@headlessui/react'
import { CheckCircle, Loader2, Scissors, Trash2, UserCheck, X } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { formatGregorianDateTime } from '@/lib/date-utils'
import type { Order } from '@/lib/services/order-service'

interface AssignmentWorker {
  id: string
  worker_type?: string
  is_available?: boolean
  full_name?: string
  user?: { full_name?: string; is_active?: boolean } | null
}

interface Props {
  order: Order
  workers: AssignmentWorker[]
  onClose: () => void
  onAssign: (kind: 'cutter' | 'tailor', workerId: string) => Promise<void>
}

export default function OrderWorkerAssignmentModal({ order, workers, onClose, onAssign }: Props) {
  const { t, isArabic } = useTranslation()
  const [saving, setSaving] = useState<'cutter' | 'tailor' | null>(null)
  const [pendingWorkerId, setPendingWorkerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const busy = useRef(false)
  const name = (worker: AssignmentWorker) => worker.user?.full_name || worker.full_name || worker.id
  const cutters = workers.filter(worker => worker.worker_type === 'workshop_manager' && worker.is_available && worker.user?.is_active !== false)
  const tailors = workers.filter(worker => worker.worker_type === 'tailor' && worker.is_available && worker.user?.is_active !== false)

  const close = () => {
    if (!busy.current) onClose()
  }

  const assign = async (kind: 'cutter' | 'tailor', workerId: string) => {
    if (busy.current || (kind === 'tailor' && !order.cutter_id)) return
    busy.current = true
    setPendingWorkerId(workerId)
    setSaving(kind)
    setError(null)
    try {
      await onAssign(kind, workerId)
      setConfirmRemoval(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isArabic ? 'تعذّر حفظ الاختيار، حاول مجدداً' : 'Unable to save. Please try again.'))
    } finally {
      busy.current = false
      setSaving(null)
    }
  }

  return (
    <Dialog open onClose={close} className="relative z-[1000]" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <Dialog.Panel className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 font-bold text-gray-800">
              <UserCheck className="h-5 w-5 text-pink-600" />
              {isArabic ? 'اختيار العمال' : 'Assign workers'}
            </Dialog.Title>
            <button type="button" onClick={close} disabled={!!saving} aria-label={t('close')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <Dialog.Description className="text-sm leading-relaxed text-gray-500">
              {isArabic ? 'يُحفظ كل اختيار مباشرة. يمكنك اختيار القصّاص فقط وإغلاق النافذة، ثم تعيين الخياط لاحقاً.' : 'Each choice is saved immediately. You can select only the cutter, close this window, and assign the tailor later.'}
            </Dialog.Description>

            <div>
              <label htmlFor="order-assignment-cutter" className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 text-xs text-teal-700">1</span>
                <Scissors className="h-4 w-4 text-teal-600" />{t('cutter')}
                {saving === 'cutter' && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
              </label>
              <select id="order-assignment-cutter" value={saving === 'cutter' ? pendingWorkerId : order.cutter_id || ''} disabled={!!saving} onChange={event => void assign('cutter', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:opacity-60">
                <option value="" disabled>{t('select_cutter')}</option>
                {order.cutter_id && !cutters.some(worker => worker.id === order.cutter_id) && <option value={order.cutter_id} disabled>{order.cutter_name || t('not_specified')}</option>}
                {cutters.map(worker => <option key={worker.id} value={worker.id}>{name(worker)}</option>)}
              </select>
              {cutters.length === 0 && <p className="mt-2 text-xs text-amber-700">{t('no_cutters')}</p>}
              {order.cut_at && <p className="mt-2 flex items-start gap-1.5 text-xs text-teal-700"><CheckCircle className="h-3.5 w-3.5 shrink-0" /><span>{t('cut_date')}: {formatGregorianDateTime(order.cut_at, isArabic ? 'ar-SA-u-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh' })}</span></p>}
              {order.cutter_id && (
                <button
                  type="button"
                  disabled={!!saving}
                  onClick={() => order.worker_id ? setConfirmRemoval(true) : void assign('cutter', '')}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isArabic ? 'إزالة القصّاص' : 'Remove cutter'}
                </button>
              )}
              {confirmRemoval && order.cutter_id && order.worker_id && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs leading-relaxed text-amber-900">
                    {isArabic
                      ? 'إزالة القصّاص تتطلب إلغاء تعيين الخياط أيضًا. يمكنك تغيير اسم القصّاص مباشرة من القائمة إذا أردت الاحتفاظ بالخياط.'
                      : 'Removing the cutter also requires unassigning the tailor. To keep the tailor, select a different cutter directly from the list.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={!!saving} onClick={() => void assign('cutter', '')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                      {isArabic ? 'إزالة التعيينين' : 'Remove both assignments'}
                    </button>
                    <button type="button" disabled={!!saving} onClick={() => setConfirmRemoval(false)} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 disabled:opacity-50">
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="order-assignment-tailor" className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-50 text-xs text-pink-700">2</span>
                <UserCheck className="h-4 w-4 text-pink-600" />{isArabic ? 'العامل الخياط' : 'Tailor'}
                {saving === 'tailor' && <Loader2 className="h-4 w-4 animate-spin text-pink-600" />}
              </label>
              <select id="order-assignment-tailor" value={saving === 'tailor' ? pendingWorkerId : order.worker_id || ''} disabled={!!saving || !order.cutter_id} onChange={event => void assign('tailor', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">{t('select_worker')}</option>
                {order.worker_id && !tailors.some(worker => worker.id === order.worker_id) && <option value={order.worker_id} disabled>{workers.find(worker => worker.id === order.worker_id)?.user?.full_name || t('not_specified')}</option>}
                {tailors.map(worker => <option key={worker.id} value={worker.id}>{name(worker)}</option>)}
              </select>
              {!order.cutter_id && <p className="mt-2 text-xs text-gray-500">{t('select_cutter_first')}</p>}
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>

          <div className="border-t border-gray-100 px-5 py-4">
            <button type="button" onClick={close} disabled={!!saving} className="w-full rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pink-700 disabled:opacity-50">
              {saving ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : t('close')}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  )
}
