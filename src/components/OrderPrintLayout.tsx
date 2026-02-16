'use client'

import { forwardRef } from 'react'
import { Order } from '@/lib/services/order-service'
import { parseDateForDisplay } from '@/lib/date-utils'
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
 * - الصفحة 1: معلومات الطلب + المقاسات + صورة الخلف (أو الأمام أو أول صورة تصميم)
 * - الصفحة 2: صورة الأمام (إن وجدت)
 * - الصفحة 3+: كل تعليق تصميم في صفحة منفصلة
 * - الصفحة الأخيرة: باقي صور التصميم
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

    // تنسيق التاريخ في الطباعة بصيغة شهر\يوم (بدون سنة)
    const formatDate = (dateString: string) => {
      const parsed = parseDateForDisplay(dateString)
      if (!parsed) return dateString

      const day = String(parsed.getDate()).padStart(2, '0')
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      return `${day}\\${month}`
    }

    // استخراج المقاسات الفعلية (MEASUREMENT_ORDER يحتوي فقط على مفاتيح المقاسات الحقيقية)
    const getMeasurementsForPrint = () => {
      return MEASUREMENT_ORDER.filter(key => key !== 'additional_notes')
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

    // تحديد الصورة التي ستظهر في الصفحة الأولى (الخلف)
    const getFirstPageImage = () => {
      // البحث عن صورة الخلف
      const backSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('الخلف') || s.title.includes('خلف') || s.title.toLowerCase().includes('back')
      )
      if (backSnapshot) return backSnapshot.imageDataUrl

      // إذا لم توجد صورة خلف، نستخدم الصورة الأولى من القائمة العامة (بشرط ألا تكون هي صورة الأمام)
      const frontSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('الأمام') || s.title.includes('امام') || s.title.toLowerCase().includes('front')
      )

      const firstAvailable = printableImages.find(img => img !== frontSnapshot?.imageDataUrl)
      return firstAvailable || printableImages[0] || null
    }

    // تحديد صورة الأمام للصفحة الثانية
    const getFrontPageImage = () => {
      // البحث عن صورة الأمام بشكل صريح
      const frontSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('الأمام') || s.title.includes('امام') || s.title.toLowerCase().includes('front')
      )
      if (frontSnapshot) return frontSnapshot.imageDataUrl

      // إذا لم توجد صورة أمام صريحة، نستخدم أول صورة تعليق ليست "خلف"
      const backSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('الخلف') || s.title.includes('خلف') || s.title.toLowerCase().includes('back')
      )

      const candidate = designCommentsSnapshots.find(s => s !== backSnapshot)
      return candidate?.imageDataUrl || null
    }

    // تحديد صور التصميم المتبقية (بعد استبعاد ما تم عرضه في صفحات الأمام والخلف والتعليقات)
    const getRemainingDesignImages = () => {
      // إذا لا توجد تعليقات تصميم، نعرض كل الصور المتبقية بعد الأمام والخلف
      if (designCommentsSnapshots.length === 0) {
        return printableImages
      }

      // استبعاد الصور التي تم عرضها كتعليقات تصميم (الأمام والخلف والمفلترة)
      // نستبعد عدد الصور المساوي لعدد التعليقات لأن كل تعليق يمثل صورة واحدة
      const usedSnapshotCount = designCommentsSnapshots.length
      // الصور المتبقية هي التي بعد عدد التعليقات المستخدمة
      return printableImages.slice(usedSnapshotCount)
    }

    // تصفية تعليقات التصميم لاستبعاد الخلف والأمام المستخدمين
    const getFilteredDesignComments = () => {
      const frontImgUrl = getFrontPageImage()
      const backImgUrl = getFirstPageImage()

      return designCommentsSnapshots.filter(snapshot =>
        snapshot.imageDataUrl !== frontImgUrl && snapshot.imageDataUrl !== backImgUrl
      )
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
                    <span>تاريخ تسليم البروفا: </span>
                    <span>{formatDate(order.proof_delivery_date)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* السطر الثاني: اسم المحل */}
            <div className="print-logo">
              <h1 className="print-brand">ياسمين الشام</h1>
            </div>

            {/* معلومات العميل في صف أفقي واحد */}
            <div className="print-order-info">
              <div className="info-grid-single-row">
                <div className="info-item-inline">
                  <span className="info-label">اسم العميل:</span>
                  <span className="info-value">{order.client_name}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">موعد التسليم:</span>
                  <span className="info-value">{formatDate(order.due_date)}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">رقم الهاتف:</span>
                  <span className="info-value" dir="ltr">{order.client_phone}</span>
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

            {/* الجزء الأيسر - صورة الخلف أو الأمام أو أول صورة تصميم */}
            <div className="print-comments">
              <h3 className="section-title section-title-compact" style={{ textAlign: 'center', marginBottom: '10px' }}>الخلف</h3>
              <div className="comments-box">
                {getFirstPageImage() ? (
                  <div className="first-images-grid first-images-single">
                    <div className="first-image-container first-image-single">
                      <img
                        src={getFirstPageImage()!}
                        alt="صورة التصميم"
                        className="first-design-image"
                      />
                    </div>
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

        {/* ========== الصفحة الثانية - صورة الأمام (إن وجدت) ========== */}
        {getFrontPageImage() && (
          <div className="print-page page-front-image">
            <h3 className="section-title section-title-compact" style={{ textAlign: 'center', marginBottom: '10px' }}>الأمام</h3>
            <div className="design-comment-full">
              <div className="design-comment-image-wrapper">
                <img
                  src={getFrontPageImage()!}
                  alt="صورة الأمام"
                  className="design-comment-full-image"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========== صفحات تعليقات التصميم (كل تعليق في صفحة منفصلة - بدون الترجمات) ========== */}
        {getFilteredDesignComments().map((snapshot) => (
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
            </div>
          </div>
        ))}

        {/* ========== صفحة الصور المتبقية ========== */}
        {getRemainingDesignImages().length > 0 && (
          <div className="print-page page-back">
            <h2 className="images-title">صور التصميم الإضافية</h2>
            <div className="images-grid">
              {getRemainingDesignImages().map((image, index) => (
                <div key={index} className="image-container">
                  <img
                    src={image}
                    alt={`صورة التصميم ${index + 1}`}
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

