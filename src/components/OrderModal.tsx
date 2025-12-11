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
  Image as ImageIcon,
  Mail
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
    return date.toLocaleDateString('ar-SA', {
      calendar: 'gregory', // استخدام التقويم الميلادي
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
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
                  {t('order_details')}
                </h2>
                <div className="flex items-center space-x-3 space-x-reverse">
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-300"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* محتوى النافذة */}
            <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
              {/* معلومات أساسية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                    <span>
                      {t('customer_information')}
                    </span>
                  </h3>

                  <div className="space-y-3 bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 sm:space-x-reverse">
                      <div className="flex items-center space-x-2 space-x-reverse text-gray-600">
                        <User className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium text-sm sm:text-base">
                          {t('name')}:
                        </span>
                      </div>
                      <span className="text-sm sm:text-base pr-6 sm:pr-0">{order.client_name}</span>
                    </div>

                    {/* رقم الهاتف - للمدراء فقط */}
                    {user?.role === 'admin' && order.client_phone && (
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 sm:space-x-reverse">
                        <div className="flex items-center space-x-2 space-x-reverse text-gray-600">
                          <Phone className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium text-sm sm:text-base">
                            {t('phone')}:
                          </span>
                        </div>
                        <span className="text-sm sm:text-base pr-6 sm:pr-0" dir="ltr">{order.client_phone}</span>
                      </div>
                    )}

                    {/* البريد الإلكتروني - للمدراء فقط */}
                    {user?.role === 'admin' && order.client_email && (
                      <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 sm:space-x-reverse">
                        <div className="flex items-center space-x-2 space-x-reverse text-gray-600">
                          <Mail className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium text-sm sm:text-base">
                            {t('email')}:
                          </span>
                        </div>
                        <span className="text-sm sm:text-base pr-6 sm:pr-0 break-all" dir="ltr">{order.client_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                    <span>
                      {t('order_details')}
                    </span>
                  </h3>

                  <div className="space-y-3 bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div>
                      <span className="font-medium text-sm sm:text-base text-gray-700">
                        {t('description')}:
                      </span>
                      <p className="mt-1 text-sm sm:text-base text-gray-800">{order.description}</p>
                    </div>
                    {order.fabric && (
                      <div>
                        <span className="font-medium text-sm sm:text-base text-gray-700">
                          {t('fabric_type')}:
                        </span>
                        <p className="mt-1 text-sm sm:text-base text-gray-800">{order.fabric}</p>
                      </div>
                    )}

                    {/* السعر والدفعات - للمدراء فقط */}
                    {user?.role === 'admin' && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span className="font-medium text-sm sm:text-base text-gray-700">
                            {t('price')}:
                          </span>
                          <span className="text-sm sm:text-base text-gray-800 font-semibold">{order.price} {t('sar')}</span>
                        </div>

                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span className="font-medium text-sm sm:text-base text-gray-700">
                            {t('paid_amount')}:
                          </span>
                          <span className="text-sm sm:text-base text-green-600 font-semibold">{order.paid_amount || 0} {t('sar')}</span>
                        </div>

                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span className="font-medium text-sm sm:text-base text-gray-700">
                            {t('remaining_amount')}:
                          </span>
                          <span className="text-sm sm:text-base text-orange-600 font-semibold">{order.remaining_amount || 0} {t('sar')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* الحالة والتواريخ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="space-y-2 sm:space-y-3">
                  <h4 className="font-bold text-sm sm:text-base text-gray-800">
                    {t('status')}
                  </h4>
                  <span className={`inline-block px-3 py-2 rounded-full text-xs sm:text-sm font-medium ${getStatusInfo(order.status).bgColor} ${getStatusInfo(order.status).color}`}>
                    {getStatusInfo(order.status).label}
                  </span>
                </div>

                <div className="space-y-2 sm:space-y-3">
                  <h4 className="font-bold text-sm sm:text-base text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {t('order_date')}
                    </span>
                  </h4>
                  <p className="text-sm sm:text-base text-gray-700">{formatDate(order.created_at)}</p>
                </div>

                <div className="space-y-2 sm:space-y-3">
                  <h4 className="font-bold text-sm sm:text-base text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {t('delivery_date')}
                    </span>
                  </h4>
                  <p className="text-sm sm:text-base text-gray-700">{formatDate(getDisplayDeliveryDate(order.due_date))}</p>
                </div>
              </div>

              {/* العامل المسؤول */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                  <UserCheck className="w-5 h-5 text-pink-600" />
                  <span>
                    {t('assigned_worker')}
                  </span>
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-lg">{getWorkerName(order.worker_id)}</p>
                </div>
              </div>

              {/* المقاسات */}
              {Object.values(order.measurements).some(val => val !== undefined) && (
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center space-x-2 space-x-reverse">
                    <Ruler className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                    <span>
                      {t('measurements_cm')}
                    </span>
                  </h3>

                  {/* المقاسات الأساسية */}
                  {(order.measurements.shoulder || order.measurements.shoulderCircumference || order.measurements.chest || order.measurements.waist || order.measurements.hips) && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('basic_measurements')}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {order.measurements.shoulder && (
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('shoulder')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.shoulder}</p>
                          </div>
                        )}
                        {order.measurements.shoulderCircumference && (
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('shoulder_circumference')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.shoulderCircumference}</p>
                          </div>
                        )}
                        {order.measurements.chest && (
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('chest_bust')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.chest}</p>
                          </div>
                        )}
                        {order.measurements.waist && (
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('waist')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.waist}</p>
                          </div>
                        )}
                        {order.measurements.hips && (
                          <div className="bg-gradient-to-br from-pink-50 to-purple-50 p-3 rounded-lg text-center border border-pink-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('hips')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.hips}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات التفصيل المتقدمة */}
                  {(order.measurements.dartLength || order.measurements.bodiceLength || order.measurements.neckline || order.measurements.armpit) && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('advanced_tailoring_measurements')}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {order.measurements.dartLength && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-lg text-center border border-blue-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('dart_length')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.dartLength}</p>
                          </div>
                        )}
                        {order.measurements.bodiceLength && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-lg text-center border border-blue-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('bodice_length')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.bodiceLength}</p>
                          </div>
                        )}
                        {order.measurements.neckline && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-lg text-center border border-blue-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('neckline')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.neckline}</p>
                          </div>
                        )}
                        {order.measurements.armpit && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-lg text-center border border-blue-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('armpit')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.armpit}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات الأكمام */}
                  {(order.measurements.sleeveLength || order.measurements.forearm || order.measurements.cuff) && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('sleeve_measurements')}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {order.measurements.sleeveLength && (
                          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg text-center border border-green-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('sleeve_length')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.sleeveLength}</p>
                          </div>
                        )}
                        {order.measurements.forearm && (
                          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg text-center border border-green-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('forearm')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.forearm}</p>
                          </div>
                        )}
                        {order.measurements.cuff && (
                          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg text-center border border-green-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('cuff')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.cuff}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* مقاسات الطول */}
                  {(order.measurements.frontLength || order.measurements.backLength) && (
                    <div className="space-y-3">
                      <h4 className="text-sm sm:text-base font-semibold text-gray-700 border-b border-pink-200 pb-2">
                        {t('length_measurements')}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {order.measurements.frontLength && (
                          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-lg text-center border border-amber-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('front_length')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.frontLength}</p>
                          </div>
                        )}
                        {order.measurements.backLength && (
                          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-lg text-center border border-amber-100">
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              {t('back_length')}
                            </p>
                            <p className="text-base sm:text-lg font-bold text-gray-800">{order.measurements.backLength}</p>
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
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {order.measurements.length && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('dress_length')}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.length}</p>
                          </div>
                        )}
                        {order.measurements.shoulders && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('shoulder_width')}
                            </p>
                            <p className="text-lg font-bold">{order.measurements.shoulders}</p>
                          </div>
                        )}
                        {order.measurements.sleeves && (
                          <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-600">
                              {t('sleeve_length_old')}
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
              {user?.role === 'admin' && order.completed_images && order.completed_images.length > 0 && (
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
                      {order.completed_images.map((image, index) => (
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
