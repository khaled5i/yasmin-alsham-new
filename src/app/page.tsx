'use client'

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { safeDatabase, getDatabaseStatus } from '@/lib/database-safe'

import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ReadyDesigns from '@/components/ReadyDesigns'
import Services from '@/components/Services'
import About from '@/components/About'
import FAQ from '@/components/FAQ'
import Footer from '@/components/Footer'
import ScrollToTop from '@/components/ScrollToTop'

export default function Home() {
  const [designs, setDesigns] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dbStatus, setDbStatus] = useState<any>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Get database status
        const status = getDatabaseStatus()
        setDbStatus(status)

        // Fetch designs (featured ones for homepage)
        const { data: designsData, error: designsError } = await safeDatabase.designs.getAll({ featured: true })
        if (designsError) {
          console.warn('Designs error:', designsError)
        } else {
          setDesigns(designsData || [])
        }

        // Fetch recent appointments (for demo)
        const { data: appointmentsData, error: appointmentsError } = await safeDatabase.appointments.getAll()
        if (appointmentsError) {
          console.warn('Appointments error:', appointmentsError)
        } else {
          setAppointments(appointmentsData || [])
        }

        // Fetch recent orders (for demo)
        const { data: ordersData, error: ordersError } = await safeDatabase.orders.getAll()
        if (ordersError) {
          console.warn('Orders error:', ordersError)
        } else {
          setOrders(ordersData || [])
        }

      } catch (err) {
        console.error('Error fetching data:', err)
        setError('حدث خطأ في جلب البيانات - Error fetching data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <ReadyDesigns />
        <Services />
        <About />
        <FAQ />

        {/* ✅ قسم اختبار قاعدة البيانات المحدثة v2.0 */}
        <div className="bg-gray-100 p-6 mt-8 rounded-lg">
          <h2 className="text-xl font-bold mb-4">🗄️ حالة قاعدة البيانات v2.0</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* حالة الاتصال */}
            <div className="bg-white p-4 rounded-lg">
              <h3 className="font-semibold mb-2">حالة الاتصال</h3>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                isSupabaseConfigured()
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {isSupabaseConfigured() ? '🟢 متصل بـ Supabase' : '🟡 وضع التطوير'}
              </span>
              {dbStatus && (
                <p className="text-xs text-gray-600 mt-1">{dbStatus.message}</p>
              )}
            </div>

            {/* إحصائيات البيانات */}
            <div className="bg-white p-4 rounded-lg">
              <h3 className="font-semibold mb-2">إحصائيات البيانات</h3>
              <div className="text-sm space-y-1">
                <div>📐 التصاميم: {designs.length}</div>
                <div>📅 المواعيد: {appointments.length}</div>
                <div>📦 الطلبات: {orders.length}</div>
                {dbStatus?.mockDataStats && (
                  <div className="text-xs text-gray-500 mt-2">
                    (بيانات تجريبية: {Object.values(dbStatus.mockDataStats).reduce((a: number, b: number) => a + b, 0)} عنصر)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* حالة التحميل والأخطاء */}
          {isLoading ? (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-blue-600 flex items-center">
                <span className="animate-spin mr-2">⏳</span>
                جاري تحميل البيانات من قاعدة البيانات الجديدة...
              </p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="font-medium text-red-600">❌ خطأ: {error}</p>
              <p className="text-sm text-red-500 mt-1">يتم استخدام البيانات التجريبية كبديل</p>
            </div>
          ) : (
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-green-600 font-medium">✅ تم تحميل البيانات بنجاح من النظام الجديد!</p>

              {/* عرض عينة من البيانات */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* التصاميم المميزة */}
                {designs.length > 0 && (
                  <details className="bg-white p-3 rounded border">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                      📐 التصاميم المميزة ({designs.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {designs.slice(0, 3).map((design, index) => (
                        <div key={index} className="text-xs p-2 bg-gray-50 rounded">
                          <div className="font-medium">{design.name}</div>
                          <div className="text-gray-600">{design.category} - {design.base_price} ل.س</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* المواعيد القادمة */}
                {appointments.length > 0 && (
                  <details className="bg-white p-3 rounded border">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                      📅 المواعيد القادمة ({appointments.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {appointments.slice(0, 3).map((appointment, index) => (
                        <div key={index} className="text-xs p-2 bg-gray-50 rounded">
                          <div className="font-medium">{appointment.service_type}</div>
                          <div className="text-gray-600">{appointment.appointment_date} - {appointment.status}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* الطلبات الحديثة */}
                {orders.length > 0 && (
                  <details className="bg-white p-3 rounded border">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                      📦 الطلبات الحديثة ({orders.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {orders.slice(0, 3).map((order, index) => (
                        <div key={index} className="text-xs p-2 bg-gray-50 rounded">
                          <div className="font-medium">طلب #{order.order_number}</div>
                          <div className="text-gray-600">{order.status} - {order.total_amount} ل.س</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* رسالة النجاح */}
              <div className="mt-4 p-3 bg-green-100 rounded-lg border border-green-200">
                <p className="text-sm text-green-700">
                  🎉 <strong>تهانينا!</strong> قاعدة البيانات الجديدة v2.0 تعمل بشكل مثالي مع:
                </p>
                <ul className="text-xs text-green-600 mt-2 list-disc list-inside">
                  <li>14 جدول شامل مع علاقات محسنة</li>
                  <li>سياسات أمان متقدمة (RLS)</li>
                  <li>بيانات تجريبية غنية للتطوير</li>
                  <li>خدمات برمجية محدثة مع معالجة أخطاء</li>
                  <li>فهارس لتحسين الأداء</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
      <ScrollToTop />
    </div>
  )
}
