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
  hindiDesignCommentsSnapshots?: DesignCommentSnapshot[] // النسخة الهندية
}

/**
 * مكون تخطيط طباعة الطلب
 * ترتيب الصفحات:
 * - الصفحة 1: معلومات الطلب + المقاسات + صورة الخلف (أو الأمام أو أول صورة تصميم)
 * - الصفحة 2: صورة الأمام (إن وجدت)
 * - الصفحة 3+: كل تعليق تصميم في صفحة منفصلة
 * - صفحات هندية: إذا وجدت hindiDesignCommentsSnapshots
 * - الصفحة الأخيرة: باقي صور التصميم
 */
const OrderPrintLayout = forwardRef<HTMLDivElement, OrderPrintLayoutProps>(
  ({ order, printableImages, designComments, designCommentsSnapshots = [], hindiDesignCommentsSnapshots }, ref) => {

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

    // تحديد صور التصميم المتبقية (صور الطلب المحددة من قِبَل المستخدم)
    // ملاحظة: printableImages (صور الطلب) و designCommentsSnapshots (صور Canvas المرسومة)
    // مصفوفتان مستقلتان تماماً، لذا نعرض جميع الصور المحددة دون حذف أي منها
    const getRemainingDesignImages = () => {
      return printableImages
    }

    // تصفية تعليقات التصميم لاستبعاد الخلف والأمام المستخدمين
    const getFilteredDesignComments = () => {
      const frontImgUrl = getFrontPageImage()
      const backImgUrl = getFirstPageImage()

      return designCommentsSnapshots.filter(snapshot =>
        snapshot.imageDataUrl !== frontImgUrl && snapshot.imageDataUrl !== backImgUrl
      )
    }

    // للتشخيص - عناوين الـ snapshots المتاحة
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Hindi Debug] designCommentsSnapshots titles:', designCommentsSnapshots.map(s => s.title))
      console.log('[Hindi Debug] hindiDesignCommentsSnapshots titles:', hindiDesignCommentsSnapshots?.map(s => s.title))
    }

    // الحصول على صورة الخلف الهندية مباشرةً من hindiDesignCommentsSnapshots
    const getHindiBackUrl = (): string | null => {
      if (!hindiDesignCommentsSnapshots?.length) return null
      // محاولة 1: البحث بالعنوان
      const byTitle = hindiDesignCommentsSnapshots.find(h =>
        h.title.includes('الخلف') || h.title.includes('خلف') || h.title.toLowerCase().includes('back')
      )
      if (byTitle) return byTitle.imageDataUrl
      // محاولة 2: البحث بمطابقة ID مع الـ snapshot الأصلي
      const backSnap = designCommentsSnapshots.find(s =>
        s.title.includes('الخلف') || s.title.includes('خلف') || s.title.toLowerCase().includes('back')
      )
      if (backSnap) {
        const byId = hindiDesignCommentsSnapshots.find(h => h.id === backSnap.id + '_hi')
        if (byId) return byId.imageDataUrl
      }
      // لم يوجد نسخة هندية للخلف → null (سيُستخدم الخلف العربي)
      return null
    }

    // الحصول على صورة الأمام الهندية مباشرةً من hindiDesignCommentsSnapshots
    const getHindiFrontUrl = (): string | null => {
      if (!hindiDesignCommentsSnapshots?.length) return null
      // محاولة 1: البحث بالعنوان
      const byTitle = hindiDesignCommentsSnapshots.find(h =>
        h.title.includes('الأمام') || h.title.includes('أمام') || h.title.toLowerCase().includes('front')
      )
      if (byTitle) return byTitle.imageDataUrl
      // محاولة 2: البحث بمطابقة ID مع الـ snapshot الأصلي
      const frontSnap = designCommentsSnapshots.find(s =>
        s.title.includes('الأمام') || s.title.includes('أمام') || s.title.toLowerCase().includes('front')
      )
      if (frontSnap) {
        const byId = hindiDesignCommentsSnapshots.find(h => h.id === frontSnap.id + '_hi')
        if (byId) return byId.imageDataUrl
      }
      // لم يوجد نسخة هندية للأمام → null (سيُستخدم الأمام العربي)
      return null
    }

    const allNotes = getAllNotes()

    // دالة لرسم الصفحة الأولى (مع إمكانية تمرير صورة خلف بديلة)
    const renderMainPage = (backImageUrl: string | null) => (
      <div className="print-page page-front">
        {/* القسم العلوي - المعلومات الأساسية */}
        <div className="print-header">
          {/* السطر الأول: اسم المحل + التواريخ */}
          <div className="print-header-top">
            <div className="header-item header-right header-dates">
              {order.proof_delivery_date && (
                <div className="date-row" style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '1.2em' }}>
                  <span>موعد تسليم البروفا: </span>
                  <span>{formatDate(order.proof_delivery_date)}</span>
                </div>
              )}
              <div className="date-row" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '1.2em' }}>
                <span>موعد التسليم النهائي: </span>
                <span>{formatDate(order.due_date)}</span>
              </div>
            </div>
            <div className="header-item" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '40px', paddingLeft: '25%' }}>
              <h1 className="print-brand" style={{ margin: 0 }}>ياسمين الشام</h1>
            </div>
          </div>

          {/* معلومات العميل في صف أفقي واحد */}
          <div className="print-order-info">
            <div className="info-grid-single-row" style={{ fontSize: '1.3em' }}>
              <div className="info-item-inline">
                <span className="info-label">الاسم:</span>
                <span
                  className="info-value"
                  style={
                    order.is_flagged
                      ? { color: '#dc2626', fontWeight: 'bold' }
                      : order.price > 1000
                      ? { color: '#b8860b', fontWeight: 'bold' }
                      : undefined
                  }
                >
                  {order.client_name}
                </span>
              </div>
              <div className="info-item-inline">
                <span className="info-label">رقم الهاتف:</span>
                <span className="info-value" dir="ltr">{order.client_phone}</span>
              </div>
              <div className="info-item-inline">
                <span className="info-label">رقم الطلب:</span>
                <span className="info-value">#{order.order_number || order.id.slice(0, 8)}</span>
              </div>
              <div className="info-item-inline">
                <span className="info-label">تاريخ الطلب:</span>
                <span className="info-value">{formatDate(order.order_received_date || order.created_at)}</span>
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

            {/* قسم نوع القماش */}
            {order.fabric && (
              <div className="print-fabric-type print-additional-notes" style={{ marginBottom: '15px' }}>
                <h2 className="section-title section-title-compact">نوع القماش</h2>
                <div className="additional-notes-list">
                  <div className="additional-note-item">
                    <span className="note-number">1.</span>
                    <div className="note-content">
                      <span className="note-text font-bold text-gray-800">{order.fabric}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

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

          {/* الجزء الأيسر - صورة الخلف */}
          <div className="print-comments">
            <h3 className="section-title section-title-compact" style={{ textAlign: 'center', marginBottom: '10px' }}>Back</h3>
            <div className="comments-box">
              {backImageUrl ? (
                <div className="first-images-grid first-images-single">
                  <div className="first-image-container first-image-single">
                    <img
                      src={backImageUrl}
                      alt="صورة التصميم"
                      className="first-design-image"
                    />
                  </div>
                </div>
              ) : (
                <div className="empty-comments" />
              )}
            </div>
          </div>
        </div>

        {/* تذييل الصفحة - الموقع ورقم الهاتف */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px', marginTop: '6px', display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>
            <span dir="ltr">www.yasmin-alsham.fashion</span>
          </div>
          <div style={{ marginRight: 'auto', fontSize: '11px', color: '#6b7280' }}>
            <span>رقم الهاتف: </span>
            <span dir="ltr">0598862609</span>
          </div>
        </div>
      </div>
    )

    // دالة لرسم صفحة الأمام (مع إمكانية تمرير صورة أمام بديلة)
    const renderFrontPage = (frontImageUrl: string | null) => {
      if (!frontImageUrl) return null
      return (
        <div className="print-page page-front-image">
          <h3 className="section-title section-title-compact" style={{ textAlign: 'center', marginBottom: '10px' }}>Front</h3>
          <div className="design-comment-full">
            <div className="design-comment-image-wrapper">
              <img
                src={frontImageUrl}
                alt="صورة الأمام"
                className="design-comment-full-image"
              />
            </div>
          </div>
        </div>
      )
    }

    const hindiBackUrl = getHindiBackUrl() || getFirstPageImage()
    const hindiFrontUrl = getHindiFrontUrl() || getFrontPageImage()

    return (
      <div ref={ref} className="print-layout" dir="rtl">
        {/* ========== الصفحة الأولى - معلومات + مقاسات + صورة الخلف ========== */}
        {renderMainPage(getFirstPageImage())}

        {/* ========== الصفحة الثانية - صورة الأمام (إن وجدت) ========== */}
        {renderFrontPage(getFrontPageImage())}

        {/* ========== صفحات تعليقات التصميم (كل تعليق في صفحة منفصلة) ========== */}
        {getFilteredDesignComments().map((snapshot) => (
          <div key={snapshot.id} className="print-page design-comment-page">
            <div className="design-comment-full">
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

        {/* ========== النسخة الهندية - تكرار كامل للطلب مع صور التصميم الهندية فقط ========== */}
        {hindiDesignCommentsSnapshots && hindiDesignCommentsSnapshots.length > 0 && (
          <>
            {renderMainPage(hindiBackUrl)}
            {renderFrontPage(hindiFrontUrl)}
          </>
        )}

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

