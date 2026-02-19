'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  Search,
  Package,
  User,
  DollarSign
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { getDeliveredOrdersIncome } from '@/lib/services/simple-accounting-service'
import type { Income } from '@/types/simple-accounting'

function IncomePageContent() {
  const [income, setIncome] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<Date | null>(null)

  useEffect(() => {
    const loadIncome = async () => {
      try {
        const data = await getDeliveredOrdersIncome('tailoring')
        setIncome(data)
      } catch (error) {
        console.error('Error loading income:', error)
      } finally {
        setLoading(false)
      }
    }
    loadIncome()
  }, [])

  const filteredIncome = income.filter(item => {
    const matchesSearch = item.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    if (dateFilter) {
      const itemDate = new Date(item.date)
      matchesDate = itemDate.getDate() === dateFilter.getDate() &&
        itemDate.getMonth() === dateFilter.getMonth() &&
        itemDate.getFullYear() === dateFilter.getFullYear()
    }

    return matchesSearch && matchesDate
  })

  const totalIncome = filteredIncome.reduce((sum, item) => sum + item.amount, 0)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA').format(amount) + ' ر.س'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/dashboard/accounting/tailoring"
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">الواردات</h1>
                <p className="text-gray-500">الإيرادات من الطلبات المسلمة</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ملخص */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 mb-1">إجمالي الواردات</p>
              <p className="text-3xl font-bold">{formatCurrency(totalIncome)}</p>
            </div>
            <div className="text-left">
              <p className="text-emerald-100 mb-1">عدد الطلبات</p>
              <p className="text-3xl font-bold">{filteredIncome.length}</p>
            </div>
          </div>
        </motion.div>

        {/* فلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث باسم العميل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <div className="relative w-full">
                <DatePicker
                  selected={dateFilter}
                  onChange={(date: Date | null) => setDateFilter(date)}
                  dateFormat="yyyy/MM/dd"
                  placeholderText="اختر التاريخ"
                  className="w-full pr-10 pl-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-right"
                  isClearable
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* قائمة الواردات */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          {loading ? (
            <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
          ) : filteredIncome.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">لا توجد واردات</p>
              <p className="text-gray-400 text-sm">ستظهر هنا تلقائياً عند تسليم الطلبات</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredIncome.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <User className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{item.customer_name}</h4>
                        <p className="text-sm text-gray-500">{item.description}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(item.date)}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-bold text-emerald-600">{formatCurrency(item.amount)}</p>
                      {item.is_automatic && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          تلقائي
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ملاحظة */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-center"
        >
          <p className="text-blue-700 text-sm">
            💡 الواردات تُضاف تلقائياً من الطلبات التي تم تسليمها
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default function IncomePage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <IncomePageContent />
    </ProtectedRoute>
  )
}

