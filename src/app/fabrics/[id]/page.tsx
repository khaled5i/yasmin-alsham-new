'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight, X, Loader2, Ruler, Palette, Sparkles, Info, MessageCircle } from 'lucide-react'
import { useFabricStore, formatFabricPrice, Fabric, getFinalPrice } from '@/store/fabricStore'

export default function FabricDetailPage() {
  const params = useParams()
  const fabricId = params.id as string
  const { fabrics, loadFabrics, isLoading, getFabricById } = useFabricStore()

  const [fabric, setFabric] = useState<Fabric | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState('')

  useEffect(() => {
    if (fabrics.length === 0) loadFabrics()
  }, [fabrics.length, loadFabrics])

  useEffect(() => {
    if (fabrics.length > 0 && fabricId) {
      const foundFabric = getFabricById(fabricId)
      setFabric(foundFabric || null)
    }
  }, [fabrics, fabricId, getFabricById])

  useEffect(() => {
    if (fabric?.available_colors && fabric.available_colors.length > 0) {
      setSelectedColor(fabric.available_colors[0])
    }
  }, [fabric])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-pink-600 animate-spin mb-4" />
          <p className="text-gray-600">جاري تحميل القماش...</p>
        </div>
      </div>
    )
  }

  if (!fabric && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">القماش غير موجود</h1>
          <Link href="/fabrics" className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300">
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى متجر الأقمشة</span>
          </Link>
        </div>
      </div>
    )
  }

  if (!fabric) return null

  const nextImage = () => {
    if (!fabric) return
    setCurrentImageIndex((prev) => (prev + 1) % (fabric.images?.length || 1))
  }

  const prevImage = () => {
    if (!fabric) return
    setCurrentImageIndex((prev) => prev === 0 ? (fabric.images?.length || 1) - 1 : prev - 1)
  }

  const openGallery = () => {
    setIsGalleryOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeGallery = () => {
    setIsGalleryOpen(false)
    document.body.style.overflow = 'unset'
  }

  const finalPrice = getFinalPrice(fabric)

  // رابط واتساب للاستفسار
  const whatsappMessage = `مرحباً، أود الاستفسار عن القماش: ${fabric.name}`
  const whatsappLink = `https://wa.me/966500000000?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-16 lg:pt-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* التنقل */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <Link
            href="/fabrics"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى متجر الأقمشة</span>
          </Link>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
            <div className="relative aspect-[4/5] bg-gradient-to-br from-pink-100 via-rose-100 to-purple-100 rounded-2xl overflow-hidden mb-4 group cursor-pointer" onClick={openGallery}>
              <Image
                src={fabric.images?.[currentImageIndex] || fabric.image_url || '/wedding-dress-1.jpg.jpg'}
                alt={`${fabric.name} - صورة ${currentImageIndex + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-300"
                priority={currentImageIndex === 0}
                quality={85}
              />

              {(fabric.images?.length || 0) > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); prevImage() }} className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300 z-10" aria-label="الصورة السابقة">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextImage() }} className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-300 z-10" aria-label="الصورة التالية">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {(fabric.images?.length || 0) > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {fabric.images?.map((image, index) => (
                  <motion.button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative flex-shrink-0 w-24 h-28 rounded-xl overflow-hidden border-3 transition-all duration-300 ${
                      currentImageIndex === index ? 'border-pink-500 shadow-lg ring-2 ring-pink-300' : 'border-gray-200 hover:border-pink-300'
                    }`}
                  >
                    <Image src={image} alt={`${fabric.name} - صورة ${index + 1}`} fill sizes="96px" className="object-cover" loading="lazy" quality={60} />
                    {currentImageIndex === index && <div className="absolute inset-0 bg-pink-500/20 pointer-events-none" />}
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">{index + 1}</div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="space-y-6">
            <div>
              <span className="bg-gradient-to-r from-pink-100 to-rose-100 text-pink-700 px-3 py-1 rounded-full text-sm font-medium">{fabric.category}</span>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-800 mt-4 mb-4">{fabric.name}</h1>
              <p className="text-lg text-gray-600 leading-relaxed">{fabric.description}</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-3xl font-bold text-pink-600">
                {fabric.is_on_sale ? (
                  <div className="flex items-center gap-3">
                    <span>{formatFabricPrice(finalPrice)}</span>
                    <span className="text-xl text-gray-400 line-through">{formatFabricPrice(fabric.price_per_meter)}</span>
                    <span className="bg-red-500 text-white text-sm px-2 py-1 rounded-full">خصم {fabric.discount_percentage}%</span>
                  </div>
                ) : (
                  <span>{formatFabricPrice(fabric.price_per_meter)}</span>
                )}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-bold ${fabric.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {fabric.is_available ? 'متوفر' : 'غير متوفر'}
              </div>
            </div>

            {fabric.available_colors && fabric.available_colors.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  الألوان المتاحة
                </h3>
                <div className="flex flex-wrap gap-2">
                  {fabric.available_colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-4 py-2 rounded-lg border-2 transition-all duration-300 ${
                        selectedColor === color ? 'border-pink-500 bg-pink-50 text-pink-700 font-bold' : 'border-gray-200 hover:border-pink-300 text-gray-700'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 shadow-lg space-y-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Info className="w-5 h-5 text-pink-600" />
                المواصفات الفنية
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {fabric.width_cm && (
                  <div className="flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-pink-600" />
                    <span className="text-sm text-gray-600">العرض:</span>
                    <span className="font-bold text-gray-800">{fabric.width_cm} سم</span>
                  </div>
                )}
                {fabric.fabric_weight && (
                  <div>
                    <span className="text-sm text-gray-600">الوزن:</span>
                    <span className="font-bold text-gray-800 mr-2">{fabric.fabric_weight}</span>
                  </div>
                )}
                {fabric.transparency_level && (
                  <div>
                    <span className="text-sm text-gray-600">الشفافية:</span>
                    <span className="font-bold text-gray-800 mr-2">{fabric.transparency_level}</span>
                  </div>
                )}
                {fabric.elasticity && (
                  <div>
                    <span className="text-sm text-gray-600">المرونة:</span>
                    <span className="font-bold text-gray-800 mr-2">{fabric.elasticity}</span>
                  </div>
                )}
              </div>
            </div>

            {fabric.care_instructions && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  تعليمات العناية
                </h3>
                <p className="text-blue-700 leading-relaxed">{fabric.care_instructions}</p>
              </div>
            )}

            {/* زر الاستفسار عبر الواتساب */}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full border-2 border-green-500 text-green-600 bg-transparent text-center px-8 py-4 rounded-full font-bold hover:bg-green-50 hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <MessageCircle className="w-6 h-6" />
              <span>استفسار عبر الواتساب</span>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {isGalleryOpen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={closeGallery}>
          <button onClick={closeGallery} className="absolute top-4 right-4 text-white hover:text-pink-400 transition-colors duration-300 z-10" aria-label="إغلاق">
            <X className="w-8 h-8" />
          </button>
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <Image
              src={fabric.images?.[currentImageIndex] || fabric.image_url || '/wedding-dress-1.jpg.jpg'}
              alt={`${fabric.name} - صورة ${currentImageIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              quality={95}
            />
            {(fabric.images?.length || 0) > 1 && (
              <>
                <button onClick={prevImage} className="absolute left-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-all duration-300" aria-label="الصورة السابقة">
                  <ChevronRight className="w-6 h-6" />
                </button>
                <button onClick={nextImage} className="absolute right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-all duration-300" aria-label="الصورة التالية">
                  <ChevronLeft className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

