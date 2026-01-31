'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Ruler } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import NumericInput from './NumericInput'
import { Measurements, MEASUREMENT_ORDER } from '@/types/measurements'

interface MeasurementsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (measurements: Measurements) => Promise<void>
  initialMeasurements?: Measurements
  orderId: string
}

export default function MeasurementsModal({
  isOpen,
  onClose,
  onSave,
  initialMeasurements,
  orderId
}: MeasurementsModalProps) {
  const { t } = useTranslation()
  const [measurements, setMeasurements] = useState<Measurements>(initialMeasurements || {})
  const [isSaving, setIsSaving] = useState(false)

  // تحديث المقاسات عند تغيير initialMeasurements
  useEffect(() => {
    if (initialMeasurements) {
      setMeasurements(initialMeasurements)
    }
  }, [initialMeasurements])

  const handleMeasurementChange = (key: keyof Measurements, value: string) => {
    setMeasurements(prev => ({
      ...prev,
      [key]: key === 'additional_notes' ? value : value
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // تحويل القيم النصية إلى أرقام (ما عدا additional_notes)
      const processedMeasurements: Measurements = {}
      Object.entries(measurements).forEach(([key, value]) => {
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

      await onSave(processedMeasurements)
      onClose()
    } catch (error) {
      console.error('Error saving measurements:', error)
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

              {/* Content */}
              <div className="p-6">
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

