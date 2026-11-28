'use client'

import { hasRefinedSummary, originalSummary, printableSummaryNotes, savedHindiSummary } from '@/lib/design-summary-text'
import { forwardRef } from 'react'
import { Order } from '@/lib/services/order-service'
import { parseDateForDisplay, shiftDate } from '@/lib/date-utils'
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
  designCommentsSnapshots?: DesignCommentSnapshot[] // قائمة التعليقات المتعددة
  selectedSummaryNoteIds?: string[] // معرّفات نصوص ملخص التصميم المحددة للطباعة (إن لم تُمرّر تُطبع الكل)
}

const OrderPrintLayout = forwardRef<HTMLDivElement, OrderPrintLayoutProps>(
  ({ order, printableImages, designCommentsSnapshots = [], selectedSummaryNoteIds }, ref) => {

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
        s.title.includes('أمام') || s.title.includes('امام') || s.title.toLowerCase().includes('front')
      )

      const firstAvailable = printableImages.find(img => img !== frontSnapshot?.imageDataUrl)
      return firstAvailable || printableImages[0] || null
    }

    // تحديد صورة الأمام للصفحة الثانية
    const getFrontPageImage = () => {
      // البحث عن صورة الأمام بشكل صريح
      const frontSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('أمام') || s.title.includes('امام') || s.title.toLowerCase().includes('front')
      )
      if (frontSnapshot) return frontSnapshot.imageDataUrl

      // إذا لم توجد صورة أمام صريحة، نستخدم أول صورة تعليق ليست "خلف"
      const backSnapshot = designCommentsSnapshots.find(s =>
        s.title.includes('الخلف') || s.title.includes('خلف') || s.title.toLowerCase().includes('back')
      )

      const candidate = designCommentsSnapshots.find(s => s !== backSnapshot)
      return candidate?.imageDataUrl || null
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

    const selectedNotes = printableSummaryNotes(order).filter(
      note => !selectedSummaryNoteIds || selectedSummaryNoteIds.includes(note.id)
    )
    const refinedNotes = selectedNotes.filter(hasRefinedSummary)
    const printText = (value: string) => value.replace(/<end>/gi, '\n').trim()

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
                  <span>{order.has_second_proof ? 'البروفا الأولى: ' : 'البروفا: '}</span>
                  <span>{formatDate(order.proof_delivery_date)}</span>
                </div>
              )}
              {order.has_second_proof && order.due_date && (
                <div className="date-row" style={{ color: '#ca8a04', fontWeight: 'bold', fontSize: '1.2em' }}>
                  <span>البروفا الثانية: </span>
                  <span>{formatDate(order.second_proof_date || shiftDate(order.due_date, -1))}</span>
                </div>
              )}
              <div className="date-row" style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '1.2em' }}>
                <span>التسليم النهائي: </span>
                <span>{formatDate(order.due_date)}</span>
              </div>
            </div>
            <div className="header-item" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '40px', paddingLeft: '25%' }}>
              <h1 className="print-brand" style={{ margin: 0 }}>ياسمين الشام</h1>
            </div>
          </div>

          {/* معلومات العميل في صف أفقي واحد */}
          <div className="print-order-info">
            <div className="info-grid-single-row" style={{ fontSize: '1.3em', flexWrap: 'nowrap' }}>
              {/* النصف الأيمن: الاسم + رقم الهاتف #رقم الطلب */}
              <div style={{ flex: '0 0 50%', maxWidth: '50%', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
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
              <div className="info-item-inline" style={{ whiteSpace: 'nowrap' }}>
                <span className="info-value" dir="ltr">{order.client_phone}</span>
                <span className="info-value" dir="ltr" style={{ fontWeight: 'bold' }}>#{order.order_number || order.id.slice(0, 8)}</span>
              </div>
              </div>
              {order.taken_by && (
                <div className="info-item-inline" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <span className="info-label">استلم الطلب:</span>
                  <bdi className="info-value">{order.taken_by}</bdi>
                </div>
              )}
              <div className="info-item-inline" style={{ marginRight: 'auto' }}>
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
              <h2 className="section-title section-title-compact">
                المقاسات
                {order.measurement_source === 'external' && (
                  <span style={{ marginRight: '6px', fontWeight: 800 }}>— مقاس خارجي</span>
                )}
              </h2>
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

            {/* قسم ملاحظات إضافية - يُعرض فقط عند وجود ملاحظات، بدون عنوان */}
            {allNotes.length > 0 && (
              <div className="print-additional-notes">
                <div className="additional-notes-list">
                  {allNotes.map((note, idx) => (
                    <div key={idx} className="additional-note-item">
                      <span className="note-number">{idx + 1}.</span>
                      <div className="note-content">
                        <span className="note-text">{note.text.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && <br />}{line.trim()}</span>))}</span>
                        {note.translation && (
                          <span className="note-translation">({note.translation.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && ' '}{line.trim()}</span>))})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* قسم تعديلات البروفا الأولى - يبقى فارغاً دائماً */}
            <div className="print-proof-modifications">
              <h2 className="section-title section-title-compact">تعديلات البروفا الأولى</h2>
            </div>
          </div>

          {/* العمود الأيسر - صورة الخلف + ملخص التصميم */}
          <div className="print-right-column">
            {/* صورة الخلف */}
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

            {selectedNotes.length > 0 && (
              <section className="print-design-summary" lang="ar" dir="rtl">
                <h3 className="section-title section-title-compact">ملخص التصميم الأصلي</h3>
                <div className="design-summary-list">
                  {selectedNotes.map((note, index) => (
                    <div key={note.id} className="design-summary-item">
                      <span className="note-number">{index + 1}.</span>
                      <span className="note-text">{printText(originalSummary(note))}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
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

    return (
      <div ref={ref} className="print-layout" dir="rtl">
        {/* ========== الصفحة الأولى - معلومات + مقاسات + صورة الخلف ========== */}
        {renderMainPage(getFirstPageImage())}

        {/* ========== الصفحة الثانية - صورة الأمام (إن وجدت) ========== */}
        {renderFrontPage(getFrontPageImage())}

        {(refinedNotes.length > 0 || printableImages.length > 0) && (
          <div className="print-page design-details-page">
            {refinedNotes.length > 0 && (
              <div className="bilingual-summary" dir="rtl">
                {(['ar', 'hi'] as const).map(language => (
                  <section key={language} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    <h3 className="section-title section-title-compact">
                      {language === 'ar' ? 'ملخص التصميم المحسّن' : 'डिज़ाइन का सारांश'}
                    </h3>
                    {refinedNotes.map((note, index) => (
                      <div key={note.id} className="design-summary-item">
                        <span className="note-number">{index + 1}.</span>
                        <span className="note-text">{printText(language === 'ar'
                          ? note.transcription!
                          : savedHindiSummary(note) || 'हिंदी अनुवाद उपलब्ध नहीं है।')}</span>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
            {printableImages.length > 0 && (
              <section>
                <h2 className="section-title">صور التصميم الإضافية</h2>
                <div className="images-grid">
                  {printableImages.map((image, index) => (
                    <div key={image} className="image-container">
                      <img src={image} alt={`صورة التصميم ${index + 1}`} className="design-image" />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

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
      </div>
    )
  }
)

OrderPrintLayout.displayName = 'OrderPrintLayout'

export default OrderPrintLayout

