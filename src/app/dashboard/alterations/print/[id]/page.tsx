'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { alterationService, Alteration } from '@/lib/services/alteration-service'
import { Loader2, ArrowLeft, Printer } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AlterationPrintPage() {
  const router = useRouter()
  const params = useParams()
  const alterationId = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [alteration, setAlteration] = useState<Alteration | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAlteration = async () => {
      try {
        const { data, error } = await alterationService.getById(alterationId)
        if (error) {
          toast.error(error)
          router.push('/dashboard/alterations')
          return
        }
        setAlteration(data)
      } catch (error: any) {
        toast.error(error.message)
        router.push('/dashboard/alterations')
      } finally {
        setIsLoading(false)
      }
    }

    loadAlteration()
  }, [alterationId, router])

  const handlePrint = () => {
    window.print()
  }

  // تنسيق التاريخ بصيغة يوم\شهر\سنة
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}\\${month}\\${year}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-pink-500 animate-spin" />
      </div>
    )
  }

  if (!alteration) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 print-container">
      {/* أزرار التحكم - تظهر فقط على الشاشة */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-pink-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>رجوع</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
          >
            <Printer className="w-5 h-5" />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* محتوى الطباعة */}
      <div ref={printRef} className="print-layout" dir="rtl">
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
                <span>{formatDate(alteration.order_received_date || alteration.created_at)}</span>
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
                  <span className="info-value">{alteration.client_name}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">رقم الهاتف:</span>
                  <span className="info-value" dir="ltr">{alteration.client_phone}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">موعد التسليم:</span>
                  <span className="info-value">{formatDate(alteration.alteration_due_date)}</span>
                </div>
                <div className="info-item-inline">
                  <span className="info-label">رقم التعديل:</span>
                  <span className="info-value">#{alteration.alteration_number}</span>
                </div>
              </div>
            </div>
          </div>

          {/* القسم السفلي - بعرض كامل */}
          <div className="print-alteration-content">
            {/* قسم وصف التعديل المطلوب */}
            <div className="print-measurements">
              <h2 className="section-title section-title-compact">وصف التعديل المطلوب</h2>
              <div className="additional-notes-list">
                {alteration.notes && alteration.notes.trim() ? (
                  <div className="additional-note-item">
                    <span className="note-text">{alteration.notes}</span>
                  </div>
                ) : (
                  <div className="additional-note-item additional-note-empty">
                    <span className="note-text">لا توجد ملاحظات</span>
                  </div>
                )}
              </div>
            </div>

            {/* قسم السعر - يظهر فقط للفساتين الخارجية */}
            {!alteration.original_order_id && (
              <div className="print-additional-notes">
                <h2 className="section-title section-title-compact">معلومات الدفع</h2>
                <div className="payment-info">
                  <div className="payment-item">
                    <span className="payment-label">السعر الإجمالي:</span>
                    <span className="payment-value">{alteration.price.toFixed(2)} ر.س</span>
                  </div>
                  <div className="payment-item">
                    <span className="payment-label">المبلغ المدفوع:</span>
                    <span className="payment-value paid">{alteration.paid_amount.toFixed(2)} ر.س</span>
                  </div>
                  <div className="payment-item">
                    <span className="payment-label">المتبقي:</span>
                    <span className="payment-value remaining">
                      {(alteration.price - alteration.paid_amount).toFixed(2)} ر.س
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  )
}

