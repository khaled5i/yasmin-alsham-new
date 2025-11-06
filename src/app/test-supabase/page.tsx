'use client'

import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured, testSupabaseConnection, getSupabaseStatus } from '@/lib/supabase'
import { CheckCircle, XCircle, AlertCircle, Database, Wifi } from 'lucide-react'

export default function TestSupabasePage() {
  const [status, setStatus] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [testResults, setTestResults] = useState<any>(null)

  useEffect(() => {
    checkSupabase()
  }, [])

  const checkSupabase = async () => {
    setIsLoading(true)
    
    // 1. التحقق من التهيئة
    const configured = isSupabaseConfigured()
    
    // 2. الحصول على الحالة
    const statusInfo = getSupabaseStatus()
    
    // 3. اختبار الاتصال
    const connectionTest = await testSupabaseConnection()
    
    // 4. محاولة جلب البيانات
    let usersTest = { success: false, error: null, count: 0 }
    let workersTest = { success: false, error: null, count: 0 }
    
    try {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
      
      if (usersError) {
        usersTest.error = usersError.message
      } else {
        usersTest.success = true
        usersTest.count = users?.length || 0
      }
    } catch (error: any) {
      usersTest.error = error.message
    }
    
    try {
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('*, user:users(*)', { count: 'exact' })
      
      if (workersError) {
        workersTest.error = workersError.message
      } else {
        workersTest.success = true
        workersTest.count = workers?.length || 0
      }
    } catch (error: any) {
      workersTest.error = error.message
    }
    
    setStatus(statusInfo)
    setTestResults({
      configured,
      connection: connectionTest,
      users: usersTest,
      workers: workersTest
    })
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-20 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center gap-4 mb-8">
            <Database className="w-10 h-10 text-pink-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-800">اختبار اتصال Supabase</h1>
              <p className="text-gray-600">تحقق من حالة الاتصال بقاعدة البيانات</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">جاري الاختبار...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* حالة التهيئة */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  {testResults?.configured ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <h2 className="text-xl font-bold">1. التهيئة (Configuration)</h2>
                </div>
                <div className="bg-gray-50 rounded p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">الحالة:</span>{' '}
                    {testResults?.configured ? (
                      <span className="text-green-600">✅ تم التهيئة بنجاح</span>
                    ) : (
                      <span className="text-red-600">❌ لم يتم التهيئة</span>
                    )}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">URL:</span>{' '}
                    <code className="bg-white px-2 py-1 rounded text-xs">
                      {status?.url || 'غير محدد'}
                    </code>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">ANON KEY:</span>{' '}
                    <code className="bg-white px-2 py-1 rounded text-xs">
                      {status?.hasAnonKey ? '✅ موجود' : '❌ غير موجود'}
                    </code>
                  </p>
                </div>
              </div>

              {/* اختبار الاتصال */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  {testResults?.connection?.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <h2 className="text-xl font-bold">2. اختبار الاتصال (Connection Test)</h2>
                </div>
                <div className="bg-gray-50 rounded p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">الحالة:</span>{' '}
                    {testResults?.connection?.success ? (
                      <span className="text-green-600">✅ الاتصال ناجح</span>
                    ) : (
                      <span className="text-red-600">❌ فشل الاتصال</span>
                    )}
                  </p>
                  {testResults?.connection?.error && (
                    <p className="text-sm text-red-600">
                      <span className="font-medium">الخطأ:</span> {testResults.connection.error}
                    </p>
                  )}
                </div>
              </div>

              {/* جدول Users */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  {testResults?.users?.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <h2 className="text-xl font-bold">3. جدول Users</h2>
                </div>
                <div className="bg-gray-50 rounded p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">الحالة:</span>{' '}
                    {testResults?.users?.success ? (
                      <span className="text-green-600">✅ يمكن الوصول للجدول</span>
                    ) : (
                      <span className="text-red-600">❌ لا يمكن الوصول للجدول</span>
                    )}
                  </p>
                  {testResults?.users?.success && (
                    <p className="text-sm">
                      <span className="font-medium">عدد المستخدمين:</span>{' '}
                      <span className="text-blue-600 font-bold">{testResults.users.count}</span>
                    </p>
                  )}
                  {testResults?.users?.error && (
                    <p className="text-sm text-red-600">
                      <span className="font-medium">الخطأ:</span> {testResults.users.error}
                    </p>
                  )}
                </div>
              </div>

              {/* جدول Workers */}
              <div className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  {testResults?.workers?.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <h2 className="text-xl font-bold">4. جدول Workers</h2>
                </div>
                <div className="bg-gray-50 rounded p-4 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">الحالة:</span>{' '}
                    {testResults?.workers?.success ? (
                      <span className="text-green-600">✅ يمكن الوصول للجدول</span>
                    ) : (
                      <span className="text-red-600">❌ لا يمكن الوصول للجدول</span>
                    )}
                  </p>
                  {testResults?.workers?.success && (
                    <p className="text-sm">
                      <span className="font-medium">عدد العمال:</span>{' '}
                      <span className="text-blue-600 font-bold">{testResults.workers.count}</span>
                    </p>
                  )}
                  {testResults?.workers?.error && (
                    <p className="text-sm text-red-600">
                      <span className="font-medium">الخطأ:</span> {testResults.workers.error}
                    </p>
                  )}
                </div>
              </div>

              {/* النتيجة النهائية */}
              <div className={`border-2 rounded-lg p-6 ${
                testResults?.configured && testResults?.connection?.success && testResults?.users?.success && testResults?.workers?.success
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
              }`}>
                <div className="flex items-center gap-3">
                  {testResults?.configured && testResults?.connection?.success && testResults?.users?.success && testResults?.workers?.success ? (
                    <>
                      <CheckCircle className="w-8 h-8 text-green-600" />
                      <div>
                        <h3 className="text-xl font-bold text-green-800">✅ جميع الاختبارات نجحت!</h3>
                        <p className="text-green-700">Supabase متصل ويعمل بشكل صحيح</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-8 h-8 text-red-600" />
                      <div>
                        <h3 className="text-xl font-bold text-red-800">❌ هناك مشاكل في الاتصال</h3>
                        <p className="text-red-700">يرجى مراجعة الأخطاء أعلاه</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* زر إعادة الاختبار */}
              <div className="text-center">
                <button
                  onClick={checkSupabase}
                  className="bg-pink-600 text-white px-8 py-3 rounded-lg hover:bg-pink-700 transition-colors duration-300 inline-flex items-center gap-2"
                >
                  <Wifi className="w-5 h-5" />
                  إعادة الاختبار
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

