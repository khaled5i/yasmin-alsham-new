'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Shirt,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Home,
  Users,
  ChevronLeft
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { getQuickStats } from '@/lib/services/simple-accounting-service'
import type { FinancialSummary } from '@/types/simple-accounting'

const sections = [
  {
    id: 'income',
    name: 'المبيعات',
    description: 'إيرادات مبيعات الفساتين الجاهزة',
    icon: TrendingUp,
    href: '/dashboard/accounting/ready-designs/income',
    color: 'from-emerald-500 to-emerald-600'
  },
  {
    id: 'purchases',
    name: 'المشتريات',
    description: 'شراء الفساتين الجاهزة',
    icon: ShoppingCart,
    href: '/dashboard/accounting/ready-designs/purchases',
    color: 'from-orange-500 to-orange-600'
  },
  {
    id: 'fixed',
    name: 'المصاريف الثابتة',
    description: 'إيجار، كهرباء، إنترنت',
    icon: Home,
    href: '/dashboard/accounting/ready-designs/fixed-expenses',
    color: 'from-blue-500 to-blue-600'
  },
  {
    id: 'salaries',
    name: 'رواتب العمال',
    description: 'رواتب ومكافآت العاملين',
    icon: Users,
    href: '/dashboard/accounting/ready-designs/salaries',
    color: 'from-purple-500 to-purple-600'
  }
]

function ReadyDesignsAccountingContent() {
  const [stats, setStats] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getQuickStats('ready_designs')
        setStats(data)
      } catch (error) {
        console.error('Error loading stats:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA').format(amount) + ' ر.س'
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
              href="/dashboard/accounting"
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                <Shirt className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">قسم الجاهز</h1>
                <p className="text-gray-500">إدارة الحسابات المالية</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* الملخص المالي */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">ملخص الشهر الحالي</h2>
          {loading ? (
            <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-emerald-50 rounded-xl">
                <TrendingUp className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">المبيعات</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(stats?.totalIncome || 0)}</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-xl">
                <TrendingDown className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">المصروفات</p>
                <p className="text-xl font-bold text-red-700">{formatCurrency(stats?.totalExpenses || 0)}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">الرواتب</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(stats?.totalSalaries || 0)}</p>
              </div>
              <div className={`text-center p-4 rounded-xl ${(stats?.netProfit || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <DollarSign className={`w-8 h-8 mx-auto mb-2 ${(stats?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                <p className="text-sm text-gray-500 mb-1">صافي الربح</p>
                <p className={`text-xl font-bold ${(stats?.netProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(stats?.netProfit || 0)}
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* أقسام المحاسبة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">الأقسام</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section, index) => (
              <Link key={section.id} href={section.href}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  whileHover={{ scale: 1.02, x: -4 }}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <section.icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 group-hover:text-teal-600 transition-colors">
                        {section.name}
                      </h3>
                      <p className="text-sm text-gray-500">{section.description}</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-teal-600 transition-colors" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default function ReadyDesignsAccountingPage() {
  return (
    <ProtectedRoute requiredRole="admin">
      <ReadyDesignsAccountingContent />
    </ProtectedRoute>
  )
}

