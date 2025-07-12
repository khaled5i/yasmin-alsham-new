"use client"

import { useState } from "react"
import Image from "next/image"
import { motion } from 'framer-motion'
import Link from 'next/link'
import ImageUpload from '@/components/ImageUpload'
import { Palette, ArrowRight } from 'lucide-react'
import { addDesign } from '@/data/designs'
import type { Design } from '@/data/designs'

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
// حذف COLORS

export default function AddDressPage() {
  const [images, setImages] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [sizes, setSizes] = useState<string[]>([])
  const [colors, setColors] = useState<string[]>([])
  const [colorInput, setColorInput] = useState("")
  const [errors, setErrors] = useState<any>({})
  const [success, setSuccess] = useState(false)

  // Handle size selection
  const handleSizeChange = (size: string) => {
    setSizes(prev => prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size])
  }

  // Handle color add
  const handleAddColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const color = colorInput.trim()
    if (color && !colors.includes(color)) {
      setColors(prev => [...prev, color])
      setColorInput("")
    }
  }

  // Remove color
  const handleRemoveColor = (color: string) => {
    setColors(prev => prev.filter(c => c !== color))
  }

  // Validate form
  const validate = () => {
    const errs: any = {}
    if (!title.trim()) errs.title = "اسم الفستان مطلوب"
    if (!description.trim()) errs.description = "الوصف مطلوب"
    if (!price || isNaN(Number(price)) || Number(price) <= 0) errs.price = "يرجى إدخال سعر صحيح"
    if (images.length === 0) errs.images = "يرجى تحميل صورة واحدة على الأقل"
    if (sizes.length === 0) errs.sizes = "يرجى اختيار مقاس واحد على الأقل"
    if (colors.length === 0) errs.colors = "يرجى اختيار لون واحد على الأقل"
    return errs
  }

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length === 0) {
      // Generate a unique id (max id + 1)
      const newId = Date.now() // fallback if no designs loaded
      let id = newId
      try {
        // Try to get max id from allDesigns
        const { allDesigns } = require('@/data/designs')
        id = allDesigns.length > 0 ? Math.max(...allDesigns.map((d: Design) => d.id)) + 1 : newId
      } catch {}
      // Prepare new design object
      const newDesign: Design = {
        id,
        title,
        description,
        category: 'تصاميم جاهزة',
        images,
        price: Number(price),
        sizes,
        colors
      }
      addDesign(newDesign)
      setSuccess(true)
      setTitle("")
      setDescription("")
      setPrice("")
      setSizes([])
      setColors([])
      setImages([])
    }
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
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة للوحة المدير</span>
          </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-pink-100 shadow-lg"
        >
          <h1 className="text-2xl font-bold mb-6 text-center flex items-center justify-center gap-2">
            <Palette className="w-6 h-6 text-pink-600" />
            إضافة فستان جديد
          </h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* صور الفستان */}
            <div>
              <label className="block font-medium mb-2">صور الفستان</label>
              <ImageUpload images={images} onImagesChange={setImages} maxImages={8} />
              {errors.images && <p className="text-red-600 text-sm mt-1">{errors.images}</p>}
            </div>
            {/* اسم الفستان */}
            <div>
              <label className="block font-medium mb-2">اسم الفستان</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="block w-full border rounded p-2 focus:ring-2 focus:ring-pink-300"
                placeholder="مثال: فستان زفاف ملكي"
              />
              {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
            </div>
            {/* الوصف */}
            <div>
              <label className="block font-medium mb-2">الوصف</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="block w-full border rounded p-2 min-h-[80px] focus:ring-2 focus:ring-pink-300"
                placeholder="اكتب وصفًا تفصيليًا للفستان..."
              />
              {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
            </div>
            {/* السعر */}
            <div>
              <label className="block font-medium mb-2">السعر</label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="block w-full border rounded p-2 focus:ring-2 focus:ring-pink-300"
                placeholder="مثال: 1200"
                min="1"
              />
              {errors.price && <p className="text-red-600 text-sm mt-1">{errors.price}</p>}
            </div>
            {/* المقاسات */}
            <div>
              <label className="block font-medium mb-2">المقاسات المتوفرة</label>
              <div className="flex flex-wrap gap-3">
                {SIZES.map(size => (
                  <label key={size} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sizes.includes(size)}
                      onChange={() => handleSizeChange(size)}
                      className="accent-pink-600"
                    />
                    <span>{size}</span>
                  </label>
                ))}
              </div>
              {errors.sizes && <p className="text-red-600 text-sm mt-1">{errors.sizes}</p>}
            </div>
            {/* الألوان */}
            <div>
              <label className="block font-medium mb-2">الألوان المتوفرة</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={colorInput}
                  onChange={e => setColorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddColor() } }}
                  className="border rounded p-2 flex-1 focus:ring-2 focus:ring-pink-300"
                  placeholder="أدخل لون واضغط إضافة"
                />
                <button
                  type="button"
                  onClick={() => handleAddColor()}
                  className="btn-secondary px-4 py-2 rounded-full text-sm font-bold"
                  disabled={!colorInput.trim()}
                >
                  إضافة
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {colors.map((color, idx) => (
                  <span key={idx} className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full flex items-center gap-1 text-sm">
                    {color}
                    <button type="button" onClick={() => handleRemoveColor(color)} className="ml-1 text-pink-600 hover:text-red-600 font-bold">×</button>
                  </span>
                ))}
              </div>
              {errors.colors && <p className="text-red-600 text-sm mt-1">{errors.colors}</p>}
            </div>
            {/* زر الإضافة */}
            <div className="text-center">
              <button
                type="submit"
                className="btn-primary px-8 py-2 rounded-full text-lg font-bold"
              >
                إضافة الفستان
              </button>
            </div>
            {success && <p className="text-green-700 text-center font-bold">تمت إضافة الفستان بنجاح (تخزين مؤقت)!</p>}
          </form>
        </motion.div>
      </div>
    </div>
  )
} 