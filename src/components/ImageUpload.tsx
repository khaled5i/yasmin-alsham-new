'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image as ImageIcon, Plus, Loader2, AlertCircle, CheckCircle, Camera } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { imageService, UploadProgress } from '@/lib/services/image-service'

interface ImageUploadProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
  useSupabaseStorage?: boolean // استخدام Supabase Storage أو base64
}

interface FileProgress {
  file: File
  progress: UploadProgress
}

export default function ImageUpload({
  images,
  onImagesChange,
  maxImages = 10,
  useSupabaseStorage = true
}: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Map<string, FileProgress>>(new Map())
  const [errors, setErrors] = useState<string[]>([])
  const [showOptions, setShowOptions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || uploading) return

    const remainingSlots = maxImages - images.length
    const filesToUpload = Array.from(files).slice(0, remainingSlots)

    if (filesToUpload.length === 0) return

    setUploading(true)
    setErrors([])

    const newImages: string[] = []
    const progressMap = new Map<string, FileProgress>()

    // تهيئة progress لكل ملف
    filesToUpload.forEach(file => {
      progressMap.set(file.name, {
        file,
        progress: {
          fileName: file.name,
          progress: 0,
          status: 'uploading'
        }
      })
    })
    setUploadProgress(progressMap)

    // رفع الصور
    for (const file of filesToUpload) {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => [...prev, `${file.name}: نوع الملف غير مدعوم`])
        continue
      }

      if (useSupabaseStorage) {
        // رفع إلى Supabase Storage
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
        // تحويل إلى base64 (الطريقة القديمة)
        const { data, error } = await imageService.uploadAsBase64(file)

        if (error) {
          setErrors(prev => [...prev, `${file.name}: ${error}`])
        } else if (data) {
          newImages.push(data.url)
        }

        // تحديث progress يدوياً
        setUploadProgress(prev => {
          const newMap = new Map(prev)
          const fileProgress = newMap.get(file.name)
          if (fileProgress) {
            fileProgress.progress = {
              fileName: file.name,
              progress: 100,
              status: 'success'
            }
            newMap.set(file.name, fileProgress)
          }
          return newMap
        })
      }
    }

    // إضافة الصور الجديدة
    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages])
    }

    // إعادة تعيين الحالة بعد 2 ثانية
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
    const newImages = images.filter((_, i) => i !== index)
    onImagesChange(newImages)
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
      {/* منطقة رفع الصور */}
      <div className="relative">
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300 ${uploading
            ? 'border-blue-400 bg-blue-50 cursor-wait'
            : dragOver
              ? 'border-pink-400 bg-pink-50 cursor-pointer'
              : images.length >= maxImages
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 hover:border-pink-400 hover:bg-pink-50 cursor-pointer'
            }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={!uploading && images.length < maxImages ? handleUploadClick : undefined}
        >
          {/* Input للمعرض */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={images.length >= maxImages || uploading}
          />

          {/* Input للكاميرا */}
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
                  {dragOver ? t('drop_images_here') : 'اضغط لرفع الصور'}
                </p>
                <p className="text-sm text-gray-500">
                  التقط صورة أو اختر من المعرض • JPG, PNG, WEBP
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {images.length} {t('of')} {maxImages} {t('images_text')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* قائمة الخيارات (كاميرا / معرض) */}
        {showOptions && !uploading && images.length < maxImages && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-20"
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

      {/* شريط التقدم (Progress Bars) */}
      {uploadProgress.size > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-700 text-sm">جاري الرفع:</h4>
          {Array.from(uploadProgress.values()).map(({ file, progress }) => (
            <div key={file.name} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                {progress.status === 'success' && (
                  <CheckCircle className="w-4 h-4 text-green-500 ml-2" />
                )}
                {progress.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500 ml-2" />
                )}
                {progress.status === 'uploading' && (
                  <Loader2 className="w-4 h-4 text-blue-500 ml-2 animate-spin" />
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${progress.status === 'success'
                    ? 'bg-green-500'
                    : progress.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                    }`}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">
                  {progress.status === 'compressing' && 'جاري الضغط...'}
                  {progress.status === 'uploading' && 'جاري الرفع...'}
                  {progress.status === 'success' && 'تم بنجاح'}
                  {progress.status === 'error' && progress.error}
                </span>
                <span className="text-xs text-gray-500">{progress.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* رسائل الأخطاء */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 ml-2" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 mb-1">حدثت أخطاء أثناء الرفع:</p>
              <ul className="text-xs text-red-700 space-y-1">
                {errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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
