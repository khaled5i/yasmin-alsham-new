'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, Trash2, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { useAuthStore } from '@/store/authStore'

interface DeleteOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  orderInfo: {
    id: string
    clientName: string
    description: string
  }
}

export default function DeleteOrderModal({ isOpen, onClose, onConfirm, orderInfo }: DeleteOrderModalProps) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // التحقق من صحة البيانات
    if (!email || !password) {
      setError(t('please_fill_all_fields'))
      setIsLoading(false)
      return
    }

    // التحقق من أن البريد الإلكتروني يطابق بريد المدير المسجل
    if (email !== user?.email) {
      setError(t('email_does_not_match'))
      setIsLoading(false)
      return
    }

    // محاكاة التحقق من كلمة المرور (في التطبيق الحقيقي، يجب التحقق من الخادم)
    // هنا نفترض أن كلمة المرور الصحيحة هي "admin123" للمحاكاة
    if (password !== 'admin123') {
      setError(t('incorrect_password'))
      setIsLoading(false)
      return
    }

    // محاكاة تأخير الشبكة
    await new Promise(resolve => setTimeout(resolve, 1000))

    setIsLoading(false)
    onConfirm()
    handleClose()
  }

  const handleClose = () => {
    setEmail('')
    setPassword('')
    setError('')
    setShowPassword(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* خلفية مظلمة */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* المودال */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          >
            {/* الهيدر */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3 space-x-reverse">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">
                  {t('confirm_delete_order')}
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* المحتوى */}
            <div className="p-6">
              {/* تحذير */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3 space-x-reverse">
                  <Trash2 className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-red-800 mb-2">
                      {t('warning_delete_order')}
                    </h3>
                    <p className="text-sm text-red-700">
                      {t('delete_order_warning_message')}
                    </p>
                  </div>
                </div>
              </div>

              {/* معلومات الطلب */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-gray-800 mb-2">{t('order_details')}</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <p><span className="font-medium">{t('order_id')}:</span> #{orderInfo.id}</p>
                  <p><span className="font-medium">{t('client_name')}:</span> {orderInfo.clientName}</p>
                  <p><span className="font-medium">{t('description')}:</span> {orderInfo.description}</p>
                </div>
              </div>

              {/* نموذج التحقق */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('admin_email')}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder={t('enter_admin_email')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('admin_password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      placeholder={t('enter_admin_password')}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* الأزرار */}
                <div className="flex space-x-3 space-x-reverse pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 space-x-reverse"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>{t('confirm_delete')}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
