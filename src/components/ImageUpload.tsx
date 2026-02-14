'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image as ImageIcon, Plus, Loader2, AlertCircle, CheckCircle, Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { imageService, UploadProgress } from '@/lib/services/image-service'

interface ImageUploadProps {
  images: string[]
  onImagesChange: (images: string[]) => void
  maxImages?: number
  useSupabaseStorage?: boolean // استخدام Supabase Storage أو base64
  acceptVideo?: boolean
  alwaysShowDeleteOnMobileAndTablet?: boolean
}

interface FileProgress {
  file: File
  progress: UploadProgress
}

const isVideoFile = (fileUrl: string) => {
  const url = fileUrl.toLowerCase()
  return (
    url.includes('.mp4') ||
    url.includes('.mov') ||
    url.includes('.avi') ||
    url.includes('.webm') ||
    url.includes('video')
  )
}

export default function ImageUpload({
  images,
  onImagesChange,
  maxImages = 999,
  useSupabaseStorage = true,
  acceptVideo = true,
  alwaysShowDeleteOnMobileAndTablet = false
}: ImageUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Map<string, FileProgress>>(new Map())
  const [errors, setErrors] = useState<string[]>([])
  const [showOptions, setShowOptions] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isClientMounted, setIsClientMounted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  const imageOnlyIndices = useMemo(
    () => images.reduce<number[]>((acc, image, index) => {
      if (!isVideoFile(image)) acc.push(index)
      return acc
    }, []),
    [images]
  )
  const currentLightboxPosition = useMemo(
    () => (lightboxIndex === null ? -1 : imageOnlyIndices.indexOf(lightboxIndex)),
    [imageOnlyIndices, lightboxIndex]
  )
  const activeLightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null
  const canNavigateLightbox = imageOnlyIndices.length > 1
  const deleteButtonVisibilityClass = alwaysShowDeleteOnMobileAndTablet
    ? 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
    : 'opacity-0 group-hover:opacity-100'

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

    // رفع الصور والفيديوهات
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

  // دالة للصق الصور من الحافظة
  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      const dataTransfer = new DataTransfer()
      files.forEach(file => dataTransfer.items.add(file))
      await handleFileSelect(dataTransfer.files)
    }
  }

  // إضافة مستمع للصق عند تحميل المكون
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => handlePaste(e)
    document.addEventListener('paste', handlePasteEvent)
    return () => {
      document.removeEventListener('paste', handlePasteEvent)
    }
  }, [images, uploading])

  const openFileDialog = () => {
    fileInputRef.current?.click()
    setShowOptions(false)
  }

  // دالة للصق من الحافظة عند الضغط على الزر
  const handlePasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read()
      const files: File[] = []

      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type)
            const file = new File([blob], `pasted-image-${Date.now()}.png`, { type })
            files.push(file)
          }
        }
      }

      if (files.length > 0) {
        const dataTransfer = new DataTransfer()
        files.forEach(file => dataTransfer.items.add(file))
        await handleFileSelect(dataTransfer.files)
      } else {
        setErrors(prev => [...prev, 'لا توجد صور في الحافظة'])
      }
    } catch (error) {
      console.error('Error reading clipboard:', error)
      setErrors(prev => [...prev, 'فشل قراءة الحافظة. تأكد من منح الإذن للمتصفح'])
    }
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
    const handleClickOutside = () => {
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

  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
  }, [])

  const goToLightboxPosition = useCallback((nextPosition: number) => {
    if (imageOnlyIndices.length === 0) return
    const nextIndex = imageOnlyIndices[nextPosition]
    if (typeof nextIndex === 'number') {
      setLightboxIndex(nextIndex)
    }
  }, [imageOnlyIndices])

  const showPreviousImage = useCallback(() => {
    if (!canNavigateLightbox || currentLightboxPosition < 0) return
    const previousPosition = (currentLightboxPosition - 1 + imageOnlyIndices.length) % imageOnlyIndices.length
    goToLightboxPosition(previousPosition)
  }, [canNavigateLightbox, currentLightboxPosition, imageOnlyIndices.length, goToLightboxPosition])

  const showNextImage = useCallback(() => {
    if (!canNavigateLightbox || currentLightboxPosition < 0) return
    const nextPosition = (currentLightboxPosition + 1) % imageOnlyIndices.length
    goToLightboxPosition(nextPosition)
  }, [canNavigateLightbox, currentLightboxPosition, imageOnlyIndices.length, goToLightboxPosition])

  useEffect(() => {
    if (lightboxIndex === null) return

    const activeImage = images[lightboxIndex]
    if (!activeImage || isVideoFile(activeImage)) {
      setLightboxIndex(imageOnlyIndices[0] ?? null)
    }
  }, [images, lightboxIndex, imageOnlyIndices])

  useEffect(() => {
    if (lightboxIndex === null) return

    const originalOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowLeft') showPreviousImage()
      if (event.key === 'ArrowRight') showNextImage()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [lightboxIndex, closeLightbox, showPreviousImage, showNextImage])

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
            accept={acceptVideo ? "image/*,video/*" : "image/*"}
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
                  {dragOver ? t('drop_images_here') : 'اضغط لرفع الصور والفيديوهات'}
                </p>
                <p className="text-sm text-gray-500">
                  {acceptVideo
                    ? 'التقط صورة أو اختر من المعرض • صور وفيديوهات'
                    : 'التقط صورة أو اختر من المعرض • JPG, PNG, WEBP'
                  }
                </p>
                <p className="text-xs text-pink-600 mt-2 font-medium">
                  💡 يمكنك لصق الصور مباشرة (Ctrl+V أو Cmd+V)
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {images.length} ملف محمّل
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
              className="w-full px-4 py-3 text-right hover:bg-pink-50 transition-colors duration-200 flex items-center space-x-3 space-x-reverse border-b border-gray-100"
            >
              <ImageIcon className="w-5 h-5 text-pink-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">اختيار من المعرض</p>
                <p className="text-xs text-gray-500">اختر صور موجودة من جهازك</p>
              </div>
            </button>

            {/* زر لصق من الحافظة - يظهر فقط على الكمبيوتر */}
            {typeof window !== 'undefined' && !('ontouchstart' in window) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handlePasteFromClipboard()
                }}
                className="w-full px-4 py-3 text-right hover:bg-pink-50 transition-colors duration-200 flex items-center space-x-3 space-x-reverse"
              >
                <Upload className="w-5 h-5 text-pink-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">لصق من الحافظة</p>
                  <p className="text-xs text-gray-500">الصق الصور المنسوخة (Ctrl+V)</p>
                </div>
              </button>
            )}
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

      {/* معرض الصور والفيديوهات */}
      {images.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-gray-700">الملفات المرفوعة:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {images.map((image, index) => {
                // تحديد نوع الملف من الرابط
                const isVideo = isVideoFile(image)

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="relative group"
                  >
                    <div
                      className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer"
                      onClick={() => !isVideo && setLightboxIndex(index)}
                    >
                      {isVideo ? (
                        <video
                          src={image}
                          controls
                          className="w-full h-full object-cover"
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={image}
                          alt={`صورة ${index + 1}`}
                          className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                        />
                      )}
                    </div>

                    {/* زر الحذف */}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center transition-opacity duration-300 hover:bg-red-600 ${deleteButtonVisibilityClass}`}
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* رقم الملف ونوعه */}
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      {index + 1} {isVideo && '🎥'}
                    </div>
                  </motion.div>
                )
              })}

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

      {/* Lightbox لعرض الصورة بحجم كامل */}
      {isClientMounted && createPortal(
        <AnimatePresence>
          {lightboxIndex !== null && activeLightboxImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm"
              onClick={closeLightbox}
            >
              <div className="relative h-full w-full flex items-center justify-center px-4 sm:px-8 py-16">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeLightbox()
                  }}
                  className="absolute top-4 right-4 w-11 h-11 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
                >
                  <X className="w-6 h-6" />
                </button>

                <div className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 text-white text-sm z-20">
                  {Math.max(currentLightboxPosition + 1, 1)} / {imageOnlyIndices.length}
                </div>

                {canNavigateLightbox && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      showPreviousImage()
                    }}
                    className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}

                {canNavigateLightbox && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      showNextImage()
                    }}
                    className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-20"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}

                <motion.img
                  key={activeLightboxImage}
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  src={activeLightboxImage}
                  alt={`Preview ${currentLightboxPosition + 1}`}
                  className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />

                {canNavigateLightbox && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,760px)] z-20">
                    <div className="bg-black/45 backdrop-blur-md rounded-xl p-2 flex items-center gap-2 overflow-x-auto">
                      {imageOnlyIndices.map((imageIndex, thumbPosition) => (
                        <button
                          key={`${imageIndex}-${thumbPosition}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLightboxIndex(imageIndex)
                          }}
                          className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                            imageIndex === lightboxIndex
                              ? 'border-pink-400 opacity-100'
                              : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={images[imageIndex]}
                            alt={`Thumbnail ${thumbPosition + 1}`}
                            className="w-14 h-14 sm:w-16 sm:h-16 object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}



