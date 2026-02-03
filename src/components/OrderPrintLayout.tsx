'use client'

import { forwardRef } from 'react'
import { Order } from '@/lib/services/order-service'
import { MEASUREMENT_ORDER, MEASUREMENT_LABELS } from '@/types/measurements'

// نوع snapshot التعليق للطباعة
interface DesignCommentSnapshot {
  id: string
  title: string
  imageDataUrl: string
  transcriptions: string[] // النصوص المرئية على الصورة
  hiddenTranscriptions: Array<{ number: number; text: string; translation?: string }> // النصوص المخفية مع ترجماتها ورقم العلامة
  translatedTexts: Array<{ number: number; text: string; translation: string }> // النصوص المترجمة (المرئية) مع رقم العلامة
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

    // استخراج النصوص المحولة من الملاحظات الصوتية مع الترجمات
    const getVoiceTranscriptions = (): Array<{ text: string; translation?: string }> => {
      const voiceTranscriptions = (order as any).voice_transcriptions || []
      if (!Array.isArray(voiceTranscriptions)) return []

      return voiceTranscriptions
        .filter((vt: any) => vt?.transcription)
        .map((vt: any) => ({
          text: vt.transcription,
          translation: vt.translatedText || undefined
        }))
    }

    // دمج جميع أنواع الملاحظات في قائمة واحدة (بدون تكرار)
    const getAllNotes = (): Array<{ text: string; translation?: string }> => {
      const allNotes: Array<{ text: string; translation?: string }> = []
      const seenTexts = new Set<string>() // لمنع التكرار

      // إضافة الملاحظات الصوتية المحولة مع الترجمات
      const voiceNotes = getVoiceTranscriptions()
      for (const note of voiceNotes) {
        if (note.text && !seenTexts.has(note.text.trim())) {
          seenTexts.add(note.text.trim())
          allNotes.push(note)
        }
      }

      // إضافة ملاحظات الطلب (بدون تكرار)
      if (order.notes && order.notes.trim() && !seenTexts.has(order.notes.trim())) {
        seenTexts.add(order.notes.trim())
        allNotes.push({ text: order.notes.trim() })
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
            {/* السطر الأول: رقم الهاتف - الموقع - التواريخ */}
            <div className="print-header-top">
              <div className="header-item header-right">
                <span>رقم الهاتف: </span>
                <span dir="ltr">0598862609</span>
              </div>
              <div className="header-item header-center">
                <span dir="ltr">www.yasmin-alsham.fashion</span>
              </div>
              <div className="header-item header-left header-dates">
                <div className="date-row">
                  <span>تاريخ استلام الطلب: </span>
                  <span>{formatDate(order.order_received_date || order.created_at)}</span>
                </div>
                {order.proof_delivery_date && (
                  <div className="date-row">
                    <span>تاريخ استلام البروفا: </span>
                    <span>{formatDate(order.proof_delivery_date)}</span>
                  </div>
                )}
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
                  {/* المقاسات الإضافية */}
                  {(order.measurements as any)?.additional_notes && (
                    <div className="measurement-item measurement-item-compact measurement-additional">
                      <span className="measurement-label">مقاسات إضافية:</span>
                      <span className="measurement-value measurement-additional-text">
                        {(order.measurements as any).additional_notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* قسم ملاحظات إضافية - جميع أنواع الملاحظات مع الترجمات */}
              <div className="print-additional-notes">
                <h2 className="section-title section-title-compact">ملاحظات إضافية</h2>
                <div className="additional-notes-list">
                  {allNotes.length > 0 ? (
                    allNotes.map((note, idx) => (
                      <div key={idx} className="additional-note-item">
                        <span className="note-number">{idx + 1}.</span>
                        <div className="note-content">
                          <span className="note-text">{note.text}</span>
                          {note.translation && (
                            <span className="note-translation">({note.translation})</span>
                          )}
                        </div>
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
        {designCommentsSnapshots.map((snapshot) => (
          <div key={snapshot.id} className="print-page design-comment-page">
            <div className="design-comment-full">
              {/* الصورة مع الرسومات والعلامات والنصوص المرئية */}
              <div className="design-comment-image-wrapper">
                <img
                  src={snapshot.imageDataUrl}
                  alt={snapshot.title}
                  className="design-comment-full-image"
                />
              </div>

              {/* النصوص المخفية (التي تم إخفاؤها بزر العين) */}
              {snapshot.hiddenTranscriptions && snapshot.hiddenTranscriptions.length > 0 && (
                <div className="design-comment-hidden-texts">
                  <h4 className="hidden-texts-title">نصوص مخفية:</h4>
                  {snapshot.hiddenTranscriptions.map((item, idx) => (
                    <div key={idx} className="hidden-text-item">
                      <span className="hidden-text-number">{item.number}.</span>
                      <span className="hidden-text">{item.text}</span>
                      {item.translation && (
                        <span className="hidden-text-translation">({item.translation})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* النصوص المترجمة (المرئية التي لها ترجمة) */}
              {snapshot.translatedTexts && snapshot.translatedTexts.length > 0 && (
                <div className="design-comment-translations">
                  <h4 className="translations-title">الترجمات:</h4>
                  {snapshot.translatedTexts.map((item, idx) => (
                    <div key={idx} className="translation-item">
                      <span className="translation-number">{item.number}.</span>
                      <span className="original-text">{item.text}</span>
                      <span className="arrow-icon">←</span>
                      <span className="translated-text">{item.translation}</span>
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

