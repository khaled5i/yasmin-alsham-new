'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [showOptions, setShowOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || disabled) return

    const newImages: string[] = []
    const remainingSlots = maxImages - images.length
    const isAndroid = /android/i.test(navigator.userAgent)

    const imageFiles = Array.from(files).slice(0, remainingSlots).filter(f => f.type.startsWith('image/'))
    const expectedCount = imageFiles.length

    for (const file of imageFiles) {
      // على Android، ملفات الكاميرا مدعومة بـ content:// URI قد يصبح غير مستقر
      let safeBlob: Blob = file
      if (isAndroid) {
        try {
          const buffer = await file.arrayBuffer()
          safeBlob = new Blob([buffer], { type: file.type || 'image/jpeg' })
        } catch { safeBlob = file }
      }
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = (e) => reject(e)
        reader.readAsDataURL(safeBlob)
      })
      newImages.push(base64)
    }

    if (newImages.length > 0) {
      const updatedImages = [...images, ...newImages]
      setImages(updatedImages)
      onImagesChange(updatedImages)
    }
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
      setShowOptions(false)
    }
  }

  const openCameraDialog = () => {
    if (!disabled && cameraInputRef.current) {
      cameraInputRef.current.click()
      setShowOptions(false)
    }
  }

  const handleUploadClick = () => {
    if (disabled || images.length >= maxImages) return
    setShowOptions(!showOptions)
  }

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showOptions) {
        setShowOptions(false)
      }
    }

    if (showOptions) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showOptions])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className={`block text-sm font-medium ${images.length === 0 ? 'text-red-700' : 'text-gray-700'
          }`}>
          صور العمل المكتمل <span className="text-red-600">*</span>
        </label>
        <span className={`text-xs ${images.length === 0 ? 'text-red-600 font-medium' : 'text-gray-500'
          }`}>
          {images.length}/{maxImages} صور
        </span>
      </div>

      {/* منطقة رفع الصور */}
      <div className="relative">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleUploadClick}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300
            ${isDragging
              ? 'border-pink-400 bg-pink-50'
              : images.length === 0
                ? 'border-red-300 bg-red-50 hover:border-red-400'
                : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${images.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {/* Input للمعرض */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled || images.length >= maxImages}
          />

          {/* Input للكاميرا */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled || images.length >= maxImages}
          />

          <div className="space-y-2">
            <Camera className={`w-12 h-12 mx-auto ${images.length === 0 ? 'text-red-400' : 'text-gray-400'
              }`} />
            <div>
              <p className={`text-sm font-medium ${images.length === 0 ? 'text-red-700' : 'text-gray-700'
                }`}>
                {images.length >= maxImages
                  ? 'تم الوصول للحد الأقصى من الصور'
                  : images.length === 0
                    ? 'اضغط لرفع صور العمل المكتمل (إلزامي)'
                    : 'اضغط لرفع المزيد من الصور'
                }
              </p>
              {images.length < maxImages && (
                <p className={`text-xs mt-1 ${images.length === 0 ? 'text-red-600' : 'text-gray-500'
                  }`}>
                  {images.length === 0
                    ? 'يجب رفع صورة واحدة على الأقل • التقط صورة أو اختر من المعرض'
                    : 'التقط صورة أو اختر من المعرض أو اسحب الصور هنا'
                  }
                </p>
              )}
            </div>
          </div>
        </div>

        {/* قائمة الخيارات (كاميرا / معرض) */}
        {showOptions && !disabled && images.length < maxImages && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-10"
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                openCameraDialog()
              }}
              className="w-full px-4 py-3 text-right hover:bg-pink-50 transition-colors duration-200 flex items-center space-x-3 space-x-reverse border-b border-gray-100"
            >
              <Camera className="w-5 h-5 text-pink-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">التقاط صورة</p>
                <p className="text-xs text-gray-500">استخدم الكاميرا لالتقاط صورة جديدة</p>
              </div>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                openFileDialog()
              }}
              className="w-full px-4 py-3 text-right hover:bg-pink-50 transition-colors duration-200 flex items-center space-x-3 space-x-reverse"
            >
              <ImageIcon className="w-5 h-5 text-pink-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">اختيار من المعرض</p>
                <p className="text-xs text-gray-500">اختر صور موجودة من جهازك</p>
              </div>
            </button>
          </motion.div>
        )}
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
