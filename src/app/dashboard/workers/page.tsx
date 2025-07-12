'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useDataStore, Worker } from '@/store/dataStore'
import { useTranslation } from '@/hooks/useTranslation'
import { 
  ArrowRight, 
  Users, 
  Search, 
  Plus,
  Edit,
  Trash2,
  Star,
  Package,
  CheckCircle,
  XCircle,
  User,
  Phone,
  Mail
} from 'lucide-react'

export default function WorkersPage() {
  const { user } = useAuthStore()
  const { workers, addWorker, updateWorker, deleteWorker, orders } = useDataStore()
  const { t, isArabic } = useTranslation()
  const router = useRouter()

  // التحقق من الصلاحيات
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/dashboard')
    }
  }, [user, router])

  const [searchTerm, setSearchTerm] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newWorker, setNewWorker] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    specialty: ''
  })
  const [editingWorker, setEditingWorker] = useState<any>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // إضافة عامل جديد
  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newWorker.email || !newWorker.password || !newWorker.full_name || !newWorker.phone || !newWorker.specialty) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      addWorker({
        email: newWorker.email,
        password: newWorker.password,
        full_name: newWorker.full_name,
        phone: newWorker.phone,
        specialty: newWorker.specialty,
        is_active: true
      })

      setMessage({ type: 'success', text: t('worker_added_success') })
      setNewWorker({
        email: '',
        password: '',
        full_name: '',
        phone: '',
        specialty: ''
      })
      setShowAddForm(false)

    } catch (error) {
      setMessage({ type: 'error', text: t('error_adding_worker') })
    } finally {
      setIsSubmitting(false)
    }
  }

  // تعديل عامل
  const handleEditWorker = (worker: any) => {
    setEditingWorker({
      ...worker,
      password: '' // Don't show current password
    })
    setShowEditModal(true)
  }

  // حفظ تعديلات العامل
  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!editingWorker || !editingWorker.email || !editingWorker.full_name || !editingWorker.phone || !editingWorker.specialty) {
      setMessage({ type: 'error', text: t('fill_required_fields') })
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))

      const updates: any = {
        email: editingWorker.email,
        full_name: editingWorker.full_name,
        phone: editingWorker.phone,
        specialty: editingWorker.specialty,
        is_active: editingWorker.is_active
      }

      // Add password only if it was changed
      if (editingWorker.password) {
        updates.password = editingWorker.password
      }

      updateWorker(editingWorker.id, updates)

      setMessage({ type: 'success', text: t('worker_updated_success') })
      setShowEditModal(false)
      setEditingWorker(null)

    } catch (error) {
      setMessage({ type: 'error', text: t('error_updating_worker') })
    } finally {
      setIsSubmitting(false)
    }
  }

  // حذف عامل
  const handleDeleteWorker = (workerId: string) => {
    if (confirm(t('confirm_delete_worker'))) {
      deleteWorker(workerId)
      setMessage({ type: 'success', text: t('worker_deleted_success') })
    }
  }

  // تبديل حالة العامل
  const toggleWorkerStatus = (workerId: string, currentStatus: boolean) => {
    updateWorker(workerId, { is_active: !currentStatus })
    setMessage({
      type: 'success',
      text: currentStatus ? t('worker_deactivated') : t('worker_activated')
    })
  }

  // حساب عدد الطلبات المكتملة لكل عامل
  const getWorkerCompletedOrders = (workerId: string) => {
    return orders.filter(order =>
      order.assignedWorker === workerId && order.status === 'completed'
    ).length
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ar-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const filteredWorkers = workers.filter(worker =>
    worker.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    worker.specialty.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">{t('checking_permissions')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('back_to_dashboard')}</span>
          </Link>
        </motion.div>

        {/* العنوان والأزرار */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                {t('workers_management')}
              </span>
            </h1>
            <p className="text-lg text-gray-600">
              {t('view_manage_team')}
            </p>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary inline-flex items-center justify-center space-x-2 space-x-reverse px-6 py-3 group"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
            <span>{t('add_new_worker')}</span>
          </button>
        </motion.div>

        {/* البحث */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 mb-8"
        >
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300"
              placeholder={t('search_workers_placeholder')}
            />
          </div>
        </motion.div>

        {/* رسالة النجاح/الخطأ */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg flex items-center space-x-3 space-x-reverse ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span>{message.text}</span>
          </motion.div>
        )}

        {/* نموذج إضافة عامل جديد */}
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">{t('add_new_worker_form')}</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddWorker} className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('full_name_required')}
                </label>
                <input
                  type="text"
                  value={newWorker.full_name}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('enter_full_name')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('email_required')}
                </label>
                <input
                  type="email"
                  value={newWorker.email}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('enter_email')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('password_required')}
                </label>
                <input
                  type="password"
                  value={newWorker.password}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('enter_password')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('phone_required_worker')}
                </label>
                <input
                  type="tel"
                  value={newWorker.phone}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('enter_phone')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('specialty_required')}
                </label>
                <input
                  type="text"
                  value={newWorker.specialty}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, specialty: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder={t('specialty_example')}
                  required
                />
              </div>

              <div className="md:col-span-2 flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary py-3 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('adding') : t('add_worker')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn-secondary py-3 px-6"
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* نافذة تعديل العامل */}
        {showEditModal && editingWorker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-800">{t('edit_worker')}</h3>
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveWorker} className="p-6 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('full_name_required')}
                    </label>
                    <input
                      type="text"
                      value={editingWorker.full_name}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, full_name: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('email_required')}
                    </label>
                    <input
                      type="email"
                      value={editingWorker.email}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('new_password')}
                    </label>
                    <input
                      type="password"
                      value={editingWorker.password}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      placeholder={t('leave_empty_no_change')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('phone_required_worker')}
                    </label>
                    <input
                      type="tel"
                      value={editingWorker.phone}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('specialty_required')}
                    </label>
                    <input
                      type="text"
                      value={editingWorker.specialty}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, specialty: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('status')}
                    </label>
                    <select
                      value={editingWorker.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setEditingWorker((prev: any) => ({ ...prev, is_active: e.target.value === 'active' }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    >
                      <option value="active">{t('active')}</option>
                      <option value="inactive">{t('inactive')}</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary py-3 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? t('saving') : t('save_changes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn-secondary py-3 px-6"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* قائمة العمال */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="grid lg:grid-cols-2 gap-6 mb-12"
        >
          {filteredWorkers.length === 0 ? (
            <div className="lg:col-span-2 text-center py-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-pink-100">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-600 mb-2">{t('no_workers')}</h3>
              <p className="text-gray-500">{t('no_workers_found')}</p>
            </div>
          ) : (
            filteredWorkers.map((worker, index) => (
              <motion.div
                key={worker.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`bg-white/80 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 hover:shadow-lg ${
                  worker.is_active ? 'border-pink-100' : 'border-gray-200 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-4 space-x-reverse">
                    <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{worker.full_name}</h3>
                      <p className="text-sm text-pink-600 font-medium">{worker.specialty}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 space-x-reverse">
                    {worker.is_active ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center space-x-1 space-x-reverse">
                        <CheckCircle className="w-3 h-3" />
                        <span>{t('active')}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium flex items-center space-x-1 space-x-reverse">
                        <XCircle className="w-3 h-3" />
                        <span>{t('inactive')}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center space-x-2 space-x-reverse text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span>{worker.email}</span>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{worker.phone}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 mb-6">
                  <div className="text-center p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{getWorkerCompletedOrders(worker.id)}</div>
                    <div className="text-xs text-gray-600">{t('completed_orders')}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-4">
                  {t('joined_on')} {formatDate(worker.createdAt)}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditWorker(worker)}
                    className="flex-1 btn-secondary py-2 text-sm inline-flex items-center justify-center space-x-1 space-x-reverse"
                  >
                    <Edit className="w-4 h-4" />
                    <span>{t('edit')}</span>
                  </button>
                  <button
                    onClick={() => toggleWorkerStatus(worker.id, worker.is_active)}
                    className={`px-3 py-2 text-sm rounded-lg transition-all duration-300 ${
                      worker.is_active
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {worker.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDeleteWorker(worker.id)}
                    className="px-3 py-2 text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-all duration-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* إحصائيات سريعة */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-blue-600 mb-1">
              {workers.length}
            </div>
            <div className="text-sm text-gray-600">{t('total_workers')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-green-600 mb-1">
              {workers.filter(w => w.is_active).length}
            </div>
            <div className="text-sm text-gray-600">{t('active_workers')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-purple-600 mb-1">
              {workers.reduce((sum, w) => sum + getWorkerCompletedOrders(w.id), 0)}
            </div>
            <div className="text-sm text-gray-600">{t('total_completed_orders')}</div>
          </div>

          <div className="text-center p-6 bg-white/80 backdrop-blur-sm rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-yellow-600 mb-1">
              {workers.filter(w => w.is_active).length}
            </div>
            <div className="text-sm text-gray-600">{t('active_workers')}</div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
