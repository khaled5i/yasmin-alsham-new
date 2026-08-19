"use client"

import { useState, useEffect } from "react"
import { motion } from 'framer-motion'
import { Palette, Edit2, Save, X, ArrowRight, Loader2, Plus, Trash2, Eye, EyeOff, Database, Hash, Boxes } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import Link from 'next/link'
import { fabricService, Fabric, UpdateFabricData, CreateFabricData } from '@/lib/services/fabric-service'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import { useAuthStore } from '@/store/authStore'
import { useWorkerPermissions } from '@/hooks/useWorkerPermissions'
import { formatFabricNumber } from '@/lib/fabric-number-format'

function FabricsAdminContent() {
  const { user } = useAuthStore()
  const { workerType, getDashboardRoute } = useWorkerPermissions()

  const [fabrics, setFabrics] = useState<Fabric[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Fabric>>({})
  const [colorsInput, setColorsInput] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newFabricData, setNewFabricData] = useState<Partial<Fabric>>({
    name: '',
    description: '',
    price_per_meter: 0,
    images: [],
    available_colors: [],
    is_available: true,
    is_featured: false,
    category: 'حرير'
  })
  const [newColorsInput, setNewColorsInput] = useState("")

  useEffect(() => {
    loadFabrics()
  }, [])

  const loadFabrics = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await fabricService.getAll({ include_inactive: true })
      if (error) {
        console.error('❌ خطأ في تحميل الأقمشة:', error)
        setError(error)
      } else if (data) {
        console.log(`✅ تم تحميل ${data.length} قماش`)
        setFabrics(data)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (fabric: Fabric) => {
    setEditingId(fabric.id)
    setEditData({ ...fabric })
    setColorsInput("")
    setSuccess(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
    setColorsInput("")
    setSuccess(false)
  }

  const handleEditChange = (field: keyof Fabric, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddColor = () => {
    const color = colorsInput.trim()
    if (color && !editData.available_colors?.includes(color)) {
      setEditData(prev => ({ ...prev, available_colors: [...(prev.available_colors || []), color] }))
      setColorsInput("")
    }
  }

  const handleRemoveColor = (color: string) => {
    setEditData(prev => ({ ...prev, available_colors: (prev.available_colors || []).filter(c => c !== color) }))
  }

  const handleSave = async () => {
    if (!editingId) return
    if (!editData.images || editData.images.length === 0) {
      setError('صورة القماش مطلوبة')
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      // تحديد السعر: إذا كان null أو undefined أو 0 أو فارغ، نرسل null لحذفه من قاعدة البيانات
      const priceValue = (editData.price_per_meter !== null &&
        editData.price_per_meter !== undefined &&
        editData.price_per_meter > 0)
        ? editData.price_per_meter
        : null

      const updates: UpdateFabricData = {
        name: editData.name?.trim() || null,
        description: editData.description?.trim() || null,
        price_per_meter: priceValue as any, // استخدام null بدلاً من undefined لحذف القيمة
        images: editData.images,
        image_url: editData.images?.[0],
        thumbnail_image: editData.thumbnail_image || editData.images?.[0],
        available_colors: editData.available_colors,
        category: editData.category,
        care_instructions: editData.care_instructions,
        is_available: editData.is_available,
        is_featured: editData.is_featured,
        is_on_sale: editData.is_on_sale,
        discount_percentage: editData.discount_percentage
      }

      console.log('🔄 تحديث القماش في Supabase...', editingId, 'السعر الجديد:', priceValue)
      const { data, error } = await fabricService.update(editingId, updates)

      if (error) {
        console.error('❌ خطأ في تحديث القماش:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      if (data) {
        console.log('✅ تم تحديث القماش بنجاح')
        setFabrics(prev => prev.map(f => f.id === editingId ? data : f))
        setSuccess(true)
        setTimeout(() => {
          setEditingId(null)
          setEditData({})
          setSuccess(false)
        }, 1200)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في تحديث القماش:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const startAddNew = () => {
    setIsAddingNew(true)
    setNewFabricData({
      name: '',
      description: '',
      price_per_meter: 0,
      images: [],
      available_colors: [],
      is_available: true,
      is_featured: false,
      category: 'حرير'
    })
    setNewColorsInput("")
    setSuccess(false)
    setError(null)
  }

  const cancelAddNew = () => {
    setIsAddingNew(false)
    setNewFabricData({
      name: '',
      description: '',
      price_per_meter: 0,
      images: [],
      available_colors: [],
      is_available: true,
      is_featured: false,
      category: 'حرير'
    })
    setNewColorsInput("")
    setSuccess(false)
    setError(null)
  }

  const handleNewFabricChange = (field: keyof Fabric, value: any) => {
    setNewFabricData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddNewColor = () => {
    const color = newColorsInput.trim()
    if (color && !newFabricData.available_colors?.includes(color)) {
      setNewFabricData(prev => ({ ...prev, available_colors: [...(prev.available_colors || []), color] }))
      setNewColorsInput("")
    }
  }

  const handleRemoveNewColor = (color: string) => {
    setNewFabricData(prev => ({ ...prev, available_colors: (prev.available_colors || []).filter(c => c !== color) }))
  }

  const handleCreateFabric = async () => {
    // السعر اختياري - إذا تم إدخاله يجب أن يكون صحيح
    if (newFabricData.price_per_meter && newFabricData.price_per_meter <= 0) {
      setError('يرجى إدخال سعر صحيح أو اتركه فارغاً')
      return
    }
    if (!newFabricData.images || newFabricData.images.length === 0) {
      setError('يرجى إضافة صورة واحدة على الأقل')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const createData: CreateFabricData = {
        name: newFabricData.name?.trim() || null,
        description: newFabricData.description?.trim() || null,
        price_per_meter: newFabricData.price_per_meter && newFabricData.price_per_meter > 0 ? newFabricData.price_per_meter : undefined,
        images: newFabricData.images!,
        image_url: newFabricData.images![0],
        thumbnail_image: newFabricData.thumbnail_image || newFabricData.images![0],
        available_colors: newFabricData.available_colors || [],
        category: newFabricData.category || 'حرير',
        care_instructions: newFabricData.care_instructions,
        is_available: newFabricData.is_available ?? true,
        is_featured: newFabricData.is_featured ?? false,
        is_on_sale: newFabricData.is_on_sale ?? false,
        discount_percentage: newFabricData.discount_percentage || 0
      }

      console.log('🔄 إضافة قماش جديد إلى Supabase...')
      const { data, error } = await fabricService.create(createData)

      if (error) {
        console.error('❌ خطأ في إضافة القماش:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      if (data) {
        console.log('✅ تم إضافة القماش بنجاح')
        setFabrics(prev => [data, ...prev])
        setSuccess(true)
        setTimeout(() => {
          setIsAddingNew(false)
          setNewFabricData({
            name: '',
            description: '',
            price_per_meter: 0,
            images: [],
            available_colors: [],
            is_available: true,
            is_featured: false,
            category: 'حرير'
          })
          setSuccess(false)
        }, 1200)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في إضافة القماش:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (fabricId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('🗑️ حذف القماش:', fabricId)
      const { error } = await fabricService.delete(fabricId)

      if (error) {
        console.error('❌ خطأ في حذف القماش:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      console.log('✅ تم حذف القماش بنجاح')
      // إزالة القماش من القائمة المحلية
      setFabrics(prev => prev.filter(f => f.id !== fabricId))
      setDeleteConfirmId(null)
      setSuccess(true)

      setTimeout(() => {
        setSuccess(false)
      }, 2000)
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في حذف القماش:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVisibility = async (fabric: Fabric) => {
    const shouldShow = Boolean(fabric.is_manually_hidden)
    if (shouldShow && fabric.inventory_item_id && fabric.stock_quantity <= 0) {
      setError('لا يمكن إظهار هذا القماش لأن كميته في المخزون منتهية')
      return
    }

    setIsLoading(true)
    setError(null)
    const { data, error } = await fabricService.update(fabric.id, {
      is_manually_hidden: !shouldShow,
      is_active: shouldShow,
      is_available: shouldShow ? fabric.stock_quantity > 0 || !fabric.inventory_item_id : fabric.is_available
    })
    if (error) {
      setError(error)
    } else if (data) {
      setFabrics(previous => previous.map(current => current.id === data.id ? data : current))
    }
    setIsLoading(false)
  }

  const fabricCategories = ['حرير', 'شيفون', 'ساتان', 'دانتيل', 'تول', 'قطن', 'كريب', 'أورجانزا', 'مخمل', 'جاكار', 'تفتا', 'جورجيت']

  // تحديد مسار العودة حسب نوع المستخدم
  const getBackRoute = () => {
    if (user?.role === 'admin') {
      return '/dashboard'
    }
    if (user?.role === 'worker' && workerType) {
      return getDashboardRoute()
    }
    return '/dashboard'
  }

  const getBackLabel = () => {
    if (user?.role === 'admin') {
      return 'العودة إلى لوحة المدير'
    }
    if (user?.role === 'worker' && workerType === 'fabric_store_manager') {
      return 'العودة إلى لوحة التحكم'
    }
    return 'العودة إلى لوحة التحكم'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 sm:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* زر الرجوع */}
        <div className="mb-3">
          <Link
            href={getBackRoute()}
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300 group"
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5 group-hover:translate-x-1 transition-transform" />
            <span className="text-sm lg:text-base font-medium">{getBackLabel()}</span>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-7 h-7 text-purple-600" />
            <h1 className="text-2xl font-bold">إدارة الأقمشة</h1>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/dashboard/ready-designs"
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-white px-3 py-2 text-[11px] font-bold leading-4 text-purple-800 shadow-sm transition-colors hover:bg-purple-50 sm:text-xs"
              >
                <Palette className="h-4 w-4 shrink-0" />
                التصاميم الجاهزة
              </Link>
              <Link
                href="/dashboard/accounting/fabrics/inventory"
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 py-2 text-[11px] font-bold leading-4 text-teal-800 shadow-sm transition-colors hover:bg-teal-50 sm:text-xs"
              >
                <Boxes className="h-4 w-4 shrink-0" />
                مخزون الأقمشة
              </Link>
            </div>
            <button
              onClick={startAddNew}
              disabled={isAddingNew || editingId !== null}
              className="btn-primary flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة قماش جديد</span>
            </button>
          </div>
        </motion.div>

        {/* رسالة خطأ */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p className="font-bold">خطأ:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/80 p-4 text-sm text-teal-900">
          <Database className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            الأقمشة المرتبطة تُنشأ وتُحدّث من المخزون تلقائياً. يمكنك هنا إثراء البطاقة بالاسم والوصف،
            أو إخفاءها وحذفها من المتجر من دون التأثير على سجل المخزون.
          </p>
        </div>

        {/* نموذج إضافة قماش جديد */}
        {isAddingNew && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white/90 rounded-xl border-2 border-pink-300 shadow-2xl p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-6 h-6 text-pink-600" />
              إضافة قماش جديد
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-2 text-gray-700">اسم القماش</label>
                  <input
                    type="text"
                    value={newFabricData.name || ''}
                    onChange={(e) => handleNewFabricChange('name', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: حرير وردي فاخر (اختياري)"
                  />
                </div>

                <div>
                  <label className="block font-medium mb-2 text-gray-700">نوع القماش</label>
                  <input
                    type="text"
                    value={newFabricData.category || ''}
                    onChange={(e) => handleNewFabricChange('category', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: حرير"
                  />
                </div>
              </div>

              {/* الوصف */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الوصف (اختياري)</label>
                <textarea
                  value={newFabricData.description || ''}
                  onChange={(e) => handleNewFabricChange('description', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="وصف تفصيلي للقماش..."
                  rows={4}
                />
              </div>

              {/* السعر */}
              <div>
                <div>
                  <label className="block font-medium mb-2 text-gray-700">السعر بالمتر (ريال)</label>
                  <input
                    type="number"
                    value={newFabricData.price_per_meter || ''}
                    onChange={(e) => handleNewFabricChange('price_per_meter', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    min="0"
                    step="0.01"
                    placeholder="اختياري"
                  />
                </div>
              </div>

              {/* الألوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الألوان المتاحة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newColorsInput}
                    onChange={(e) => setNewColorsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewColor() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل لون واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewColor}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!newColorsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {newFabricData.available_colors?.map(color => (
                    <span key={color} className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {color}
                      <button
                        type="button"
                        onClick={() => handleRemoveNewColor(color)}
                        className="text-pink-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* الصور */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">صور القماش *</label>
                <ImageUpload
                  images={newFabricData.images || []}
                  onImagesChange={(images) => handleNewFabricChange('images', images)}
                  onPrimaryThumbnailChange={(thumbnail) => handleNewFabricChange('thumbnail_image', thumbnail)}
                  maxImages={5}
                  useSupabaseStorage={true}
                  acceptVideo={false}
                />
              </div>

              {/* خيارات إضافية */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFabricData.is_available ?? true}
                    onChange={(e) => handleNewFabricChange('is_available', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">متوفر للبيع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFabricData.is_featured ?? false}
                    onChange={(e) => handleNewFabricChange('is_featured', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">قماش مميز</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFabricData.is_on_sale ?? false}
                    onChange={(e) => handleNewFabricChange('is_on_sale', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">عليه خصم</span>
                </label>
              </div>

              {/* نسبة الخصم */}
              {newFabricData.is_on_sale && (
                <div>
                  <label className="block font-medium mb-2 text-gray-700">نسبة الخصم (%)</label>
                  <input
                    type="number"
                    value={newFabricData.discount_percentage || 0}
                    onChange={(e) => handleNewFabricChange('discount_percentage', parseFloat(e.target.value))}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    min="0"
                    max="100"
                    placeholder="0"
                  />
                </div>
              )}

              {/* أزرار الحفظ والإلغاء */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCreateFabric}
                  disabled={isLoading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>حفظ القماش الجديد</span>
                    </>
                  )}
                </button>
                <button
                  onClick={cancelAddNew}
                  disabled={isLoading}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-5 h-5" />
                  <span>إلغاء</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* نموذج تعديل القماش - عرض كامل */}
        {editingId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white/90 rounded-xl border-2 border-pink-300 shadow-2xl p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Edit2 className="w-6 h-6 text-pink-600" />
              تعديل القماش
            </h2>
            <div className="space-y-4">

              {/* الاسم والفئة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-2 text-gray-700">اسم القماش</label>
                  <input
                    type="text"
                    value={editData.name || ''}
                    onChange={(e) => handleEditChange('name', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: حرير وردي فاخر (اختياري)"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-2 text-gray-700">نوع القماش</label>
                  <input
                    type="text"
                    value={editData.category || ''}
                    onChange={(e) => handleEditChange('category', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: حرير"
                  />
                </div>
              </div>

              {/* الوصف */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الوصف (اختياري)</label>
                <textarea
                  value={editData.description || ''}
                  onChange={(e) => handleEditChange('description', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="وصف تفصيلي للقماش..."
                  rows={4}
                />
              </div>

              {/* السعر */}
              <div>
                <div>
                  <label className="block font-medium mb-2 text-gray-700">السعر بالمتر (ريال)</label>
                  <input
                    type="number"
                    value={editData.price_per_meter ?? ''}
                    onChange={(e) => handleEditChange('price_per_meter', e.target.value ? parseFloat(e.target.value) : null)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    min="0"
                    step="0.01"
                    placeholder="اختياري"
                  />
                </div>
              </div>

              {/* الألوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الألوان المتاحة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={colorsInput}
                    onChange={(e) => setColorsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddColor() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل لون واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddColor}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!colorsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editData.available_colors?.map(color => (
                    <span key={color} className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {color}
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(color)}
                        className="text-pink-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* الصور */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">صور القماش *</label>
                <ImageUpload
                  images={editData.images || []}
                  onImagesChange={(images) => handleEditChange('images', images)}
                  onPrimaryThumbnailChange={(thumbnail) => handleEditChange('thumbnail_image', thumbnail)}
                  maxImages={5}
                  useSupabaseStorage={true}
                  acceptVideo={false}
                />
              </div>

              {/* خيارات إضافية */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_available ?? true}
                    onChange={(e) => handleEditChange('is_available', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">متوفر للبيع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_featured ?? false}
                    onChange={(e) => handleEditChange('is_featured', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">قماش مميز</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_on_sale ?? false}
                    onChange={(e) => handleEditChange('is_on_sale', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">عليه خصم</span>
                </label>
              </div>

              {/* نسبة الخصم */}
              {editData.is_on_sale && (
                <div>
                  <label className="block font-medium mb-2 text-gray-700">نسبة الخصم (%)</label>
                  <input
                    type="number"
                    value={editData.discount_percentage || 0}
                    onChange={(e) => handleEditChange('discount_percentage', parseFloat(e.target.value))}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    min="0"
                    max="100"
                    placeholder="0"
                  />
                </div>
              )}

              {/* أزرار الحفظ والإلغاء */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>حفظ التعديلات</span>
                    </>
                  )}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={isLoading}
                  className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-5 h-5" />
                  <span>إلغاء</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* قائمة الأقمشة - مخفية عند التعديل */}
        {!editingId && isLoading && fabrics.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-pink-600 animate-spin" />
          </div>
        ) : !editingId ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fabrics.map((fabric, index) => (
              <motion.div
                key={fabric.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className={`bg-white rounded-xl shadow-lg overflow-hidden border hover:shadow-xl transition-shadow duration-300 flex flex-col min-h-[480px] ${
                  fabric.is_active ? 'border-pink-100' : 'border-gray-200 opacity-75'
                }`}
              >
                {/* صورة القماش */}
                {fabric.images && fabric.images.length > 0 && (
                  <div className="relative h-48 overflow-hidden flex-shrink-0">
                    <img
                      src={fabric.thumbnail_image || fabric.images[0]}
                      alt={fabric.name || fabric.fabric_code || 'قماش'}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                    {fabric.is_on_sale && (
                      <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                        خصم {fabric.discount_percentage}%
                      </div>
                    )}
                    {fabric.is_featured && (
                      <div className="absolute top-2 left-2 bg-yellow-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                        ⭐ مميز
                      </div>
                    )}
                    {!fabric.is_active && (
                      <div className="absolute inset-0 bg-gray-950/45 flex items-center justify-center">
                        <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-gray-800">
                          {fabric.is_manually_hidden ? 'مخفي يدوياً' : 'غير ظاهر في المتجر'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* محتوى البطاقة */}
                <div className="p-4 flex flex-col flex-1">
                  {fabric.fabric_code && (
                    <div dir="ltr" className="mb-2 flex items-center justify-end gap-1 font-mono text-sm font-bold text-teal-700">
                      <Hash className="h-4 w-4" /> {fabric.fabric_code}
                    </div>
                  )}
                  {fabric.name && <h3 className="text-lg font-bold text-gray-800 mb-2">{fabric.name}</h3>}
                  {fabric.description && <p className="text-gray-600 text-sm mb-3 line-clamp-2">{fabric.description}</p>}
                  {fabric.inventory_item_id && (
                    <p className="mb-3 flex items-center gap-1 text-xs font-medium text-teal-700">
                      <Database className="h-3.5 w-3.5" /> مرتبط بالمخزون
                    </p>
                  )}

                  {/* الفئة والسعر */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-xs font-medium">
                      {fabric.category}
                    </span>
                    {fabric.price_per_meter != null && (
                      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium">
                        {formatFabricNumber(fabric.price_per_meter)} ريال/متر
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${fabric.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                      {fabric.is_available ? '✓ متوفر' : '✗ غير متوفر'}
                    </span>
                  </div>

                  {/* الألوان */}
                  {fabric.available_colors && fabric.available_colors.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">الألوان المتاحة:</p>
                      <div className="flex flex-wrap gap-1">
                        {fabric.available_colors.slice(0, 3).map(color => (
                          <span key={color} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                            {color}
                          </span>
                        ))}
                        {fabric.available_colors.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{fabric.available_colors.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* الأزرار - مثبتة في الأسفل */}
                  <div className="grid grid-cols-2 gap-2 mt-auto pt-3">
                    <button
                      onClick={() => startEdit(fabric)}
                      disabled={editingId !== null || isAddingNew}
                      className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>تعديل</span>
                    </button>
                    <button
                      onClick={() => handleVisibility(fabric)}
                      disabled={editingId !== null || isAddingNew || isLoading}
                      className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                    >
                      {fabric.is_manually_hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      <span>{fabric.is_manually_hidden ? 'إظهار' : 'إخفاء'}</span>
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(fabric.id)}
                      disabled={editingId !== null || isAddingNew}
                      className="col-span-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : null}

        {/* مودال تأكيد الحذف */}
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">تأكيد الحذف</h3>
              </div>
              <p className="text-gray-600 mb-6">
                {fabrics.find(fabric => fabric.id === deleteConfirmId)?.inventory_item_id
                  ? 'سيُحذف القماش من المتجر فقط، وسيبقى سجل المخزون وكمياته كما هي.'
                  : 'هل أنت متأكد من حذف هذا القماش من المتجر؟ لا يمكن التراجع عن هذا الإجراء.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={isLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-bold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>جاري الحذف...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      <span>نعم، احذف</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={isLoading}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* مودال رسالة النجاح */}
        {success && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">تم إتمام الإجراء بنجاح</h3>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FabricsAdmin() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessFabrics" allowAdmin={true}>
      <FabricsAdminContent />
    </ProtectedWorkerRoute>
  )
}
