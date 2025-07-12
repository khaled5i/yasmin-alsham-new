'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image as ImageIcon, Plus } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface ImageUploadProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
}

export default function ImageUpload({ images, onImagesChange, maxImages = 10 }: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newImages: string[] = []
    const remainingSlots = maxImages - images.length

    Array.from(files).slice(0, remainingSlots).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result) {
            newImages.push(result)
            if (newImages.length === Math.min(files.length, remainingSlots)) {
              onImagesChange([...images, ...newImages])
            }
          }
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* منطقة رفع الصور */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300 cursor-pointer ${
          dragOver
            ? 'border-pink-400 bg-pink-50'
            : images.length >= maxImages
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={images.length < maxImages ? openFileDialog : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          disabled={images.length >= maxImages}
        />

        {images.length >= maxImages ? (
          <div className="space-y-2">
            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto" />
            <p className="text-gray-500">{t('max_images_reached')} ({maxImages})</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Upload className="w-12 h-12 text-gray-400 mx-auto" />
            <div>
              <p className="text-lg font-medium text-gray-700">
                {dragOver ? t('drop_images_here') : t('click_or_drag_images')}
              </p>
              <p className="text-sm text-gray-500">
                {t('image_upload_format')} ({t('max_images_text')} {maxImages} {t('images_text')})
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {images.length} {t('of')} {maxImages} {t('images_text')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* معرض الصور */}
      {images.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700">الصور المرفوعة:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {images.map((image, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={image}
                      alt={`صورة ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* زر الحذف */}
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  
                  {/* رقم الصورة */}
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                    {index + 1}
                  </div>
                </motion.div>
              ))}
              
              {/* زر إضافة المزيد */}
              {images.length < maxImages && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-400 hover:bg-pink-50 transition-all duration-300"
                  onClick={openFileDialog}
                >
                  <div className="text-center">
                    <Plus className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">{t('add_image')}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}
