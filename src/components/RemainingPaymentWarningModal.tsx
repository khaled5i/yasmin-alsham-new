'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, CheckCircle, XCircle, Ban } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface RemainingPaymentWarningModalProps {
  isOpen: boolean
  remainingAmount: number
  onMarkAsPaid: () => void
  onIgnore: () => void
  onCancel: () => void
}

export default function RemainingPaymentWarningModal({
  isOpen,
  remainingAmount,
  onMarkAsPaid,
  onIgnore,
  onCancel
}: RemainingPaymentWarningModalProps) {
  const { t } = useTranslation()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header with Warning Color */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
                    <AlertTriangle className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {t('payment_warning') || 'تنبيه دفعة متبقية'}
                  </h3>
                </div>
                <button
                  onClick={onCancel}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Warning Message */}
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <div className="flex items-start space-x-3 space-x-reverse">
                  <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-amber-900 font-semibold text-base mb-2">
                      {t('remaining_payment_warning_message') || 'يوجد دفعة متبقية غير مدفوعة'}
                    </p>
                    <div className="bg-white rounded-lg p-3 border border-amber-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          {t('remaining_amount') || 'الدفعة المتبقية'}:
                        </span>
                        <span className="text-2xl font-bold text-orange-600">
                          {remainingAmount.toFixed(2)} {t('sar') || 'ريال'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Question */}
              <div className="text-center">
                <p className="text-gray-700 font-medium text-base">
                  {t('payment_warning_question') || 'هل تريد تحديث حالة الدفع قبل تسليم الطلب؟'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {/* Mark as Paid Button */}
                <button
                  onClick={onMarkAsPaid}
                  className="w-full flex items-center justify-center space-x-2 space-x-reverse bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>{t('mark_as_paid') || 'تم الدفع - تحديث المبلغ'}</span>
                </button>

                {/* Ignore Button */}
                <button
                  onClick={onIgnore}
                  className="w-full flex items-center justify-center space-x-2 space-x-reverse bg-gray-500 hover:bg-gray-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-[1.02]"
                >
                  <Ban className="w-5 h-5" />
                  <span>{t('ignore_and_deliver') || 'تجاهل وتسليم الطلب'}</span>
                </button>

                {/* Cancel Button */}
                <button
                  onClick={onCancel}
                  className="w-full flex items-center justify-center space-x-2 space-x-reverse bg-red-500 hover:bg-red-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-[1.02]"
                >
                  <XCircle className="w-5 h-5" />
                  <span>{t('cancel') || 'إلغاء'}</span>
                </button>
              </div>

              {/* Info Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 text-center">
                  <span className="font-semibold">{t('note') || 'ملاحظة'}:</span>{' '}
                  {t('payment_warning_note') || 'عند اختيار "تم الدفع"، سيتم تحديث المبلغ المدفوع ليساوي السعر الكلي وتغيير حالة الدفع إلى "مدفوع"'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

