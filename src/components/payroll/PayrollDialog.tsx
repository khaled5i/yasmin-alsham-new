'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export const payrollInput =
  'mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:bg-stone-100'
export const payrollButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50'
export const payrollPrimary = `${payrollButton} bg-teal-800 text-white hover:bg-teal-900`
export const payrollSecondary = `${payrollButton} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`

export default function PayrollDialog({
  title,
  children,
  onClose,
  arabic,
  full = false
}: {
  title: string
  children: ReactNode
  onClose: () => void
  arabic: boolean
  full?: boolean
}) {
  return (
    <Dialog open onClose={onClose} className="relative z-[70]" dir={arabic ? 'rtl' : 'ltr'}>
      <div className="fixed inset-0 bg-stone-950/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={`fixed inset-0 overflow-y-auto ${full ? 'sm:p-6' : 'flex items-end justify-center sm:items-center sm:p-6'}`}
      >
        <DialogPanel
          className={`relative mx-auto w-full bg-white shadow-xl ${full ? 'min-h-dvh max-w-3xl sm:min-h-0 sm:rounded-2xl' : 'max-h-[94dvh] max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl'}`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-100 bg-white px-4 py-3 sm:px-6">
            <DialogTitle className="text-lg font-bold text-stone-900">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label={arabic ? 'إغلاق' : 'Close'}
              className={`${payrollButton} shrink-0 px-3 text-stone-500`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
