"use client"

import { useState, useEffect } from "react"
import { motion } from 'framer-motion'
import { Palette, Edit2, Save, X, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import Link from 'next/link'
import { productService, Product, UpdateProductData, CreateProductData } from '@/lib/services/store-service'

export default function ReadyDesignsAdmin() {
  const [products, setProducts] = useState<Product[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Product>>({})
  const [colorsInput, setColorsInput] = useState("")
  const [featuresInput, setFeaturesInput] = useState("")
  const [occasionsInput, setOccasionsInput] = useState("")
  const [careInstructionsInput, setCareInstructionsInput] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // حالة إضافة منتج جديد
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newProductData, setNewProductData] = useState<Partial<Product>>({
    title: '',
    description: '',
    price: 0,
    images: [],
    colors: [],
    sizes: [],
    features: [],
    occasions: [],
    care_instructions: [],
    is_available: true,
    is_featured: false,
    category_name: 'فساتين سهرة'
  })
  const [newColorsInput, setNewColorsInput] = useState("")
  const [newFeaturesInput, setNewFeaturesInput] = useState("")
  const [newOccasionsInput, setNewOccasionsInput] = useState("")
  const [newCareInstructionsInput, setNewCareInstructionsInput] = useState("")

  // تحميل المنتجات عند تحميل الصفحة
  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await productService.getAll()
      if (error) {
        console.error('❌ خطأ في تحميل المنتجات:', error)
        setError(error)
      } else if (data) {
        console.log(`✅ تم تحميل ${data.length} منتج`)
        console.log('📦 عينة من البيانات المحملة:', data[0] ? {
          id: data[0].id,
          title: data[0].title,
          features: data[0].features,
          occasions: data[0].occasions,
          care_instructions: data[0].care_instructions
        } : 'لا توجد منتجات')
        setProducts(data)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (product: Product) => {
    console.log('📝 بدء تعديل المنتج:', {
      id: product.id,
      features: product.features,
      occasions: product.occasions,
      care_instructions: product.care_instructions
    })
    setEditingId(product.id)
    setEditData({ ...product })
    setColorsInput("")
    setFeaturesInput("")
    setOccasionsInput("")
    setCareInstructionsInput("")
    setSuccess(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
    setColorsInput("")
    setFeaturesInput("")
    setOccasionsInput("")
    setCareInstructionsInput("")
    setSuccess(false)
  }

  const handleEditChange = (field: keyof Product, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddColor = () => {
    const color = colorsInput.trim()
    if (color && !editData.colors?.includes(color)) {
      setEditData(prev => ({ ...prev, colors: [...(prev.colors || []), color] }))
      setColorsInput("")
    }
  }

  const handleRemoveColor = (color: string) => {
    setEditData(prev => ({ ...prev, colors: (prev.colors || []).filter(c => c !== color) }))
  }

  // دوال التعامل مع المميزات (تعديل)
  const handleAddFeature = () => {
    const val = featuresInput.trim()
    if (val && !editData.features?.includes(val)) {
      setEditData(prev => ({ ...prev, features: [...(prev.features || []), val] }))
      setFeaturesInput("")
    }
  }
  const handleRemoveFeature = (val: string) => {
    setEditData(prev => ({ ...prev, features: (prev.features || []).filter(f => f !== val) }))
  }

  // دوال التعامل مع المناسبات (تعديل)
  const handleAddOccasion = () => {
    const val = occasionsInput.trim()
    if (val && !editData.occasions?.includes(val)) {
      setEditData(prev => ({ ...prev, occasions: [...(prev.occasions || []), val] }))
      setOccasionsInput("")
    }
  }
  const handleRemoveOccasion = (val: string) => {
    setEditData(prev => ({ ...prev, occasions: (prev.occasions || []).filter(o => o !== val) }))
  }

  // دوال التعامل مع تعليمات العناية (تعديل)
  const handleAddCareInstruction = () => {
    const val = careInstructionsInput.trim()
    if (val && !editData.care_instructions?.includes(val)) {
      setEditData(prev => ({ ...prev, care_instructions: [...(prev.care_instructions || []), val] }))
      setCareInstructionsInput("")
    }
  }
  const handleRemoveCareInstruction = (val: string) => {
    setEditData(prev => ({ ...prev, care_instructions: (prev.care_instructions || []).filter(c => c !== val) }))
  }

  const handleSave = async () => {
    if (!editingId) return

    setIsLoading(true)
    setError(null)

    try {
      // تحضير البيانات للتحديث
      const updates: UpdateProductData = {
        title: editData.title,
        description: editData.description,
        price: editData.price,
        images: editData.images,
        thumbnail_image: editData.images?.[0],
        colors: editData.colors,
        sizes: editData.sizes,
        fabric: editData.fabric ?? undefined,
        features: editData.features || [],
        occasions: editData.occasions || [],
        care_instructions: editData.care_instructions || [],
        is_available: editData.is_available,
        is_featured: editData.is_featured,
        category_name: editData.category_name ?? undefined
      }

      console.log('🔄 تحديث المنتج في Supabase...', editingId)
      console.log('📝 البيانات المرسلة:', {
        features: updates.features,
        occasions: updates.occasions,
        care_instructions: updates.care_instructions
      })
      const { data, error } = await productService.update(editingId, updates)

      if (error) {
        console.error('❌ خطأ في تحديث المنتج:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      if (data) {
        console.log('✅ تم تحديث المنتج بنجاح')
        console.log('📦 البيانات المستلمة من Supabase:', {
          features: data.features,
          occasions: data.occasions,
          care_instructions: data.care_instructions
        })
        // تحديث القائمة المحلية
        setProducts(prev => prev.map(p => p.id === editingId ? data : p))
        setSuccess(true)

        setTimeout(() => {
          setEditingId(null)
          setEditData({})
          setSuccess(false)
        }, 1200)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في تحديث المنتج:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // دوال إضافة منتج جديد
  const startAddNew = () => {
    setIsAddingNew(true)
    setNewProductData({
      title: '',
      description: '',
      price: 0,
      images: [],
      colors: [],
      sizes: [],
      features: [],
      occasions: [],
      care_instructions: [],
      is_available: true,
      is_featured: false,
      category_name: 'فساتين سهرة'
    })
    setNewColorsInput("")
    setNewFeaturesInput("")
    setNewOccasionsInput("")
    setNewCareInstructionsInput("")
    setSuccess(false)
    setError(null)
  }

  const cancelAddNew = () => {
    setIsAddingNew(false)
    setNewProductData({
      title: '',
      description: '',
      price: 0,
      images: [],
      colors: [],
      sizes: [],
      features: [],
      occasions: [],
      care_instructions: [],
      is_available: true,
      is_featured: false,
      category_name: 'فساتين سهرة'
    })
    setNewColorsInput("")
    setNewFeaturesInput("")
    setNewOccasionsInput("")
    setNewCareInstructionsInput("")
    setSuccess(false)
    setError(null)
  }

  const handleNewProductChange = (field: keyof Product, value: any) => {
    setNewProductData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddNewColor = () => {
    const color = newColorsInput.trim()
    if (color && !newProductData.colors?.includes(color)) {
      setNewProductData(prev => ({ ...prev, colors: [...(prev.colors || []), color] }))
      setNewColorsInput("")
    }
  }

  const handleRemoveNewColor = (color: string) => {
    setNewProductData(prev => ({ ...prev, colors: (prev.colors || []).filter(c => c !== color) }))
  }

  // دوال التعامل مع المميزات (جديد)
  const handleAddNewFeature = () => {
    const val = newFeaturesInput.trim()
    if (val && !newProductData.features?.includes(val)) {
      setNewProductData(prev => ({ ...prev, features: [...(prev.features || []), val] }))
      setNewFeaturesInput("")
    }
  }
  const handleRemoveNewFeature = (val: string) => {
    setNewProductData(prev => ({ ...prev, features: (prev.features || []).filter(f => f !== val) }))
  }

  // دوال التعامل مع المناسبات (جديد)
  const handleAddNewOccasion = () => {
    const val = newOccasionsInput.trim()
    if (val && !newProductData.occasions?.includes(val)) {
      setNewProductData(prev => ({ ...prev, occasions: [...(prev.occasions || []), val] }))
      setNewOccasionsInput("")
    }
  }
  const handleRemoveNewOccasion = (val: string) => {
    setNewProductData(prev => ({ ...prev, occasions: (prev.occasions || []).filter(o => o !== val) }))
  }

  // دوال التعامل مع تعليمات العناية (جديد)
  const handleAddNewCareInstruction = () => {
    const val = newCareInstructionsInput.trim()
    if (val && !newProductData.care_instructions?.includes(val)) {
      setNewProductData(prev => ({ ...prev, care_instructions: [...(prev.care_instructions || []), val] }))
      setNewCareInstructionsInput("")
    }
  }
  const handleRemoveNewCareInstruction = (val: string) => {
    setNewProductData(prev => ({ ...prev, care_instructions: (prev.care_instructions || []).filter(c => c !== val) }))
  }

  const handleCreateProduct = async () => {
    // التحقق من صحة البيانات
    // السعر اختياري - إذا تم إدخاله يجب أن يكون صحيح
    if (newProductData.price && newProductData.price <= 0) {
      setError('يرجى إدخال سعر صحيح أو اتركه فارغاً')
      return
    }
    if (!newProductData.images || newProductData.images.length === 0) {
      setError('يرجى إضافة صورة واحدة على الأقل')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // تحضير البيانات للإضافة
      const createData: CreateProductData = {
        title: newProductData.title || '',
        description: newProductData.description || '',
        price: newProductData.price && newProductData.price > 0 ? newProductData.price : undefined,
        images: newProductData.images!,
        thumbnail_image: newProductData.images![0],
        colors: newProductData.colors || [],
        sizes: newProductData.sizes || [],
        is_available: newProductData.is_available ?? true,
        is_featured: newProductData.is_featured ?? false,
        category_name: newProductData.category_name || 'فساتين زفاف',
        published_at: new Date().toISOString(), // ✅ إضافة تاريخ النشر تلقائياً
        fabric: newProductData.fabric ?? undefined,
        features: newProductData.features || [],
        occasions: newProductData.occasions || [],
        care_instructions: newProductData.care_instructions || []
      }

      console.log('🔄 إضافة منتج جديد إلى Supabase...')
      console.log('📝 البيانات المرسلة:', {
        features: createData.features,
        occasions: createData.occasions,
        care_instructions: createData.care_instructions
      })
      const { data, error } = await productService.create(createData)

      if (error) {
        console.error('❌ خطأ في إضافة المنتج:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      if (data) {
        console.log('✅ تم إضافة المنتج بنجاح')
        // إضافة المنتج الجديد إلى القائمة المحلية
        setProducts(prev => [data, ...prev])

        // ✅ تحديث المتجر الأمامي لإظهار المنتج الجديد فوراً
        try {
          const { useShopStore } = await import('@/store/shopStore')
          const { loadProducts } = useShopStore.getState()
          console.log('🔄 تحديث المتجر الأمامي...')
          await loadProducts(true) // forceReload = true
          console.log('✅ تم تحديث المتجر الأمامي بنجاح')
        } catch (err) {
          console.warn('⚠️ فشل تحديث المتجر الأمامي:', err)
        }

        setSuccess(true)

        setTimeout(() => {
          setIsAddingNew(false)
          setNewProductData({
            title: '',
            description: '',
            price: 0,
            images: [],
            colors: [],
            sizes: [],
            is_available: true,
            is_featured: false,
            category_name: 'فساتين سهرة'
          })
          setSuccess(false)
        }, 1500)
      }
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في إضافة المنتج:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // دالة حذف المنتج
  const handleDelete = async (productId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('🗑️ حذف المنتج:', productId)
      const { error } = await productService.delete(productId)

      if (error) {
        console.error('❌ خطأ في حذف المنتج:', error)
        setError(error)
        setIsLoading(false)
        return
      }

      console.log('✅ تم حذف المنتج بنجاح')
      // إزالة المنتج من القائمة المحلية
      setProducts(prev => prev.filter(p => p.id !== productId))
      setDeleteConfirmId(null)
      setSuccess(true)

      setTimeout(() => {
        setSuccess(false)
      }, 2000)
    } catch (err: any) {
      console.error('❌ خطأ غير متوقع في حذف المنتج:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 sm:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* زر الرجوع */}
        <div className="mb-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة إلى لوحة المدير</span>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-7 h-7 text-purple-600" />
            <h1 className="text-2xl font-bold">إدارة التصاميم الجاهزة</h1>
          </div>
          <button
            onClick={startAddNew}
            disabled={isAddingNew || editingId !== null}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة فستان جديد</span>
          </button>
        </motion.div>

        {/* رسالة خطأ */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <p className="font-bold">خطأ في تحميل المنتجات:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* حالة التحميل */}
        {isLoading && !editingId && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 text-pink-600 animate-spin" />
            <span className="mr-3 text-gray-600">جاري تحميل المنتجات...</span>
          </div>
        )}

        {/* نموذج إضافة منتج جديد */}
        {isAddingNew && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white/90 rounded-xl border-2 border-pink-300 shadow-2xl p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-6 h-6 text-pink-600" />
              إضافة فستان جديد
            </h2>

            <div className="space-y-4">
              {/* رفع الصور */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">صور الفستان *</label>
                <ImageUpload
                  images={newProductData.images || []}
                  onImagesChange={imgs => handleNewProductChange('images', imgs)}
                  maxImages={8}
                  useSupabaseStorage={true}
                />
              </div>

              {/* العنوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">عنوان الفستان *</label>
                <input
                  type="text"
                  value={newProductData.title || ''}
                  onChange={e => handleNewProductChange('title', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="مثال: فستان زفاف كلاسيكي أبيض"
                />
              </div>

              {/* الوصف */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">وصف الفستان *</label>
                <textarea
                  value={newProductData.description || ''}
                  onChange={e => handleNewProductChange('description', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="وصف تفصيلي للفستان..."
                  rows={4}
                />
              </div>

              {/* السعر والفئة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-2 text-gray-700">السعر (ريال) *</label>
                  <input
                    type="number"
                    value={newProductData.price || ''}
                    onChange={e => handleNewProductChange('price', Number(e.target.value))}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="0"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-2 text-gray-700">الفئة</label>
                  <input
                    type="text"
                    value={newProductData.category_name || ''}
                    onChange={e => handleNewProductChange('category_name', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: فساتين زفاف"
                  />
                </div>
              </div>

              {/* المقاسات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المقاسات المتوفرة</label>
                <div className="flex flex-wrap gap-3">
                  {["XS", "S", "M", "L", "XL", "XXL"].map(size => (
                    <label key={size} className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg hover:bg-pink-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={newProductData.sizes?.includes(size) || false}
                        onChange={() => handleNewProductChange('sizes', newProductData.sizes?.includes(size)
                          ? (newProductData.sizes || []).filter(s => s !== size)
                          : [...(newProductData.sizes || []), size])}
                        className="accent-pink-600 w-4 h-4"
                      />
                      <span className="font-medium">{size}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* الألوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الألوان المتوفرة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newColorsInput}
                    onChange={e => setNewColorsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewColor() } }}
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
                  {(newProductData.colors || []).map((color, idx) => (
                    <span key={idx} className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full flex items-center gap-2">
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

              {/* نوع القماش */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">نوع القماش</label>
                <input
                  type="text"
                  value={newProductData.fabric || ''}
                  onChange={e => handleNewProductChange('fabric', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="مثال: حرير، ساتان، شيفون، دانتيل..."
                />
              </div>

              {/* المميزات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المميزات</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newFeaturesInput}
                    onChange={e => setNewFeaturesInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewFeature() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل ميزة واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewFeature}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!newFeaturesInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(newProductData.features || []).map((feature, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {feature}
                      <button
                        type="button"
                        onClick={() => handleRemoveNewFeature(feature)}
                        className="text-blue-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* المناسبات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المناسبات المناسبة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newOccasionsInput}
                    onChange={e => setNewOccasionsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewOccasion() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل مناسبة واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewOccasion}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!newOccasionsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(newProductData.occasions || []).map((occasion, idx) => (
                    <span key={idx} className="bg-purple-50 text-purple-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {occasion}
                      <button
                        type="button"
                        onClick={() => handleRemoveNewOccasion(occasion)}
                        className="text-purple-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* تعليمات العناية */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">تعليمات العناية</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCareInstructionsInput}
                    onChange={e => setNewCareInstructionsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewCareInstruction() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل تعليمات واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCareInstruction}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!newCareInstructionsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(newProductData.care_instructions || []).map((care, idx) => (
                    <span key={idx} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {care}
                      <button
                        type="button"
                        onClick={() => handleRemoveNewCareInstruction(care)}
                        className="text-gray-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* خيارات إضافية */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProductData.is_available ?? true}
                    onChange={e => handleNewProductChange('is_available', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">متوفر للبيع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProductData.is_featured ?? false}
                    onChange={e => handleNewProductChange('is_featured', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">منتج مميز</span>
                </label>
              </div>

              {/* رسالة خطأ */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <p className="font-bold">خطأ:</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* أزرار الإجراءات */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCreateProduct}
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
                      <span>حفظ الفستان</span>
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

        {/* نموذج تعديل منتج - عرض كامل */}
        {editingId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-white/90 rounded-xl border-2 border-pink-300 shadow-2xl p-6 mb-8"
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Edit2 className="w-6 h-6 text-pink-600" />
              تعديل الفستان
            </h2>

            <div className="space-y-4">
              {/* رفع الصور */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">صور الفستان *</label>
                <ImageUpload
                  images={editData.images || []}
                  onImagesChange={imgs => handleEditChange('images', imgs)}
                  maxImages={8}
                  useSupabaseStorage={true}
                />
              </div>

              {/* العنوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">عنوان الفستان *</label>
                <input
                  type="text"
                  value={editData.title || ''}
                  onChange={e => handleEditChange('title', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="مثال: فستان زفاف كلاسيكي أبيض"
                />
              </div>

              {/* الوصف */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">وصف الفستان *</label>
                <textarea
                  value={editData.description || ''}
                  onChange={e => handleEditChange('description', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="وصف تفصيلي للفستان..."
                  rows={4}
                />
              </div>

              {/* السعر والفئة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-2 text-gray-700">السعر (ريال) *</label>
                  <input
                    type="number"
                    value={editData.price || ''}
                    onChange={e => handleEditChange('price', Number(e.target.value))}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="0"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-2 text-gray-700">الفئة</label>
                  <input
                    type="text"
                    value={editData.category_name || ''}
                    onChange={e => handleEditChange('category_name', e.target.value)}
                    className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="مثال: فساتين زفاف"
                  />
                </div>
              </div>

              {/* المقاسات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المقاسات المتوفرة</label>
                <div className="flex flex-wrap gap-3">
                  {["XS", "S", "M", "L", "XL", "XXL"].map(size => (
                    <label key={size} className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg hover:bg-pink-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={editData.sizes?.includes(size) || false}
                        onChange={() => handleEditChange('sizes', editData.sizes?.includes(size)
                          ? (editData.sizes || []).filter(s => s !== size)
                          : [...(editData.sizes || []), size])}
                        className="accent-pink-600 w-4 h-4"
                      />
                      <span className="font-medium">{size}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* الألوان */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">الألوان المتوفرة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={colorsInput}
                    onChange={e => setColorsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddColor() } }}
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
                  {(editData.colors || []).map((color, idx) => (
                    <span key={idx} className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full flex items-center gap-2">
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

              {/* نوع القماش */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">نوع القماش</label>
                <input
                  type="text"
                  value={editData.fabric || ''}
                  onChange={e => handleEditChange('fabric', e.target.value)}
                  className="block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="مثال: حرير، ساتان، شيفون، دانتيل..."
                />
              </div>

              {/* المميزات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المميزات</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={featuresInput}
                    onChange={e => setFeaturesInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFeature() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل ميزة واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!featuresInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editData.features || []).map((feature, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {feature}
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(feature)}
                        className="text-blue-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* المناسبات */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">المناسبات المناسبة</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={occasionsInput}
                    onChange={e => setOccasionsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddOccasion() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل مناسبة واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddOccasion}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!occasionsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editData.occasions || []).map((occasion, idx) => (
                    <span key={idx} className="bg-purple-50 text-purple-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {occasion}
                      <button
                        type="button"
                        onClick={() => handleRemoveOccasion(occasion)}
                        className="text-purple-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* تعليمات العناية */}
              <div>
                <label className="block font-medium mb-2 text-gray-700">تعليمات العناية</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={careInstructionsInput}
                    onChange={e => setCareInstructionsInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCareInstruction() } }}
                    className="border border-gray-300 rounded-lg p-3 flex-1 focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                    placeholder="أدخل تعليمات واضغط إضافة"
                  />
                  <button
                    type="button"
                    onClick={handleAddCareInstruction}
                    className="btn-secondary px-6 py-3 rounded-lg font-bold"
                    disabled={!careInstructionsInput.trim()}
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editData.care_instructions || []).map((care, idx) => (
                    <span key={idx} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-full flex items-center gap-2">
                      {care}
                      <button
                        type="button"
                        onClick={() => handleRemoveCareInstruction(care)}
                        className="text-gray-600 hover:text-red-600 font-bold text-lg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* خيارات إضافية */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_available ?? true}
                    onChange={e => handleEditChange('is_available', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">متوفر للبيع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_featured ?? false}
                    onChange={e => handleEditChange('is_featured', e.target.checked)}
                    className="accent-pink-600 w-4 h-4"
                  />
                  <span className="text-gray-700">منتج مميز</span>
                </label>
              </div>

              {/* أزرار الإجراءات */}
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

        {/* عرض المنتجات - مخفي عند التعديل */}
        {!editingId && !isLoading && products.length === 0 && !error && !isAddingNew && (
          <div className="text-center py-20">
            <p className="text-gray-600 text-lg">لا توجد منتجات حالياً</p>
            <p className="text-gray-500 text-sm mt-2">اضغط على "إضافة فستان جديد" لإضافة أول منتج</p>
          </div>
        )}

        {!editingId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map(product => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="bg-white/80 rounded-xl border border-pink-100 shadow-lg p-4 flex flex-col"
              >
                <div className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden rounded-xl mb-3">
                  <img
                    src={product.images && product.images.length > 0 ? product.images[0] : '/wedding-dress-1.jpg.jpg'}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="font-bold text-gray-800 mb-1">{product.title}</h3>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">{product.description}</p>
                <div className="text-lg font-bold text-pink-600 mb-2">السعر: {Number(product.price).toLocaleString('en')} ريال</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(product.sizes || []).map(size => (
                    <span key={size} className="bg-pink-50 text-pink-700 px-2 py-0.5 rounded text-xs">{size}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(product.colors || []).map(color => (
                    <span key={color} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs">{color}</span>
                  ))}
                </div>

                {/* أزرار التحكم */}
                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => startEdit(product)}
                    disabled={editingId !== null || isAddingNew}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>تعديل</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(product.id)}
                    disabled={editingId !== null || isAddingNew}
                    className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

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
                هل أنت متأكد من حذف هذا الفستان؟ لا يمكن التراجع عن هذا الإجراء.
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