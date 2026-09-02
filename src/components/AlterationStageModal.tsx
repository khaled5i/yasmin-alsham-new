'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { CalendarCheck2, Check, PackageCheck, Sparkles, X } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import type { Order } from '@/lib/services/order-service'
import type { AlterationType } from '@/lib/services/alteration-service'

interface AlterationStageModalProps {
  isOpen: boolean
  order: Order
  onClose: () => void
  onSelect: (type: AlterationType) => void
}

export function getAvailableAlterationTypes(order: Order): AlterationType[] {
  const types: AlterationType[] = []
  if (Boolean(order.proof_delivery_date)) types.push('first_proof')
  if (order.has_second_proof === true) types.push('second_proof')
  types.push('after_delivery')
  return types
}

export default function AlterationStageModal({
  isOpen,
  order,
  onClose,
  onSelect,
}: AlterationStageModalProps) {
  const { isArabic } = useTranslation()

  const options = [
    {
      value: 'first_proof' as const,
      title: isArabic ? 'تعديل البروفة الأولى' : 'First proof alteration',
      description: isArabic ? 'ملاحظات التعديل الناتجة عن البروفة الأولى.' : 'Changes requested during the first proof.',
      icon: CalendarCheck2,
      className: 'border-rose-200 bg-rose-50/70 text-rose-700 hover:border-rose-400 hover:bg-rose-100/80',
    },
    {
      value: 'second_proof' as const,
      title: isArabic ? 'تعديل البروفة الثانية' : 'Second proof alteration',
      description: isArabic ? 'ملاحظات التعديل الناتجة عن البروفة الثانية.' : 'Changes requested during the second proof.',
      icon: Sparkles,
      className: 'border-amber-200 bg-amber-50/80 text-amber-800 hover:border-amber-400 hover:bg-amber-100/80',
    },
    {
      value: 'after_delivery' as const,
      title: isArabic ? 'تعديل بعد التسليم' : 'Post-delivery alteration',
      description: isArabic ? 'تعديل مسجل بعد تسليم الطلب للزبونة.' : 'An alteration recorded after the order was delivered.',
      icon: PackageCheck,
      className: 'border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100/80',
    },
  ].filter(option => getAvailableAlterationTypes(order).includes(option.value))

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[70]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-3 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 translate-y-3 scale-95"
            >
              <Dialog.Panel
                className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/70 bg-[#fffdfa] shadow-2xl"
                dir={isArabic ? 'rtl' : 'ltr'}
              >
                <div className="relative overflow-hidden border-b border-rose-100 bg-gradient-to-br from-rose-50 via-white to-amber-50 px-6 py-5">
                  <div className="absolute -top-12 left-8 h-28 w-28 rounded-full bg-amber-200/30 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div>
                      <Dialog.Title className="text-xl font-black text-slate-900">
                        {isArabic ? 'اختيار نوع التعديل' : 'Choose alteration type'}
                      </Dialog.Title>
                      <p className="mt-1 text-sm text-slate-600">
                        {order.client_name} · {order.order_number}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-slate-700"
                      aria-label={isArabic ? 'إغلاق' : 'Close'}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-5 sm:p-6">
                  {options.map(({ value, title, description, icon: Icon, className }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onSelect(value)}
                      className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all ${className}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold">{title}</span>
                        <span className="mt-0.5 block text-xs leading-5 opacity-80">{description}</span>
                      </span>
                      <Check className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
