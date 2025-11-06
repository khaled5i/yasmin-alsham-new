"use client"

import { useState, useEffect } from "react"
import { motion } from 'framer-motion'
import { Palette, Edit2, Save, X, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import Link from 'next/link'
import { fabricService, Fabric, UpdateFabricData, CreateFabricData } from '@/lib/services/fabric-service'

export default function FabricsAdmin() {
  const [fabrics, setFabrics] = useState<Fabric[]>([])
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editData, setEditData] = useState<Partial<Fabric>>({})
  const [colorsInput, setColorsInput] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      const { data, error } = await fabricService.getAll()
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
      setEditData(prev => ({ ...prev, available_colors: [...(prev.available_colors||[]), color] }))
      setColorsInput("")
    }
  }

  const handleRemoveColor = (color: string) => {
    setEditData(prev => ({ ...prev, available_colors: (prev.available_colors||[]).filter(c => c !== color) }))
  }

  const handleSave = async () => {
    if (!editingId) return
    setIsLoading(true)
    setError(null)

    try {
      const updates: UpdateFabricData = {
        name: editData.name,
        description: editData.description,
        price_per_meter: editData.price_per_meter,
        images: editData.images,
        image_url: editData.images?.[0],
        available_colors: editData.available_colors,
        category: editData.category,
        width_cm: editData.width_cm,
        fabric_weight: editData.fabric_weight,
        transparency_level: editData.transparency_level,
        elasticity: editData.elasticity,
        care_instructions: editData.care_instructions,
        is_available: editData.is_available,
        is_featured: editData.is_featured,
        is_on_sale: editData.is_on_sale,
        discount_percentage: editData.discount_percentage
      }

      console.log('🔄 تحديث القماش في Supabase...', editingId)
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
      setNewFabricData(prev => ({ ...prev, available_colors: [...(prev.available_colors||[]), color] }))
      setNewColorsInput("")
    }
  }

  const handleRemoveNewColor = (color: string) => {
    setNewFabricData(prev => ({ ...prev, available_colors: (prev.available_colors||[]).filter(c => c !== color) }))
  }

  const handleCreateFabric = async () => {
    if (!newFabricData.name?.trim()) {
      setError('يرجى إدخال اسم القماش')
      return
    }
    if (!newFabricData.description?.trim()) {
      setError('يرجى إدخال وصف القماش')
      return
    }
    if (!newFabricData.price_per_meter || newFabricData.price_per_meter <= 0) {
      setError('يرجى إدخال سعر صحيح')
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
        name: newFabricData.name!,
        description: newFabricData.description!,
        price_per_meter: newFabricData.price_per_meter!,
        images: newFabricData.images!,
        image_url: newFabricData.images![0],
        available_colors: newFabricData.available_colors || [],
        category: newFabricData.category || 'حرير',
        width_cm: newFabricData.width_cm,
        fabric_weight: newFabricData.fabric_weight,
        transparency_level: newFabricData.transparency_level,
        elasticity: newFabricData.elasticity,
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

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القماش؟')) return
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await fabricService.delete(id)
      if (error) {
        console.error('❌ خطأ في حذف القماش:', error)
        setError(error)
      } else {
        console.log('✅ تم حذف القماش بنجاح')
        setFabrics(prev => prev.filter(f => f.id !== id))
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في حذف القماش:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const fabricCategories = ['حرير', 'شيفون', 'ساتان', 'دانتيل', 'تول', 'قطن', 'كريب', 'أورجانزا', 'مخمل', 'جاكار', 'تفتا', 'جورجيت']

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 py-12">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center gap-3">
                <Palette className="w-10 h-10 text-pink-600" />
                إدارة الأقمشة
              </h1>
              <p className="text-gray-600">إضافة وتعديل وحذف الأقمشة في المتجر</p>
            </div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors duration-300">
              <ArrowRight className="w-5 h-5" />
              <span>العودة للوحة التحكم</span>
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
              ✅ تم الحفظ بنجاح!
            </div>
          )}

          <button
            onClick={startAddNew}
            disabled={isAddingNew || isLoading}
            className="mb-6 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-6 py-3 rounded-lg font-bold hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            إضافة قماش جديد
          </button>
        </motion.div>

        {isAddingNew && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-200 shadow-xl mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Plus className="w-6 h-6 text-pink-600" />
              إضافة قماش جديد
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم القماش *</label>
                <input
                  type="text"
                  value={newFabricData.name || ''}
                  onChange={(e) => handleNewFabricChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="مثال: حرير وردي فاخر"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الفئة *</label>
                <select
                  value={newFabricData.category || 'حرير'}
                  onChange={(e) => handleNewFabricChange('category', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  {fabricCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">الوصف *</label>
                <textarea
                  value={newFabricData.description || ''}
                  onChange={(e) => handleNewFabricChange('description', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="وصف تفصيلي للقماش..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">السعر بالمتر (ريال) *</label>
                <input
                  type="number"
                  value={newFabricData.price_per_meter || 0}
                  onChange={(e) => handleNewFabricChange('price_per_meter', parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">العرض (سم)</label>
                <input
                  type="number"
                  value={newFabricData.width_cm || ''}
                  onChange={(e) => handleNewFabricChange('width_cm', parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  min="0"
                  placeholder="مثال: 150"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الوزن</label>
                <select
                  value={newFabricData.fabric_weight || ''}
                  onChange={(e) => handleNewFabricChange('fabric_weight', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="">اختر الوزن</option>
                  <option value="خفيف جداً">خفيف جداً</option>
                  <option value="خفيف">خفيف</option>
                  <option value="متوسط">متوسط</option>
                  <option value="ثقيل">ثقيل</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الشفافية</label>
                <select
                  value={newFabricData.transparency_level || ''}
                  onChange={(e) => handleNewFabricChange('transparency_level', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="">اختر مستوى الشفافية</option>
                  <option value="شفاف">شفاف</option>
                  <option value="شبه شفاف">شبه شفاف</option>
                  <option value="معتم">معتم</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">المرونة</label>
                <select
                  value={newFabricData.elasticity || ''}
                  onChange={(e) => handleNewFabricChange('elasticity', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="">اختر المرونة</option>
                  <option value="غير مطاطي">غير مطاطي</option>
                  <option value="مطاطي قليلاً">مطاطي قليلاً</option>
                  <option value="مطاطي">مطاطي</option>
                  <option value="مطاطي جداً">مطاطي جداً</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">الألوان المتاحة</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newColorsInput}
                  onChange={(e) => setNewColorsInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddNewColor()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="أضف لون (اضغط Enter)"
                />
                <button onClick={handleAddNewColor} className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors">
                  إضافة
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {newFabricData.available_colors?.map(color => (
                  <span key={color} className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    {color}
                    <button onClick={() => handleRemoveNewColor(color)} className="hover:text-pink-900">
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">تعليمات العناية</label>
              <textarea
                value={newFabricData.care_instructions || ''}
                onChange={(e) => handleNewFabricChange('care_instructions', e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="مثال: يُغسل يدوياً بماء بارد، لا يُعصر، يُكوى على حرارة منخفضة"
              />
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">الصور *</label>
              <ImageUpload
                images={newFabricData.images || []}
                onImagesChange={(images) => handleNewFabricChange('images', images)}
                maxImages={5}
              />
            </div>

            <div className="mt-6 grid md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFabricData.is_available ?? true}
                  onChange={(e) => handleNewFabricChange('is_available', e.target.checked)}
                  className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700">متوفر</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFabricData.is_featured ?? false}
                  onChange={(e) => handleNewFabricChange('is_featured', e.target.checked)}
                  className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700">مميز</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFabricData.is_on_sale ?? false}
                  onChange={(e) => handleNewFabricChange('is_on_sale', e.target.checked)}
                  className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700">عليه خصم</span>
              </label>
            </div>

            {newFabricData.is_on_sale && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">نسبة الخصم (%)</label>
                <input
                  type="number"
                  value={newFabricData.discount_percentage || 0}
                  onChange={(e) => handleNewFabricChange('discount_percentage', parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  min="0"
                  max="100"
                />
              </div>
            )}

            <div className="mt-6 flex gap-4">
              <button
                onClick={handleCreateFabric}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-6 py-3 rounded-lg font-bold hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                حفظ القماش الجديد
              </button>
              <button
                onClick={cancelAddNew}
                disabled={isLoading}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <X className="w-5 h-5" />
                إلغاء
              </button>
            </div>
          </motion.div>
        )}

        {isLoading && fabrics.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-pink-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {fabrics.map((fabric, index) => (
              <motion.div
                key={fabric.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 shadow-lg"
              >
                {editingId === fabric.id ? (
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Edit2 className="w-5 h-5 text-pink-600" />
                      تعديل: {fabric.name}
                    </h3>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">اسم القماش</label>
                        <input
                          type="text"
                          value={editData.name || ''}
                          onChange={(e) => handleEditChange('name', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">الفئة</label>
                        <select
                          value={editData.category || 'حرير'}
                          onChange={(e) => handleEditChange('category', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        >
                          {fabricCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">الوصف</label>
                        <textarea
                          value={editData.description || ''}
                          onChange={(e) => handleEditChange('description', e.target.value)}
                          rows={2}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">السعر بالمتر (ريال)</label>
                        <input
                          type="number"
                          value={editData.price_per_meter || 0}
                          onChange={(e) => handleEditChange('price_per_meter', parseFloat(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">العرض (سم)</label>
                        <input
                          type="number"
                          value={editData.width_cm || ''}
                          onChange={(e) => handleEditChange('width_cm', parseFloat(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">الألوان المتاحة</label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={colorsInput}
                          onChange={(e) => setColorsInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddColor()}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                          placeholder="أضف لون (اضغط Enter)"
                        />
                        <button onClick={handleAddColor} className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors">
                          إضافة
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editData.available_colors?.map(color => (
                          <span key={color} className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                            {color}
                            <button onClick={() => handleRemoveColor(color)} className="hover:text-pink-900">
                              <X className="w-4 h-4" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">الصور</label>
                      <ImageUpload
                        images={editData.images || []}
                        onImagesChange={(images) => handleEditChange('images', images)}
                        maxImages={5}
                      />
                    </div>

                    <div className="mt-4 grid md:grid-cols-3 gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.is_available ?? true}
                          onChange={(e) => handleEditChange('is_available', e.target.checked)}
                          className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">متوفر</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.is_featured ?? false}
                          onChange={(e) => handleEditChange('is_featured', e.target.checked)}
                          className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">مميز</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.is_on_sale ?? false}
                          onChange={(e) => handleEditChange('is_on_sale', e.target.checked)}
                          className="w-5 h-5 text-pink-600 focus:ring-pink-500 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">عليه خصم</span>
                      </label>
                    </div>

                    {editData.is_on_sale && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">نسبة الخصم (%)</label>
                        <input
                          type="number"
                          value={editData.discount_percentage || 0}
                          onChange={(e) => handleEditChange('discount_percentage', parseFloat(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                          min="0"
                          max="100"
                        />
                      </div>
                    )}

                    <div className="mt-6 flex gap-4">
                      <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="flex-1 bg-gradient-to-r from-pink-600 to-purple-600 text-white px-6 py-3 rounded-lg font-bold hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        حفظ التعديلات
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isLoading}
                        className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{fabric.name}</h3>
                        <p className="text-gray-600 mb-2">{fabric.description}</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-medium">{fabric.category}</span>
                          <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">{fabric.price_per_meter} ريال/متر</span>
                          {fabric.is_featured && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">⭐ مميز</span>}
                          {fabric.is_on_sale && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">🔥 خصم {fabric.discount_percentage}%</span>}
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${fabric.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {fabric.is_available ? '✓ متوفر' : '✗ غير متوفر'}
                          </span>
                        </div>
                        {fabric.available_colors && fabric.available_colors.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <span className="text-sm text-gray-600">الألوان:</span>
                            {fabric.available_colors.map(color => (
                              <span key={color} className="text-sm bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{color}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {fabric.images && fabric.images.length > 0 && (
                        <img src={fabric.images[0]} alt={fabric.name} className="w-24 h-24 object-cover rounded-lg ml-4" />
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(fabric)}
                        disabled={isLoading}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDelete(fabric.id)}
                        disabled={isLoading}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



