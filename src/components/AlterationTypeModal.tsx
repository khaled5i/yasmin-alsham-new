'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { X, Package, PackagePlus } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface AlterationTypeModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectType: (type: 'existing' | 'new') => void
}

export default function AlterationTypeModal({
  isOpen,
  onClose,
  onSelectType
}: AlterationTypeModalProps) {
  const { t, isArabic } = useTranslation()

  const handleSelectType = (type: 'existing' | 'new') => {
    onSelectType(type)
    onClose()
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold text-gray-900"
                  >
                    {isArabic ? 'اختر نوع طلب التعديل' : 'Select Alteration Type'}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  {/* فستان داخلي (موجود في النظام) */}
                  <button
                    onClick={() => handleSelectType('existing')}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-pink-500 hover:bg-pink-50 transition-all group"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center group-hover:bg-pink-200 transition-colors">
                      <Package className="w-6 h-6 text-pink-600" />
                    </div>
                    <div className={`flex-1 ${isArabic ? 'text-right' : 'text-left'}`}>
                      <h4 className="font-semibold text-gray-900">
                        {isArabic ? 'فستان داخلي' : 'Existing Dress'}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {isArabic
                          ? 'فستان موجود في النظام'
                          : 'Dress already in the system'}
                      </p>
                    </div>
                  </button>

                  {/* فستان خارجي (جديد) */}
                  <button
                    onClick={() => handleSelectType('new')}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all group"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                      <PackagePlus className="w-6 h-6 text-green-600" />
                    </div>
                    <div className={`flex-1 ${isArabic ? 'text-right' : 'text-left'}`}>
                      <h4 className="font-semibold text-gray-900">
                        {isArabic ? 'فستان خارجي' : 'New Dress'}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {isArabic
                          ? 'فستان غير موجود في النظام'
                          : 'Dress not in the system'}
                      </p>
                    </div>
                  </button>
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <button
                    onClick={onClose}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {isArabic ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

