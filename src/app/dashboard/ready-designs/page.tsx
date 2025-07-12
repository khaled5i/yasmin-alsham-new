"use client"

import { useState } from "react"
import { allDesigns, Design } from '@/data/designs'
import { motion } from 'framer-motion'
import { Palette, Edit2, Save, X, ArrowRight } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import Link from 'next/link'

export default function ReadyDesignsAdmin() {
  const [editingId, setEditingId] = useState<number|null>(null)
  const [editData, setEditData] = useState<Partial<Design>>({})
  const [colorsInput, setColorsInput] = useState("")
  const [success, setSuccess] = useState(false)

  const startEdit = (design: Design) => {
    setEditingId(design.id)
    setEditData({ ...design })
    setColorsInput("")
    setSuccess(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
    setColorsInput("")
    setSuccess(false)
  }

  const handleEditChange = (field: keyof Design, value: any) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddColor = () => {
    const color = colorsInput.trim()
    if (color && !editData.colors?.includes(color)) {
      setEditData(prev => ({ ...prev, colors: [...(prev.colors||[]), color] }))
      setColorsInput("")
    }
  }

  const handleRemoveColor = (color: string) => {
    setEditData(prev => ({ ...prev, colors: (prev.colors||[]).filter(c => c !== color) }))
  }

  const handleSave = () => {
    if (!editData.id) return
    const idx = allDesigns.findIndex(d => d.id === editData.id)
    if (idx !== -1) {
      allDesigns[idx] = { ...allDesigns[idx], ...editData } as Design
      setSuccess(true)
      setTimeout(() => {
        setEditingId(null)
        setEditData({})
        setSuccess(false)
      }, 1200)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* زر الرجوع */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
            style={{marginTop: 0}}
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة إلى لوحة المدير</span>
          </Link>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex items-center gap-2"
        >
          <Palette className="w-7 h-7 text-purple-600" />
          <h1 className="text-2xl font-bold">إدارة التصاميم الجاهزة</h1>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {allDesigns.map(design => (
            <motion.div
              key={design.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white/80 rounded-xl border border-pink-100 shadow-lg p-4 flex flex-col"
            >
              {editingId === design.id ? (
                <>
                  <ImageUpload images={editData.images||[]} onImagesChange={imgs => handleEditChange('images', imgs)} maxImages={8} />
                  <input
                    type="text"
                    value={editData.title||''}
                    onChange={e => handleEditChange('title', e.target.value)}
                    className="block w-full border rounded p-2 mt-3 mb-2 focus:ring-2 focus:ring-pink-300"
                    placeholder="اسم الفستان"
                  />
                  <textarea
                    value={editData.description||''}
                    onChange={e => handleEditChange('description', e.target.value)}
                    className="block w-full border rounded p-2 mb-2 focus:ring-2 focus:ring-pink-300"
                    placeholder="وصف الفستان"
                  />
                  <input
                    type="number"
                    value={editData.price||''}
                    onChange={e => handleEditChange('price', e.target.value)}
                    className="block w-full border rounded p-2 mb-2 focus:ring-2 focus:ring-pink-300"
                    placeholder="السعر"
                    min="1"
                  />
                  {/* المقاسات */}
                  <div className="mb-2">
                    <label className="block font-medium mb-1">المقاسات المتوفرة</label>
                    <div className="flex flex-wrap gap-2">
                      {["XS","S","M","L","XL","XXL"].map(size => (
                        <label key={size} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editData.sizes?.includes(size) || false}
                            onChange={() => handleEditChange('sizes', editData.sizes?.includes(size)
                              ? (editData.sizes||[]).filter(s => s !== size)
                              : [...(editData.sizes||[]), size])}
                            className="accent-pink-600"
                          />
                          <span>{size}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* الألوان */}
                  <div className="mb-2">
                    <label className="block font-medium mb-1">الألوان المتوفرة</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={colorsInput}
                        onChange={e => setColorsInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddColor() } }}
                        className="border rounded p-2 flex-1 focus:ring-2 focus:ring-pink-300"
                        placeholder="أدخل لون واضغط إضافة"
                      />
                      <button
                        type="button"
                        onClick={handleAddColor}
                        className="btn-secondary px-4 py-2 rounded-full text-sm font-bold"
                        disabled={!colorsInput.trim()}
                      >
                        إضافة
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(editData.colors||[]).map((color, idx) => (
                        <span key={idx} className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full flex items-center gap-1 text-sm">
                          {color}
                          <button type="button" onClick={() => handleRemoveColor(color)} className="ml-1 text-pink-600 hover:text-red-600 font-bold">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2">
                      <Save className="w-4 h-4" /> حفظ التعديلات
                    </button>
                    <button onClick={cancelEdit} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                      <X className="w-4 h-4" /> إلغاء
                    </button>
                  </div>
                  {success && <p className="text-green-700 text-center font-bold mt-2">تم حفظ التعديلات بنجاح!</p>}
                </>
              ) : (
                <>
                  <div className="aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 relative overflow-hidden rounded-xl mb-3">
                    <img
                      src={design.images && design.images.length > 0 ? design.images[0] : '/wedding-dress-1.jpg.jpg'}
                      alt={design.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-bold text-gray-800 mb-1">{design.title}</h3>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{design.description}</p>
                  <div className="text-lg font-bold text-pink-600 mb-2">السعر: {Number(design.price).toLocaleString('en')} ريال</div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(design.sizes||[]).map(size => (
                      <span key={size} className="bg-pink-50 text-pink-700 px-2 py-0.5 rounded text-xs">{size}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(design.colors||[]).map(color => (
                      <span key={color} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs">{color}</span>
                    ))}
                  </div>
                  <button onClick={() => startEdit(design)} className="btn-secondary w-full flex items-center justify-center gap-2 mt-auto">
                    <Edit2 className="w-4 h-4" /> تعديل
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
} 