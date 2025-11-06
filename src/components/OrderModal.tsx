'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  User,
  Phone,
  Calendar,
  Package,
  Ruler,
  DollarSign,
  MessageSquare,
  UserCheck,
  Clock,
  CheckCircle,
  Image as ImageIcon
} from 'lucide-react'
import { Order } from '@/lib/services/order-service'
import { Worker } from '@/lib/services/worker-service'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/hooks/useTranslation'
import VoiceNotes from './VoiceNotes'

interface OrderModalProps {
  order: Order | null
  workers: Worker[]
  isOpen: boolean
  onClose: () => void
}

export default function OrderModal({ order, workers, isOpen, onClose }: OrderModalProps) {
  const { user } = useAuthStore()
  const { t, isArabic } = useTranslation()

  if (!order) return null

  const getWorkerName = (workerId?: string | null) => {
    if (!workerId) return t('not_specified')
    const worker = workers.find(w => w.id === workerId)
    return worker ? (worker.user?.full_name || worker.id) : t('not_specified')
  }

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pending: {
        label: t('pending'),
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100'
      },
      in_progress: {
        label: t('in_progress'),
        color: 'text-blue-600',
        bgColor: 'bg-blue-100'
      },
      completed: {
        label: t('completed'),
        color: 'text-green-600',
        bgColor: 'bg-green-100'
      },
      delivered: {
        label: t('delivered'),
        color: 'text-purple-600',
        bgColor: 'bg-purple-100'
      },
      cancelled: {
        label: t('cancelled'),
        color: 'text-red-600',
        bgColor: 'bg-red-100'
      }
    }
    return statusMap[status as keyof typeof statusMap] || statusMap.pending
  }

  // حساب موعد التسليم المعروض (قبل يومين من الموعد الحقيقي)
  const getDisplayDeliveryDate = (actualDate: string) => {
    const date = new Date(actualDate)
    date.setDate(date.getDate() - 2)
    return date.toISOString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
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
            onClick={onClose}
          />
          
          {/* النافذة المنبثقة */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* رأس النافذة */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800">
                  {t('order_details')}
                </h2>
                <div className="flex items-center space-x-3 space-x-reverse">
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-300"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* محتوى النافذة */}
            <div className="p-6 space-y-8">
              {/* معلومات أساسية */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <User className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('customer_information')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Customer Information)</span>}
                    </span>
                  </h3>

                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center space-x-3 space-x-reverse">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="font-medium">
                        {t('name')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Name)</span>}
                      </span>
                      <span>{order.client_name}</span>
                    </div>
                    {/* تم حذف عرض رقم الهاتف للعامل */}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Package className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('order_details')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Order Details)</span>}
                    </span>
                  </h3>

                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <span className="font-medium">
                        {t('description')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Description)</span>}
                      </span>
                      <p className="mt-1">{order.description}</p>
                    </div>
                    {order.fabric && (
                      <div>
                        <span className="font-medium">
                          {t('fabric_type')}
                          {isArabic && <span className="text-sm text-gray-500 mr-2">(Fabric Type)</span>}
                        </span>
                        <p className="mt-1">{order.fabric}</p>
                      </div>
                    )}
                    {/* تم حذف عرض السعر للعامل */}
                  </div>
                </div>
              </div>

              {/* الحالة والتواريخ */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="font-bold text-gray-800">
                    {t('status')}
                    {isArabic && <span className="text-sm text-gray-500 mr-2">(Status)</span>}
                  </h4>
                  <span className={`px-3 py-2 rounded-full text-sm font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color}`}>
                    {getStatusInfo(order.status).label}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {t('order_date')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Order Date)</span>}
                    </span>
                  </h4>
                  <p>{formatDate(order.created_at)}</p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Clock className="w-4 h-4" />
                    <span>
                      {t('delivery_date')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Delivery Date)</span>}
                    </span>
                  </h4>
                  <p>{formatDate(getDisplayDeliveryDate(order.due_date))}</p>
                </div>
              </div>

              {/* العامل المسؤول */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <UserCheck className="w-5 h-5 text-pink-600" />
                  <span>
                    {t('assigned_worker')}
                    {isArabic && <span className="text-sm text-gray-500 mr-2">(Assigned Worker)</span>}
                  </span>
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-lg">{getWorkerName(order.worker_id)}</p>
                </div>
              </div>

              {/* المقاسات */}
              {Object.values(order.measurements).some(val => val !== undefined) && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Ruler className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('measurements_cm')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Measurements)</span>}
                    </span>
                  </h3>

                  {/* المقاسات الأساسية */}
                  {(order.measurements.shoulder || order.measurements.shoulderCircumference || order.measurements.chest || order.measurements.waist || order.measurements.hips) && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-700 border-b border-pink-200 pb-1">
                        {t('basic_measurements')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Basic Measurements)</span>}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.shoulder && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('shoulder')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Shoulder)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.shoulder}</p>
                          </div>
                        )}
                        {order.measurements.shoulderCircumference && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('shoulder_circumference')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Shoulder Circumference)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.shoulderCircumference}</p>
                          </div>
                        )}
                        {order.measurements.chest && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('chest_bust')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Chest/Bust)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.chest}</p>
                          </div>
                        )}
                        {order.measurements.waist && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('waist')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Waist)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.waist}</p>
                          </div>
                        )}
                        {order.measurements.hips && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('hips')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Hips)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.hips}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات التفصيل المتقدمة */}
                  {(order.measurements.dartLength || order.measurements.bodiceLength || order.measurements.neckline || order.measurements.armpit) && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-700 border-b border-pink-200 pb-1">
                        {t('advanced_tailoring_measurements')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Advanced Tailoring)</span>}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.dartLength && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('dart_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Dart Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.dartLength}</p>
                          </div>
                        )}
                        {order.measurements.bodiceLength && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('bodice_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Bodice Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.bodiceLength}</p>
                          </div>
                        )}
                        {order.measurements.neckline && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('neckline')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Neckline)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.neckline}</p>
                          </div>
                        )}
                        {order.measurements.armpit && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('armpit')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Armpit)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.armpit}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات الأكمام */}
                  {(order.measurements.sleeveLength || order.measurements.forearm || order.measurements.cuff) && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-700 border-b border-pink-200 pb-1">
                        {t('sleeve_measurements')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Sleeve Measurements)</span>}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.sleeveLength && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('sleeve_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Sleeve Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.sleeveLength}</p>
                          </div>
                        )}
                        {order.measurements.forearm && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('forearm')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Forearm)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.forearm}</p>
                          </div>
                        )}
                        {order.measurements.cuff && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('cuff')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Cuff)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.cuff}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات الطول */}
                  {(order.measurements.frontLength || order.measurements.backLength) && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-700 border-b border-pink-200 pb-1">
                        {t('length_measurements')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Length Measurements)</span>}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.frontLength && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('front_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Front Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.frontLength}</p>
                          </div>
                        )}
                        {order.measurements.backLength && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('back_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Back Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.backLength}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* المقاسات القديمة (للتوافق مع البيانات الموجودة) */}
                  {(order.measurements.length || order.measurements.shoulders || order.measurements.sleeves) && (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-gray-700 border-b border-gray-300 pb-1 text-gray-500">
                        {t('additional_measurements')}
                        {isArabic && <span className="text-sm text-gray-500 mr-2">(Additional)</span>}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.length && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('dress_length')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Dress Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.length}</p>
                          </div>
                        )}
                        {order.measurements.shoulders && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('shoulder_width')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Shoulder Width)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.shoulders}</p>
                          </div>
                        )}
                        {order.measurements.sleeves && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('sleeve_length_old')}
                              {isArabic && <span className="text-xs text-gray-400 block">(Sleeve Length)</span>}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.sleeves}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* صور التصميم */}
              {order.images && order.images.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <ImageIcon className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('design_images')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Design Images)</span>}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {order.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                          <img
                            src={image}
                            alt={`${t('design_image_alt')} ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                            onClick={() => window.open(image, '_blank')}
                          />
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* الملاحظات */}
              {order.notes && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <MessageSquare className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('notes')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Notes)</span>}
                    </span>
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p>{order.notes}</p>
                  </div>
                </div>
              )}

              {/* الملاحظات الصوتية */}
              {order.voice_notes && order.voice_notes.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <MessageSquare className="w-5 h-5 text-pink-600" />
                    <span>
                      {t('voice_notes')}
                      {isArabic && <span className="text-sm text-gray-500 mr-2">(Voice Notes)</span>}
                    </span>
                  </h3>
                  <VoiceNotes
                    voiceNotes={order.voice_notes.map((vn, idx) => ({
                      id: `vn-${idx}`,
                      data: vn,
                      timestamp: Date.now()
                    }))}
                    onVoiceNotesChange={() => {}} // للعرض فقط
                    disabled={true}
                  />
                </div>
              )}

              {/* صور العمل المكتمل - للمدراء فقط */}
              {user?.role === 'admin' && order.completedImages && order.completedImages.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span>{t('completed_work_images')}</span>
                  </h3>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-2 space-x-reverse mb-3">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        {t('completed_work_description')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {order.completedImages.map((image, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square rounded-lg overflow-hidden border border-green-300">
                            <img
                              src={image}
                              alt={`${t('completed_work_image_alt')} ${index + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                              onClick={() => window.open(image, '_blank')}
                            />
                          </div>
                          <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded">
                            {index + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* تذييل النافذة */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 rounded-b-2xl">
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="btn-secondary px-6 py-2"
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
