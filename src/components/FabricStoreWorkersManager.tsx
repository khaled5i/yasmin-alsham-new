'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Edit, X, CheckCircle, XCircle, Mail, Phone, Briefcase, Calendar } from 'lucide-react'
import { useWorkerStore } from '@/store/workerStore'
import type { WorkerWithUser } from '@/lib/services/worker-service'

interface EditWorkerData {
  id: string
  full_name: string
  email: string
  phone: string
  is_active: boolean
}

export default function FabricStoreWorkersManager() {
  const { workers, isLoading, loadWorkers, updateWorker } = useWorkerStore()
  const [fabricStoreWorkers, setFabricStoreWorkers] = useState<WorkerWithUser[]>([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWorker, setEditingWorker] = useState<EditWorkerData | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // تحميل العمال عند تحميل المكون
  useEffect(() => {
    loadWorkers()
  }, [loadWorkers])

  // فلترة موظفي متجر الأقمشة فقط
  useEffect(() => {
    const fabricWorkers = workers.filter(w => w.worker_type === 'fabric_store_manager')
    setFabricStoreWorkers(fabricWorkers)
  }, [workers])

  // إخفاء الرسالة بعد 5 ثوانٍ
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const handleEditWorker = (worker: WorkerWithUser) => {
    setEditingWorker({
      id: worker.id,
      full_name: worker.user?.full_name || '',
      email: worker.user?.email || '',
      phone: worker.user?.phone || '',
      is_active: worker.user?.is_active ?? true
    })
    setShowEditModal(true)
  }

  const handleUpdateWorker = async () => {
    if (!editingWorker) return

    setIsSubmitting(true)
    setMessage(null)

    try {
      const updates = {
        full_name: editingWorker.full_name,
        phone: editingWorker.phone,
        is_active: editingWorker.is_active
      }

      const result = await updateWorker(editingWorker.id, updates)

      if (result.success) {
        setMessage({ type: 'success', text: 'تم تحديث بيانات الموظف بنجاح' })
        setShowEditModal(false)
        setEditingWorker(null)
        loadWorkers() // إعادة تحميل القائمة
      } else {
        setMessage({ type: 'error', text: result.error || 'خطأ في تحديث الموظف' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'خطأ في تحديث الموظف' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-pink-500 mx-auto mb-4"></div>
        <p className="text-gray-600">جاري تحميل الموظفين...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* رسائل الحالة */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`px-6 py-4 rounded-lg border ${message.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
              }`}
          >
            <p className="font-medium">
              {message.type === 'success' ? '✅' : '⚠️'} {message.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة الموظفين */}
      {fabricStoreWorkers.length === 0 ? (
        <div className="text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-600 mb-2">لا يوجد موظفون</h3>
          <p className="text-gray-500">لم يتم العثور على موظفين في متجر الأقمشة</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {fabricStoreWorkers.map((worker, index) => (
            <motion.div
              key={worker.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`bg-white/80 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 hover:shadow-lg ${worker.user?.is_active ? 'border-pink-100' : 'border-gray-200 opacity-75'
                }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-4 space-x-reverse">
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{worker.user?.full_name || 'غير محدد'}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Briefcase className="w-3 h-3 text-purple-500" />
                      <span className="text-xs text-purple-600 font-medium">مدير متجر الأقمشة</span>
                    </div>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${worker.user?.is_active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                  {worker.user?.is_active ? 'نشط' : 'غير نشط'}
                </div>
              </div>

              {/* معلومات الاتصال */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-pink-500" />
                  <span className="break-all">{worker.user?.email || 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-pink-500" />
                  <span>{worker.user?.phone || 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-pink-500" />
                  <span>انضم في: {formatDate(worker.created_at)}</span>
                </div>
              </div>

              {/* زر التعديل */}
              <button
                onClick={() => handleEditWorker(worker)}
                className="w-full btn-secondary py-2 text-sm inline-flex items-center justify-center space-x-1 space-x-reverse"
              >
                <Edit className="w-4 h-4" />
                <span>تعديل البيانات</span>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* نافذة التعديل */}
      <AnimatePresence>
        {showEditModal && editingWorker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !isSubmitting && setShowEditModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-800">تعديل بيانات الموظف</h3>
                <button
                  onClick={() => !isSubmitting && setShowEditModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  disabled={isSubmitting}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="space-y-4">
                {/* الاسم الكامل */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    الاسم الكامل
                  </label>
                  <input
                    type="text"
                    value={editingWorker.full_name}
                    onChange={(e) => setEditingWorker({ ...editingWorker, full_name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    disabled={isSubmitting}
                  />
                </div>

                {/* البريد الإلكتروني (للقراءة فقط) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    value={editingWorker.email}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">لا يمكن تعديل البريد الإلكتروني</p>
                </div>

                {/* رقم الهاتف */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={editingWorker.phone}
                    onChange={(e) => setEditingWorker({ ...editingWorker, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    disabled={isSubmitting}
                  />
                </div>

                {/* الحالة */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    حالة الحساب
                  </label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setEditingWorker({ ...editingWorker, is_active: true })}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${editingWorker.is_active
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-600'
                        }`}
                      disabled={isSubmitting}
                    >
                      <CheckCircle className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-sm font-medium">نشط</span>
                    </button>
                    <button
                      onClick={() => setEditingWorker({ ...editingWorker, is_active: false })}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${!editingWorker.is_active
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-300 bg-white text-gray-600'
                        }`}
                      disabled={isSubmitting}
                    >
                      <XCircle className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-sm font-medium">غير نشط</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* أزرار الإجراءات */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isSubmitting}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleUpdateWorker}
                  className="flex-1 btn-primary py-3"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      جاري الحفظ...
                    </span>
                  ) : (
                    'حفظ التعديلات'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


