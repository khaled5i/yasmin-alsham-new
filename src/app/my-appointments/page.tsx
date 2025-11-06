import { Metadata } from 'next'
import GuestAppointmentLookup from '@/components/GuestAppointmentLookup'

export const metadata: Metadata = {
  title: 'مواعيدي - ياسمين الشام',
  description: 'اطلعي على مواعيدك المحجوزة في ياسمين الشام',
}

export default function MyAppointmentsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              مواعيدي
            </h1>
            <p className="text-gray-600">
              اطلعي على جميع مواعيدك المحجوزة معنا
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-12">
        <GuestAppointmentLookup />
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              هل تحتاجين مساعدة؟
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-6 text-center shadow-sm">
              <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                اتصلي بنا
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                للاستفسار عن مواعيدك أو تعديلها
              </p>
              <a 
                href="tel:+963-XXX-XXXXXX" 
                className="text-pink-600 hover:text-pink-700 font-medium"
              >
                +963-XXX-XXXXXX
              </a>
            </div>

            <div className="bg-white rounded-lg p-6 text-center shadow-sm">
              <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                واتساب
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                راسلينا عبر الواتساب
              </p>
              <a 
                href="https://wa.me/963XXXXXXXXX" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 hover:text-pink-700 font-medium"
              >
                إرسال رسالة
              </a>
            </div>

            <div className="bg-white rounded-lg p-6 text-center shadow-sm">
              <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                ساعات العمل
              </h3>
              <p className="text-gray-600 text-sm">
                الأحد - الخميس: 4:00 - 10:00 مساءً<br />
                السبت: 4:00 - 10:00 مساءً<br />
                الجمعة: مغلق
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
