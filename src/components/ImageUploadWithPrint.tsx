'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image as ImageIcon, Plus, Loader2, AlertCircle, CheckCircle, Camera, Printer } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { imageService, UploadProgress } from '@/lib/services/image-service'

interface ImageUploadWithPrintProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  printableImages: string[]
  onPrintableImagesChange: (printableImages: string[]) => void
  maxImages?: number
  useSupabaseStorage?: boolean
  acceptVideo?: boolean
  showPrintOption?: boolean
}

interface FileProgress {
  file: File
  progress: UploadProgress
}

export default function ImageUploadWithPrint({
  images,
  onImagesChange,
  printableImages,
  onPrintableImagesChange,
  maxImages = 999,
  useSupabaseStorage = true,
  acceptVideo = true,
  showPrintOption = true
}: ImageUploadWithPrintProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Map<string, FileProgress>>(new Map())
  const [errors, setErrors] = useState<string[]>([])
  const [showOptions, setShowOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  // تبديل حالة الطباعة للصورة
  const togglePrintable = (imageUrl: string) => {
    if (printableImages.includes(imageUrl)) {
      onPrintableImagesChange(printableImages.filter(img => img !== imageUrl))
    } else {
      onPrintableImagesChange([...printableImages, imageUrl])
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || uploading) return
    const remainingSlots = maxImages - images.length
    const filesToUpload = Array.from(files).slice(0, remainingSlots)
    if (filesToUpload.length === 0) return

    setUploading(true)
    setErrors([])
    const newImages: string[] = []
    const progressMap = new Map<string, FileProgress>()

    filesToUpload.forEach(file => {
      progressMap.set(file.name, {
        file,
        progress: { fileName: file.name, progress: 0, status: 'uploading' }
      })
    })
    setUploadProgress(progressMap)

    for (const file of filesToUpload) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')

      if (!isImage && !isVideo) {
        setErrors(prev => [...prev, `${file.name}: نوع الملف غير مدعوم`])
        continue
      }

      if (isVideo && !acceptVideo) {
        setErrors(prev => [...prev, `${file.name}: الفيديوهات غير مسموحة`])
        continue
      }

      if (useSupabaseStorage) {
        const { data, error } = await imageService.uploadImage(file, (progress) => {
          setUploadProgress(prev => {
            const newMap = new Map(prev)
            const fileProgress = newMap.get(file.name)
            if (fileProgress) {
              fileProgress.progress = progress
              newMap.set(file.name, fileProgress)
            }
            return newMap
          })
        })
        if (error) {
          setErrors(prev => [...prev, `${file.name}: ${error}`])
        } else if (data) {
          newImages.push(data.url)
        }
      } else {
        const { data, error } = await imageService.uploadAsBase64(file)
        if (error) {
          setErrors(prev => [...prev, `${file.name}: ${error}`])
        } else if (data) {
          newImages.push(data.url)
        }
        setUploadProgress(prev => {
          const newMap = new Map(prev)
          const fileProgress = newMap.get(file.name)
          if (fileProgress) {
            fileProgress.progress = { fileName: file.name, progress: 100, status: 'success' }
            newMap.set(file.name, fileProgress)
          }
          return newMap
        })
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages])
    }

    setTimeout(() => {
      setUploading(false)
      setUploadProgress(new Map())
    }, 2000)
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
    const imageToRemove = images[index]
    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
    // إزالة الصورة من قائمة الطباعة أيضاً
    if (printableImages.includes(imageToRemove)) {
      onPrintableImagesChange(printableImages.filter(img => img !== imageToRemove))
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
    setShowOptions(false)
  }

  const openCameraDialog = () => {
    cameraInputRef.current?.click()
    setShowOptions(false)
  }

  const handleUploadClick = () => {
    if (uploading || images.length >= maxImages) return
    setShowOptions(!showOptions)
  }

  useEffect(() => {
    const handleClickOutside = () => {
      if (showOptions) setShowOptions(false)
    }
    if (showOptions) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showOptions])

  return (
    <div className="space-y-4">
      {/* منطقة رفع الصور */}
      <div className="relative">
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300 ${uploading ? 'border-blue-400 bg-blue-50 cursor-wait'
              : dragOver ? 'border-pink-400 bg-pink-50 cursor-pointer'
                : images.length >= maxImages ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50 cursor-pointer'
            }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={!uploading && images.length < maxImages ? handleUploadClick : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptVideo ? "image/*,video/*" : "image/*"}
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={images.length >= maxImages || uploading}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={images.length >= maxImages || uploading}
          />

          {uploading ? (
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 text-blue-500 mx-auto animate-spin" />
              <p className="text-lg font-medium text-blue-700">جاري رفع الصور...</p>
            </div>
          ) : images.length >= maxImages ? (
            <div className="space-y-2">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="text-gray-500">{t('max_images_reached')} ({maxImages})</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <div>
                <p className="text-lg font-medium text-gray-700">
                  {dragOver ? t('drop_images_here') : 'اضغط لرفع الصور والفيديوهات'}
                </p>
                <p className="text-sm text-gray-500">
                  {acceptVideo ? 'التقط صورة أو اختر من المعرض • صور وفيديوهات' : 'التقط صورة أو اختر من المعرض'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* قائمة الخيارات */}
        {showOptions && !uploading && images.length < maxImages && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20"
          >
            <button onClick={(e) => { e.stopPropagation(); openCameraDialog() }}
              className="w-full px-4 py-3 text-right hover:bg-pink-50 flex items-center space-x-3 space-x-reverse border-b border-gray-100">
              <Camera className="w-5 h-5 text-pink-600" />
              <span className="text-sm font-medium text-gray-800">التقاط صورة</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); openFileDialog() }}
              className="w-full px-4 py-3 text-right hover:bg-pink-50 flex items-center space-x-3 space-x-reverse">
              <ImageIcon className="w-5 h-5 text-pink-600" />
              <span className="text-sm font-medium text-gray-800">اختيار من المعرض</span>
            </button>
          </motion.div>
        )}
      </div>

      {/* رسائل الأخطاء */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 ml-2" />
            <div>
              <p className="text-sm font-medium text-red-800 mb-1">حدثت أخطاء:</p>
              <ul className="text-xs text-red-700 space-y-1">
                {errors.map((error, idx) => <li key={idx}>• {error}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* معرض الصور مع خيار الطباعة */}
      {images.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-700">الملفات المرفوعة:</h4>
            {showPrintOption && printableImages.length > 0 && (
              <span className="text-xs text-pink-600 font-medium flex items-center gap-1">
                <Printer className="w-3 h-3" />
                {printableImages.length} صورة محددة للطباعة
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {images.map((image, index) => {
                const isVideo = image.includes('.mp4') || image.includes('.mov') || image.includes('.avi') || image.includes('.webm') || image.includes('video')
                const isPrintable = printableImages.includes(image)

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group"
                  >
                    <div className={`aspect-square rounded-lg overflow-hidden border-2 bg-gray-100 ${isPrintable ? 'border-pink-500' : 'border-gray-200'}`}>
                      {isVideo ? (
                        <video src={image} controls className="w-full h-full object-cover" preload="metadata" />
                      ) : (
                        <img src={image} alt={`صورة ${index + 1}`} className="w-full h-full object-cover" />
                      )}
                    </div>

                    {/* زر الحذف */}
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* رقم الصورة */}
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      {index + 1} {isVideo && '🎥'}
                    </div>

                    {/* زر إضافة للطباعة - فقط للصور (ليس الفيديو) */}
                    {showPrintOption && !isVideo && (
                      <button
                        onClick={() => togglePrintable(image)}
                        className={`print-toggle-btn ${isPrintable ? 'selected' : 'not-selected'}`}
                        title={isPrintable ? 'إزالة من الطباعة' : 'إضافة للطباعة'}
                      >
                        <Printer className="w-3 h-3" />
                        <span>{isPrintable ? 'للطباعة ✓' : 'طباعة'}</span>
                      </button>
                    )}
                  </motion.div>
                )
              })}

              {/* زر إضافة المزيد */}
              {images.length < maxImages && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-400 hover:bg-pink-50 transition-all"
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

