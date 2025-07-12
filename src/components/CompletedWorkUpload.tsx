'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Upload, X, Image as ImageIcon, Camera } from 'lucide-react'

interface CompletedWorkUploadProps {
  onImagesChange: (images: string[]) => void
  maxImages?: number
  disabled?: boolean
}

export default function CompletedWorkUpload({ 
  onImagesChange, 
  maxImages = 3, 
  disabled = false 
}: CompletedWorkUploadProps) {
  const [images, setImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (files: FileList | null) => {
    if (!files || disabled) return

    const newImages: string[] = []
    const remainingSlots = maxImages - images.length

    Array.from(files).slice(0, remainingSlots).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const base64 = e.target?.result as string
          newImages.push(base64)
          
          if (newImages.length === Math.min(files.length, remainingSlots)) {
            const updatedImages = [...images, ...newImages]
            setImages(updatedImages)
            onImagesChange(updatedImages)
          }
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const removeImage = (index: number) => {
    if (disabled) return
    const updatedImages = images.filter((_, i) => i !== index)
    setImages(updatedImages)
    onImagesChange(updatedImages)
  }

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          صور العمل المكتمل
        </label>
        <span className="text-xs text-gray-500">
          {images.length}/{maxImages} صور
        </span>
      </div>

      {/* منطقة رفع الصور */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300
          ${isDragging 
            ? 'border-pink-400 bg-pink-50' 
            : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${images.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          disabled={disabled || images.length >= maxImages}
        />

        <div className="space-y-2">
          <Camera className="w-12 h-12 text-gray-400 mx-auto" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              {images.length >= maxImages 
                ? 'تم الوصول للحد الأقصى من الصور'
                : 'اضغط لرفع صور العمل المكتمل'
              }
            </p>
            {images.length < maxImages && (
              <p className="text-xs text-gray-500 mt-1">
                أو اسحب الصور هنا • JPG, PNG, GIF
              </p>
            )}
          </div>
        </div>
      </div>

      {/* عرض الصور المرفوعة */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((image, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative group"
            >
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={image}
                  alt={`صورة العمل ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeImage(index)
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              
              <div className="absolute bottom-2 left-2 right-2">
                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                  صورة {index + 1}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-2 space-x-reverse">
            <ImageIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-800 mb-1">ملاحظة مهمة:</p>
              <p className="text-blue-700">
                هذه الصور ستكون مرئية للمدير فقط ولن تظهر للعملاء في صفحة تتبع الطلبات.
                تُستخدم لتوثيق جودة العمل المكتمل.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
