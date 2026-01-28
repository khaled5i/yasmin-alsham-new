'use client'

import { forwardRef } from 'react'
import { Order } from '@/lib/services/order-service'
import { MEASUREMENT_ORDER, MEASUREMENT_LABELS } from '@/types/measurements'

// نوع snapshot التعليق للطباعة
interface DesignCommentSnapshot {
  id: string
  title: string
  imageDataUrl: string
  transcriptions: string[]
}

interface OrderPrintLayoutProps {
  order: Order
  printableImages: string[]
  designComments?: string
  designCommentsSnapshots?: DesignCommentSnapshot[] // قائمة التعليقات المتعددة
}

/**
 * مكون تخطيط طباعة الطلب
 * ترتيب الصفحات:
 * - الصفحة 1: معلومات الطلب + المقاسات + أول صورتين من صور التصميم
 * - الصفحة 2+: كل تعليق تصميم في صفحة منفصلة
 * - الصفحة الأخيرة: باقي صور التصميم (إذا كان هناك أكثر من صورتين)
 */
const OrderPrintLayout = forwardRef<HTMLDivElement, OrderPrintLayoutProps>(
  ({ order, printableImages, designComments, designCommentsSnapshots = [] }, ref) => {

    // الحصول على اسم المقاس بالعربية
    const getMeasurementLabel = (key: string): string => {
      const label = MEASUREMENT_LABELS[key as keyof typeof MEASUREMENT_LABELS]
      if (label) {
        return `${label.ar} (${label.symbol})`
      }
      return key
    }

    // تنسيق التاريخ بصيغة يوم\شهر\سنة
    const formatDate = (dateString: string) => {
      const date = new Date(dateString)
      const day = date.getDate().toString().padStart(2, '0')
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const year = date.getFullYear()
      return `${day}\\${month}\\${year}`
    }

    // استخراج المقاسات الفعلية (بدون الحقول الخاصة)
    const getMeasurementsForPrint = () => {
      const measurements = order.measurements || {}
      return MEASUREMENT_ORDER.filter(key =>
        key !== 'additional_notes' &&
        key !== 'image_annotations' &&
        key !== 'image_drawings' &&
        key !== 'custom_design_image'
      )
    }

    // استخراج النصوص المحولة من الملاحظات الصوتية
    const getVoiceTranscriptions = (): string[] => {
      const voiceTranscriptions = (order as any).voice_transcriptions || []
      if (!Array.isArray(voiceTranscriptions)) return []

      return voiceTranscriptions
        .filter((vt: any) => vt?.transcription)
        .map((vt: any) => vt.transcription)
    }

    // دمج جميع أنواع الملاحظات في قائمة واحدة
    const getAllNotes = (): string[] => {
      const allNotes: string[] = []

      // إضافة الملاحظات الصوتية المحولة
      const voiceNotes = getVoiceTranscriptions()
      allNotes.push(...voiceNotes)

      // إضافة ملاحظات التصميم
      if (designComments && designComments.trim()) {
        allNotes.push(designComments.trim())
      }

      // إضافة ملاحظات الطلب
      if (order.notes && order.notes.trim()) {
        allNotes.push(order.notes.trim())
      }

      return allNotes
    }

    const allNotes = getAllNotes()

    return (
      <div ref={ref} className="print-layout" dir="rtl">
        {/* ========== الصفحة الأولى - الوجه الأمامي ========== */}
        <div className="print-page page-front">
          {/* القسم العلوي - المعلومات الأساسية */}
          <div className="print-header">
            {/* السطر الأول: رقم الهاتف - الموقع - تاريخ الاستلام */}
            <div className="print-header-top">
              <div className="header-item header-right">
                <span>رقم الهاتف: </span>
                <span dir="ltr">0598862609</span>
              </div>
              <div className="header-item header-center">
                <span dir="ltr">www.yasmin-alsham.fashion</span>
              </div>
              <div className="header-item header-left">
                <span>تاريخ استلام الطلب: </span>
                <span>{formatDate(order.due_date)}</span>
              </div>
            </div>

            {/* السطر الثاني: اسم المحل */}
            <div className="print-logo">
              <h1 className="print-brand">ياسمين الشام</h1>
              <p className="print-subtitle">للأزياء الراقية</p>
            </div>

            {/* معلومات العميل في صف أفقي واحد */}
            <div className="print-order-info">
              <div className="info-grid-single-row">
                <div className="info-item-inline">
                  <span className="info-label">اسم العميل:</span>
                  <span className="info-value">{order.client_name}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">رقم الهاتف:</span>
                  <span className="info-value" dir="ltr">{order.client_phone}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">موعد التسليم:</span>
                  <span className="info-value">{formatDate(order.due_date)}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">رقم الطلب:</span>
                  <span className="info-value">#{order.order_number || order.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* القسم السفلي - مقسم إلى جزئين */}
          <div className="print-content">
            {/* الجزء الأيمن - المقاسات + ملاحظات إضافية (30%) */}
            <div className="print-measurements-section">
              {/* قسم المقاسات - مختصر بنسبة 40% */}
              <div className="print-measurements print-measurements-compact">
                <h2 className="section-title section-title-compact">المقاسات</h2>
                <div className="measurements-list measurements-list-compact">
                  {getMeasurementsForPrint().map((key) => {
                    const value = (order.measurements as any)?.[key]
                    return (
                      <div key={key} className="measurement-item measurement-item-compact">
                        <span className="measurement-label">{getMeasurementLabel(key)}</span>
                        <span className="measurement-value">
                          {value ? `${value} إنش` : '______'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* قسم ملاحظات إضافية - جميع أنواع الملاحظات */}
              <div className="print-additional-notes">
                <h2 className="section-title section-title-compact">ملاحظات إضافية</h2>
                <div className="additional-notes-list">
                  {allNotes.length > 0 ? (
                    allNotes.map((text, idx) => (
                      <div key={idx} className="additional-note-item">
                        <span className="note-number">{idx + 1}.</span>
                        <span className="note-text">{text}</span>
                      </div>
                    ))
                  ) : (
                    <div className="additional-note-item additional-note-empty">
                      <span className="note-text">لا توجد ملاحظات</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* الجزء الأيسر - صور التصميم فقط */}
            <div className="print-comments">
              <div className="comments-box">
                {printableImages.length > 0 ? (
                  <div className="first-images-grid first-images-single">
                    {printableImages.slice(0, 1).map((image, index) => (
                      <div key={index} className="first-image-container first-image-single">
                        <img
                          src={image}
                          alt={`صورة التصميم ${index + 1}`}
                          className="first-design-image"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-comments">
                    {/* مساحة فارغة */}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========== صفحات تعليقات التصميم (كل تعليق في صفحة منفصلة) ========== */}
        {designCommentsSnapshots.map((snapshot, index) => (
          <div key={snapshot.id} className="print-page design-comment-page">
            <div className="design-comment-full">
              {/* الصورة مع الرسومات والعلامات */}
              <div className="design-comment-image-wrapper">
                <img
                  src={snapshot.imageDataUrl}
                  alt={snapshot.title}
                  className="design-comment-full-image"
                />
              </div>
              {/* النصوص المحولة من الصوت */}
              {snapshot.transcriptions.length > 0 && (
                <div className="design-comment-transcriptions">
                  {snapshot.transcriptions.map((text, idx) => (
                    <div key={idx} className="transcription-item">
                      {text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ========== صفحة الصور المتبقية (إذا كان هناك أكثر من صورة واحدة) ========== */}
        {printableImages.length > 1 && (
          <div className="print-page page-back">
            <h2 className="images-title">صور التصميم الإضافية</h2>
            <div className="images-grid">
              {printableImages.slice(1).map((image, index) => (
                <div key={index} className="image-container">
                  <img
                    src={image}
                    alt={`صورة التصميم ${index + 2}`}
                    className="design-image"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

OrderPrintLayout.displayName = 'OrderPrintLayout'

export default OrderPrintLayout

