'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Ruler, RotateCcw, Store, MapPin, Banknote, CreditCard, LockKeyhole } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import NumericInput from './NumericInput'
import {
  Measurements,
  MEASUREMENT_ORDER,
  type MeasurementPaymentMethod,
  type MeasurementSaveMetadata,
  type MeasurementSource,
} from '@/types/measurements'

const STORAGE_KEY_PREFIX = 'measurements-draft-'

function getStorageKey(orderId: string) {
  return `${STORAGE_KEY_PREFIX}${orderId}`
}

interface MeasurementsDraft {
  data: Measurements
  timestamp: number
  source?: MeasurementSource | null
  paymentMethod?: MeasurementPaymentMethod | null
}

function saveDraftToLocal(
  orderId: string,
  data: Measurements,
  source?: MeasurementSource | null,
  paymentMethod?: MeasurementPaymentMethod | null
) {
  try {
    localStorage.setItem(getStorageKey(orderId), JSON.stringify({
      data,
      timestamp: Date.now(),
      source,
      paymentMethod,
    }))
  } catch {}
}

function loadDraftFromLocal(orderId: string): MeasurementsDraft | null {
  try {
    const raw = localStorage.getItem(getStorageKey(orderId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearDraftFromLocal(orderId: string) {
  try {
    localStorage.removeItem(getStorageKey(orderId))
  } catch {}
}

interface MeasurementsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (measurements: Measurements, metadata?: MeasurementSaveMetadata) => Promise<void>
  initialMeasurements?: Measurements
  orderId: string
  showMeasurementOptions?: boolean
  initialMeasurementSource?: MeasurementSource | null
  initialMeasurementPaymentMethod?: MeasurementPaymentMethod | null
  isMeasurementBillingLocked?: boolean
  forceNetworkMeasurementBilling?: boolean
}

export default function MeasurementsModal({
  isOpen,
  onClose,
  onSave,
  initialMeasurements,
  orderId,
  showMeasurementOptions = false,
  initialMeasurementSource = null,
  initialMeasurementPaymentMethod = null,
  isMeasurementBillingLocked = false,
  forceNetworkMeasurementBilling = false,
}: MeasurementsModalProps) {
  const { t, isArabic } = useTranslation()
  const [measurements, setMeasurements] = useState<Measurements>(initialMeasurements || {})
  const [measurementSource, setMeasurementSource] = useState<MeasurementSource | null>(
    forceNetworkMeasurementBilling ? 'yasmin_alsham' : initialMeasurementSource
  )
  const [measurementPaymentMethod, setMeasurementPaymentMethod] = useState<MeasurementPaymentMethod | null>(
    forceNetworkMeasurementBilling ? 'card' : initialMeasurementPaymentMethod
  )
  const [isSaving, setIsSaving] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const userHasEdited = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // عند فتح المودال: استعادة المسودة تلقائياً
  useEffect(() => {
    if (isOpen && orderId) {
      const draft = loadDraftFromLocal(orderId)
      if (draft) {
        setMeasurements(draft.data)
        if (showMeasurementOptions) {
          const restoredSource = forceNetworkMeasurementBilling
            ? 'yasmin_alsham'
            : (draft.source || initialMeasurementSource)
          setMeasurementSource(restoredSource)
          setMeasurementPaymentMethod(
            forceNetworkMeasurementBilling
              ? 'card'
              : restoredSource === 'external'
              ? null
              : (draft.paymentMethod || initialMeasurementPaymentMethod)
          )
        }
        setShowDraftBanner(true)
      } else {
        setMeasurements(initialMeasurements || {})
        setMeasurementSource(forceNetworkMeasurementBilling ? 'yasmin_alsham' : initialMeasurementSource)
        setMeasurementPaymentMethod(forceNetworkMeasurementBilling ? 'card' : initialMeasurementPaymentMethod)
        setShowDraftBanner(false)
      }
      setValidationError(null)
      setSaveError(null)
      userHasEdited.current = false
    }
  }, [
    isOpen,
    orderId,
    initialMeasurements,
    initialMeasurementSource,
    initialMeasurementPaymentMethod,
    showMeasurementOptions,
    forceNetworkMeasurementBilling,
  ])

  // حفظ تلقائي محلي مع debounce
  const saveDraftDebounced = useCallback((
    data: Measurements,
    source?: MeasurementSource | null,
    paymentMethod?: MeasurementPaymentMethod | null
  ) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      saveDraftToLocal(orderId, data, source, paymentMethod)
    }, 500)
  }, [orderId])

  const handleMeasurementChange = (key: keyof Measurements, value: string) => {
    userHasEdited.current = true
    setValidationError(null)
    setSaveError(null)
    setMeasurements(prev => {
      const updated = { ...prev, [key]: key === 'additional_notes' ? value : value }
      saveDraftDebounced(updated, measurementSource, measurementPaymentMethod)
      return updated
    })
  }

  const handleMeasurementSourceChange = (source: MeasurementSource) => {
    if (isMeasurementBillingLocked || forceNetworkMeasurementBilling) return
    userHasEdited.current = true
    const nextPaymentMethod = source === 'external' ? null : measurementPaymentMethod
    setMeasurementSource(source)
    setMeasurementPaymentMethod(nextPaymentMethod)
    setValidationError(null)
    setSaveError(null)
    saveDraftDebounced(measurements, source, nextPaymentMethod)
  }

  const handleMeasurementPaymentChange = (method: MeasurementPaymentMethod) => {
    if (isMeasurementBillingLocked || forceNetworkMeasurementBilling || measurementSource !== 'yasmin_alsham') return
    userHasEdited.current = true
    setMeasurementPaymentMethod(method)
    setValidationError(null)
    setSaveError(null)
    saveDraftDebounced(measurements, measurementSource, method)
  }

  // مسح المسودة والعودة للبيانات الأصلية
  const handleClearDraft = () => {
    clearDraftFromLocal(orderId)
    setMeasurements(initialMeasurements || {})
    setMeasurementSource(forceNetworkMeasurementBilling ? 'yasmin_alsham' : initialMeasurementSource)
    setMeasurementPaymentMethod(forceNetworkMeasurementBilling ? 'card' : initialMeasurementPaymentMethod)
    setShowDraftBanner(false)
    setValidationError(null)
    setSaveError(null)
  }

  const handleSave = async () => {
    let metadata: MeasurementSaveMetadata | undefined
    if (showMeasurementOptions) {
      if (forceNetworkMeasurementBilling) {
        metadata = { source: 'yasmin_alsham', paymentMethod: 'card' }
      }
      if (!measurementSource) {
        setValidationError(isArabic ? 'يرجى اختيار نوع المقاس قبل الحفظ' : 'Select the measurement source before saving')
        return
      }
      if (measurementSource === 'yasmin_alsham' && !measurementPaymentMethod) {
        setValidationError(isArabic ? 'طريقة الدفع مطلوبة لمقاس ياسمين الشام' : 'Payment method is required for Yasmin Al-Sham measurements')
        return
      }
      if (!forceNetworkMeasurementBilling) {
        metadata = {
          source: measurementSource,
          paymentMethod: measurementSource === 'yasmin_alsham' ? measurementPaymentMethod : null,
        }
      }
    }

    setIsSaving(true)
    setValidationError(null)
    setSaveError(null)
    try {
      // تحويل القيم النصية إلى أرقام (ما عدا additional_notes)
      // نتجاهل أي مفاتيح غير معروفة (صور التصميم وغيرها) لمنع تحويلها إلى NaN
      const processedMeasurements: Measurements = {}
      Object.entries(measurements).forEach(([key, value]) => {
        if (!MEASUREMENT_ORDER.includes(key as keyof Measurements)) return
        if (key === 'additional_notes') {
          if (value && value !== '') {
            processedMeasurements[key as keyof Measurements] = value as any
          }
        } else {
          if (value && value !== '') {
            processedMeasurements[key as keyof Measurements] = Number(value) as any
          }
        }
      })

      await onSave(processedMeasurements, metadata)
      // عند الحفظ الناجح، مسح المسودة المحلية
      clearDraftFromLocal(orderId)
      onClose()
    } catch (error) {
      console.error('Error saving measurements:', error)
      setSaveError(
        error instanceof Error
          ? error.message
          : (isArabic ? 'حدث خطأ أثناء حفظ المقاسات' : 'Error saving measurements')
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-pink-50 to-purple-50 px-6 py-4 border-b border-pink-100 flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <Ruler className="w-6 h-6 text-pink-600" />
                  <h2 className="text-2xl font-bold text-gray-800">
                    {t('measurements_modal_title')}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  disabled={isSaving}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* شريط إشعار استعادة المسودة */}
              {showDraftBanner && (
                <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-800 text-sm">
                    <RotateCcw className="w-4 h-4 flex-shrink-0" />
                    <span>تم استعادة بيانات محفوظة محلياً بشكل تلقائي</span>
                  </div>
                  <button
                    onClick={handleClearDraft}
                    className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
                  >
                    مسح الكل
                  </button>
                </div>
              )}

              {/* Content */}
              <div className="p-6">
                {showMeasurementOptions && (
                  <div className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <fieldset className="rounded-2xl border border-pink-100 bg-pink-50/60 p-4">
                      <legend className="px-2 text-sm font-bold text-gray-800">
                        {isArabic ? 'نوع المقاس' : 'Measurement source'}
                        <span className="mr-1 text-rose-600" aria-hidden="true">*</span>
                      </legend>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        {([
                          { value: 'yasmin_alsham', label: isArabic ? 'مقاس ياسمين الشام' : 'Yasmin Al-Sham', icon: Store },
                          { value: 'external', label: isArabic ? 'مقاس خارجي' : 'External', icon: MapPin },
                        ] as const).map(({ value, label, icon: Icon }) => {
                          const selected = measurementSource === value
                          return (
                            <label
                              key={value}
                              className={`flex min-h-20 cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                                selected
                                  ? 'border-pink-500 bg-white text-pink-700 shadow-sm'
                                  : 'border-pink-100 bg-white/70 text-gray-700 hover:border-pink-300'
                              } ${isMeasurementBillingLocked || forceNetworkMeasurementBilling ? 'cursor-not-allowed opacity-70' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`measurement-source-${orderId}`}
                                value={value}
                                checked={selected}
                                onChange={() => handleMeasurementSourceChange(value)}
                                disabled={isSaving || isMeasurementBillingLocked || forceNetworkMeasurementBilling}
                                className="h-4 w-4 accent-pink-600"
                              />
                              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </fieldset>

                    <fieldset
                      disabled={measurementSource !== 'yasmin_alsham' || isSaving || isMeasurementBillingLocked || forceNetworkMeasurementBilling}
                      className={`rounded-2xl border p-4 transition-colors ${
                        measurementSource === 'yasmin_alsham'
                          ? 'border-emerald-100 bg-emerald-50/60'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <legend className="px-2 text-sm font-bold text-gray-800">
                        {isArabic ? 'طريقة دفع أجرة المقاس' : 'Measurement fee payment'}
                        {measurementSource === 'yasmin_alsham' && (
                          <span className="mr-1 text-rose-600" aria-hidden="true">*</span>
                        )}
                      </legend>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        {([
                          { value: 'cash', label: isArabic ? 'كاش' : 'Cash', icon: Banknote },
                          { value: 'card', label: isArabic ? 'شبكة' : 'Card', icon: CreditCard },
                        ] as const).map(({ value, label, icon: Icon }) => {
                          const selected = measurementPaymentMethod === value
                          const disabled = measurementSource !== 'yasmin_alsham' || isMeasurementBillingLocked || forceNetworkMeasurementBilling
                          return (
                            <label
                              key={value}
                              className={`flex min-h-20 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                                selected
                                  ? 'border-emerald-500 bg-white text-emerald-700 shadow-sm'
                                  : 'border-gray-200 bg-white/70 text-gray-700'
                              } ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:border-emerald-300'}`}
                            >
                              <input
                                type="radio"
                                name={`measurement-payment-${orderId}`}
                                value={value}
                                checked={selected}
                                onChange={() => handleMeasurementPaymentChange(value)}
                                className="h-4 w-4 accent-emerald-600"
                              />
                              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                      {measurementSource === 'external' && (
                        <p className="mt-3 text-xs font-medium text-gray-500">
                          {isArabic ? 'لا توجد طريقة دفع للمقاس الخارجي.' : 'Payment is not available for external measurements.'}
                        </p>
                      )}
                    </fieldset>

                    {forceNetworkMeasurementBilling && (
                      <div className="md:col-span-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                        <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {isArabic
                            ? 'إضافة المقاس الجديدة تُسجّل تلقائياً كدفعة شبكة بقيمة 85 ر.س وتُرسل للمحاسبة.'
                            : 'A new measurement is automatically billed as an 85 SAR card payment and sent to accounting.'}
                        </span>
                      </div>
                    )}

                    {isMeasurementBillingLocked && (
                      <div className="md:col-span-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
                        <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {isArabic
                            ? 'تم إرسال فاتورة المقاس أو أنها قيد المراجعة؛ يمكنك تعديل الأرقام فقط.'
                            : 'Measurement billing is sent or under review; only measurement values can be edited.'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {(validationError || saveError) && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                  >
                    {validationError || saveError}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                  {MEASUREMENT_ORDER.filter(key => key !== 'additional_notes').map((key) => (
                    <div key={key}>
                      <NumericInput
                        value={measurements[key]?.toString() || ''}
                        onChange={(value) => handleMeasurementChange(key, value)}
                        type="measurement"
                        label={t(`measurement_${key}`)}
                        placeholder={t('cm_placeholder')}
                        disabled={isSaving}
                      />
                    </div>
                  ))}
                </div>

                {/* حقل المقاسات الإضافية */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('measurement_additional_notes')}
                  </label>
                  <textarea
                    value={measurements.additional_notes || ''}
                    onChange={(e) => handleMeasurementChange('additional_notes', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
                    placeholder={t('additional_measurements_placeholder')}
                    disabled={isSaving}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 space-x-reverse rounded-b-2xl">
                <button
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-300 flex items-center space-x-2 space-x-reverse disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? t('saving') : t('save_measurements')}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
