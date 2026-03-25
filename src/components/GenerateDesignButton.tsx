'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Sparkles, X, Check, Loader2, ChevronDown, ChevronUp, Download, Plus, MapPin, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { SavedDesignComment } from './InteractiveImageAnnotation'
import { isVideoFile } from '@/lib/utils/media'
import { useTranslation } from '@/hooks/useTranslation'

export interface GenerateDesignButtonProps {
  images: string[]
  designComments: SavedDesignComment[]
  fabric?: string | null
  fabricType?: 'external' | 'internal' | null
  onGenerated: (imageDataUrl: string) => void
  onDeleteGeneratedImage?: (index: number) => void
  generatedImages?: string[]
  disabled?: boolean
  /** اختياري: callback يطلب من الـ parent توليد compositeImages مباشرة من Canvas */
  onRequestDesignImages?: () => Promise<{ front: string | null; back: string | null }>
}

type Step = 'idle' | 'selecting' | 'location-picking' | 'generating-prompt' | 'generating-image' | 'done' | 'error'

interface SecondaryFabric {
  name: string
  color?: string
}

const BODY_AREAS = [
  'كامل الفستان',
  'الصدر',
  'البطن',
  'الظهر',
  'الكتفان',
  'الأكمام',
  'التنورة (الذيل)',
  'الخصر',
  'الياقة',
  'الحاشية (الحافة السفلية)',
  'الأكمام العلوية',
]

const SECONDARY_FABRIC_OPTIONS = [
  'دانتيل',
  'شيفون',
  'ساتان',
  'تول',
  'جورجيت',
  'كريب',
  'مخمل',
  'حرير',
  'قطيفة',
  'موسلين',
  'أورغانزا',
  'جاكار',
  'تافتا',
  'نيوبرين',
  'بروكار',
  'مزدوج',
]

const COLOR_OPTIONS = [
  { label: 'أبيض', hex: '#FFFFFF' },
  { label: 'أسود', hex: '#1a1a1a' },
  { label: 'كريمي', hex: '#F5F0E8' },
  { label: 'ذهبي', hex: '#D4AF37' },
  { label: 'فضي', hex: '#C0C0C0' },
  { label: 'وردي فاتح', hex: '#FFB6C1' },
  { label: 'وردي غامق', hex: '#C71585' },
  { label: 'أحمر', hex: '#CC0000' },
  { label: 'برغندي', hex: '#800020' },
  { label: 'أزرق فاتح', hex: '#87CEEB' },
  { label: 'أزرق كحلي', hex: '#1B2A6B' },
  { label: 'أخضر زيتي', hex: '#6B7C3B' },
  { label: 'أخضر نعناعي', hex: '#98D9C2' },
  { label: 'بنفسجي', hex: '#8B008B' },
  { label: 'ليلكي', hex: '#C8A2C8' },
  { label: 'تركوازي', hex: '#40E0D0' },
  { label: 'برتقالي', hex: '#FF7F00' },
  { label: 'بيج', hex: '#D4B896' },
  { label: 'رمادي', hex: '#808080' },
  { label: 'بني', hex: '#8B4513' },
]

export default function GenerateDesignButton({
  images,
  designComments,
  fabric,
  fabricType,
  onGenerated,
  onDeleteGeneratedImage,
  generatedImages = [],
  disabled = false,
  onRequestDesignImages
}: GenerateDesignButtonProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('idle')
  const [selectedFabricImages, setSelectedFabricImages] = useState<string[]>([])
  const [secondaryFabrics, setSecondaryFabrics] = useState<SecondaryFabric[]>([])
  // Multi-select: Record<fabricKey, string[]>
  const [fabricLocations, setFabricLocations] = useState<Record<string, string[]>>({})
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null)

  // Secondary fabric modal
  const [showSecondaryFabricModal, setShowSecondaryFabricModal] = useState(false)
  const [showCustomFabricInput, setShowCustomFabricInput] = useState(false)
  const [customFabricInput, setCustomFabricInput] = useState('')
  const [pendingFabricName, setPendingFabricName] = useState<string | null>(null)
  const [pendingFabricColor, setPendingFabricColor] = useState<string>('')
  const [customColorInput, setCustomColorInput] = useState('')
  const [showCustomColorInput, setShowCustomColorInput] = useState(false)

  // Location picker: custom "other" inputs
  const [customLocationInputs, setCustomLocationInputs] = useState<Record<string, string>>({})
  const [showCustomLocationFor, setShowCustomLocationFor] = useState<Record<string, boolean>>({})

  const imageOnlyItems = images.filter(img => !isVideoFile(img))

  const toggleFabricImage = useCallback((img: string) => {
    setSelectedFabricImages(prev =>
      prev.includes(img) ? prev.filter(i => i !== img) : [...prev, img]
    )
  }, [])

  const getFrontDesignImage = (): string | null => {
    const frontComment = designComments.find(c => c.view === 'front' || c.title?.startsWith('أمام'))
    return frontComment?.compositeImage || null
  }

  const getBackDesignImage = (): string | null => {
    const backComment = designComments.find(c => c.view === 'back' || c.title?.startsWith('خلف'))
    return backComment?.compositeImage || null
  }

  const totalFabrics = selectedFabricImages.length + secondaryFabrics.length

  // ── Secondary fabric modal handlers ──
  const handleSelectFabricName = (name: string) => {
    setPendingFabricName(name)
    setShowCustomFabricInput(false)
    setCustomFabricInput('')
  }

  const handleConfirmSecondaryFabric = () => {
    const name = pendingFabricName
    if (!name) return
    const color = showCustomColorInput ? customColorInput.trim() : pendingFabricColor
    const label = color ? `${name} (${color})` : name
    if (!secondaryFabrics.some(f => f.name === label)) {
      setSecondaryFabrics(prev => [...prev, { name: label, color }])
    }
    closeSecondaryModal()
  }

  const closeSecondaryModal = () => {
    setShowSecondaryFabricModal(false)
    setPendingFabricName(null)
    setPendingFabricColor('')
    setShowCustomFabricInput(false)
    setCustomFabricInput('')
    setShowCustomColorInput(false)
    setCustomColorInput('')
  }

  const removeSecondaryFabric = (name: string) => {
    setSecondaryFabrics(prev => prev.filter(f => f.name !== name))
  }

  // ── Location picker helpers ──
  const getFabricKeys = () => {
    const keys: { key: string; label: string; imageUrl?: string }[] = []
    selectedFabricImages.forEach((img, i) => {
      keys.push({ key: `img_${i}`, label: `${t('primary_fabric')} ${i + 1}`, imageUrl: img })
    })
    secondaryFabrics.forEach((f, i) => {
      keys.push({ key: `sec_${i}`, label: f.name })
    })
    return keys
  }

  const toggleLocation = (key: string, area: string) => {
    setFabricLocations(prev => {
      const current = prev[key] || []
      if (area === 'كامل الفستان') {
        // Selecting "كامل الفستان" clears everything else
        return { ...prev, [key]: current.includes('كامل الفستان') ? [] : ['كامل الفستان'] }
      }
      // Deselect "كامل الفستان" if selecting a specific area
      const without = current.filter(a => a !== 'كامل الفستان')
      if (without.includes(area)) {
        return { ...prev, [key]: without.filter(a => a !== area) }
      }
      return { ...prev, [key]: [...without, area] }
    })
    setShowCustomLocationFor(prev => ({ ...prev, [key]: false }))
  }

  const addCustomLocation = (key: string) => {
    const val = customLocationInputs[key]?.trim()
    if (!val) return
    setFabricLocations(prev => {
      const current = (prev[key] || []).filter(a => a !== 'كامل الفستان')
      if (current.includes(val)) return prev
      return { ...prev, [key]: [...current, val] }
    })
    setCustomLocationInputs(prev => ({ ...prev, [key]: '' }))
    setShowCustomLocationFor(prev => ({ ...prev, [key]: false }))
  }

  const handleClickGenerate = () => {
    if (selectedFabricImages.length === 0 && imageOnlyItems.length > 0 && secondaryFabrics.length === 0) {
      setErrorMsg(t('select_fabric_first'))
      return
    }
    setErrorMsg('')

    if (totalFabrics > 1) {
      setFabricLocations({})
      setCustomLocationInputs({})
      setShowCustomLocationFor({})
      setStep('location-picking')
    } else {
      doGenerate({})
    }
  }

  const doGenerate = async (locations: Record<string, string[]>) => {
    setStep('generating-prompt')

    // إذا كان يوجد callback، اطلب الصور مباشرة من Canvas (أحدث وأدق)
    let frontDesignImage: string | null
    let backDesignImage: string | null
    if (onRequestDesignImages) {
      const fresh = await onRequestDesignImages()
      frontDesignImage = fresh.front
      backDesignImage = fresh.back
    } else {
      frontDesignImage = getFrontDesignImage()
      backDesignImage = getBackDesignImage()
    }
    const fabricInfo = { fabric: fabric || '', fabricType: fabricType || null }

    const fabricKeys = getFabricKeys()
    const fabricLocationDescriptions = fabricKeys.map(fk => ({
      label: fk.label,
      locations: locations[fk.key] || []
    })).filter(f => f.locations.length > 0)

    const secondaryFabricNames = secondaryFabrics.map(f => f.name)

    try {
      const promptRes = await fetch('/api/generate-design-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontDesignImage,
          backDesignImage,
          fabricImages: selectedFabricImages,
          secondaryFabrics: secondaryFabricNames,
          fabricInfo,
          fabricLocationDescriptions,
          additionalNotes: additionalNotes.trim() || null
        })
      })

      if (!promptRes.ok) {
        const err = await promptRes.json().catch(() => ({}))
        throw new Error(err.error || 'فشل في إنشاء وصف التصميم')
      }

      const { prompt: enhancedPrompt } = await promptRes.json()

      setStep('generating-image')

      const imageRes = await fetch('/api/generate-design-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enhancedPrompt,
          frontDesignImage,
          backDesignImage,
          fabricImages: selectedFabricImages,
          secondaryFabrics: secondaryFabricNames,
          fabricInfo,
          fabricLocationDescriptions,
          additionalNotes: additionalNotes.trim() || null
        })
      })

      if (!imageRes.ok) {
        const err = await imageRes.json().catch(() => ({}))
        throw new Error(err.error || 'فشل في توليد صورة التصميم')
      }

      const { imageUrl } = await imageRes.json()

      setGeneratedImageUrl(imageUrl)
      setShowResult(true)
      setStep('done')
      onGenerated(imageUrl)

    } catch (err) {
      console.error('Design generation error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء توليد التصميم')
      setStep('error')
    }
  }

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-design-${index + 1}.png`
    a.click()
  }

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const canNavigateLightbox = generatedImages.length > 1

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
  }, [])

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
  }, [])

  // Navigation handlers
  const showPreviousImage = useCallback(() => {
    if (!canNavigateLightbox || lightboxIndex === null) return
    const previousPosition = (lightboxIndex - 1 + generatedImages.length) % generatedImages.length
    setLightboxIndex(previousPosition)
  }, [canNavigateLightbox, lightboxIndex, generatedImages.length])

  const showNextImage = useCallback(() => {
    if (!canNavigateLightbox || lightboxIndex === null) return
    const nextPosition = (lightboxIndex + 1) % generatedImages.length
    setLightboxIndex(nextPosition)
  }, [canNavigateLightbox, lightboxIndex, generatedImages.length])

  // Swipe handling
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      showNextImage()
    }
    if (isRightSwipe) {
      showPreviousImage()
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowLeft') showNextImage()
      if (event.key === 'ArrowRight') showPreviousImage()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxIndex, closeLightbox, showNextImage, showPreviousImage])

  const scrollRef = useRef<HTMLDivElement>(null)

  const isGenerating = step === 'generating-prompt' || step === 'generating-image'
  const renderLightboxPortal = () => {
    if (typeof document === 'undefined') return null

    return createPortal(
      <AnimatePresence>
        {lightboxIndex !== null && generatedImages[lightboxIndex] && (
          <div
            key="generate-design-lightbox"
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={closeLightbox}
          >
            <div
              className="relative h-full w-full flex items-center justify-center px-4 sm:px-8 py-16"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeLightbox()
                }}
                className="absolute top-4 right-4 w-11 h-11 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-[999999]"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 text-white text-sm z-[999999]">
                {lightboxIndex + 1} / {generatedImages.length}
              </div>

              {canNavigateLightbox && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    showNextImage()
                  }}
                  className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-[999999]"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {canNavigateLightbox && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    showPreviousImage()
                  }}
                  className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center transition-colors z-[999999]"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              <motion.img
                key={generatedImages[lightboxIndex]}
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ duration: 0.2 }}
                src={generatedImages[lightboxIndex]}
                alt="Fullscreen"
                className="max-w-full max-h-[calc(100vh-11rem)] object-contain rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )
  }

  // ──────────────────────────────────────────
  // IDLE / ERROR
  // ──────────────────────────────────────────
  if (step === 'idle' || step === 'error') {
    return (
      <>
        <div className="space-y-3">
        <button
          type="button"
          onClick={() => { setStep('selecting'); setErrorMsg('') }}
          disabled={disabled}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-5 h-5" />
          <span>{t('ai_generate_design')}</span>
        </button>

        {step === 'error' && errorMsg && (
          <p className="text-red-600 text-sm">{errorMsg}</p>
        )}

        {generatedImages.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>{t('generated_designs_count', { count: generatedImages.length })}</span>
            </button>
            {showHistory && (
              <GeneratedImagesGallery
                images={generatedImages}
                onDownload={handleDownload}
                onDelete={onDeleteGeneratedImage}
                onViewFullscreen={openLightbox}
              />
            )}
          </div>
        )}
        </div>
        {renderLightboxPortal()}
      </>
    )
  }

  // ──────────────────────────────────────────
  // SELECTING
  // ──────────────────────────────────────────
  if (step === 'selecting') {
    return (
      <>
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h4 className="font-bold text-gray-800">{t('select_fabric_image')}</h4>
            </div>
            <button type="button" onClick={() => setStep('idle')} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-gray-600">
            {t('fabric_image_desc')}
            {imageOnlyItems.length === 0 && ` ${t('no_images_available')}`}
          </p>

          {imageOnlyItems.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {imageOnlyItems.map((img, i) => {
                const selected = selectedFabricImages.includes(img)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleFabricImage(img)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200 ${selected
                      ? 'border-purple-500 ring-2 ring-purple-300 scale-105'
                      : 'border-gray-200 hover:border-purple-300'
                      }`}
                  >
                    <img src={img} alt={t('image_alt_number', { n: i + 1 })} className="w-full h-full object-cover" />
                    {selected && (
                      <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                        <div className="bg-purple-600 rounded-full p-1">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1 rounded">
                      {i + 1}
                    </div>
                  </button>
                )
              })}

              {/* Add secondary fabric button */}
              <button
                type="button"
                onClick={() => setShowSecondaryFabricModal(true)}
                className="aspect-square rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-purple-50 hover:bg-purple-100 flex flex-col items-center justify-center gap-1 transition-all duration-200 text-purple-600"
              >
                <Plus className="w-5 h-5" />
                <span className="text-xs text-center leading-tight px-1">{t('add_secondary_fabric')}</span>
              </button>
            </div>
          )}

          {secondaryFabrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {secondaryFabrics.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 rounded-full px-3 py-1 text-sm font-medium">
                  <span>{f.name}</span>
                  <button type="button" onClick={() => removeSecondaryFabric(f.name)} className="text-indigo-400 hover:text-indigo-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Additional notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              {t('additional_notes')} <span className="text-gray-400">({t('optional')})</span>
            </label>
            <textarea
              value={additionalNotes}
              onChange={e => setAdditionalNotes(e.target.value)}
              placeholder={t('ai_notes_placeholder')}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white placeholder-gray-400"
            />
          </div>

          {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClickGenerate}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all duration-300"
            >
              <Sparkles className="w-5 h-5" />
              <span>{t('generate_design')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="px-4 py-3 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>

        {showSecondaryFabricModal && (
          <SecondaryFabricModal
            pendingName={pendingFabricName}
            onSelectName={handleSelectFabricName}
            onConfirm={handleConfirmSecondaryFabric}
            onClose={closeSecondaryModal}
            showCustomInput={showCustomFabricInput}
            setShowCustomInput={setShowCustomFabricInput}
            customInput={customFabricInput}
            setCustomInput={setCustomFabricInput}
            selectedColor={pendingFabricColor}
            onSelectColor={setPendingFabricColor}
            showCustomColorInput={showCustomColorInput}
            setShowCustomColorInput={setShowCustomColorInput}
            customColorInput={customColorInput}
            setCustomColorInput={setCustomColorInput}
          />
        )}
      </>
    )
  }

  // ──────────────────────────────────────────
  // LOCATION PICKING (multi-select)
  // ──────────────────────────────────────────
  if (step === 'location-picking') {
    const fabricKeys = getFabricKeys()
    return (
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            <h4 className="font-bold text-gray-800">{t('select_fabric_location')}</h4>
          </div>
          <button type="button" onClick={() => setStep('selecting')} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600">{t('fabric_location_desc')}</p>

        <div className="space-y-4">
          {fabricKeys.map(fk => {
            const selected = fabricLocations[fk.key] || []
            const isCustomShown = showCustomLocationFor[fk.key]
            return (
              <div key={fk.key} className="bg-white rounded-xl p-4 border border-purple-100 space-y-3">
                <div className="flex items-center gap-3">
                  {fk.imageUrl && (
                    <img src={fk.imageUrl} alt={fk.label} className="w-12 h-12 rounded-lg object-cover border border-purple-200 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{fk.label}</p>
                    {selected.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selected.map(area => (
                          <span key={area} className="inline-flex items-center gap-0.5 bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">
                            {area}
                            <button type="button" onClick={() => toggleLocation(fk.key, area)}>
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BODY_AREAS.map(area => {
                    const isSelected = selected.includes(area)
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleLocation(fk.key, area)}
                        className={`text-xs px-2.5 py-1.5 rounded-full border transition-all duration-150 ${isSelected
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                          } ${area === 'كامل الفستان' ? 'font-semibold' : ''}`}
                      >
                        {area}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setShowCustomLocationFor(prev => ({ ...prev, [fk.key]: !prev[fk.key] }))}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-all duration-150 ${isCustomShown
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                      }`}
                  >
                    {t('other_location')}
                  </button>
                </div>
                {isCustomShown && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('type_location_placeholder')}
                      value={customLocationInputs[fk.key] || ''}
                      onChange={e => setCustomLocationInputs(prev => ({ ...prev, [fk.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLocation(fk.key) } }}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
                    />
                    <button
                      type="button"
                      onClick={() => addCustomLocation(fk.key)}
                      className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                    >
                      {t('add')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => doGenerate(fabricLocations)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" />
            <span>{t('generate_design')}</span>
          </button>
          <button
            type="button"
            onClick={() => doGenerate({})}
            className="flex items-center gap-1.5 px-4 py-3 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            <SkipForward className="w-4 h-4" />
            <span>{t('skip')}</span>
          </button>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────
  // LOADING
  // ──────────────────────────────────────────
  if (isGenerating) {
    const stepLabel = step === 'generating-prompt'
      ? t('analyzing_design')
      : t('generating_image_text')
    const stepNum = step === 'generating-prompt' ? 1 : 2

    return (
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
          <Sparkles className="w-6 h-6 text-indigo-500 animate-pulse" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-lg">{t('generating_design_heading')}</p>
          <p className="text-sm text-purple-600 mt-1">{stepLabel}</p>
          <p className="text-xs text-gray-400 mt-1">{t('generation_step', { step: stepNum })}</p>
        </div>
        <div className="w-full bg-purple-100 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: step === 'generating-prompt' ? '40%' : '80%' }}
          />
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────
  // DONE
  // ──────────────────────────────────────────
  if (step === 'done' && generatedImageUrl) {
    return (
      <div className="space-y-3">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-5 h-5 text-green-600" />
            <span className="font-bold text-green-800">{t('design_generated_success')}</span>
          </div>
          {showResult && (
            <div className="relative rounded-xl overflow-hidden border border-green-200 cursor-pointer" onClick={() => {
              const idx = generatedImages.findIndex(img => img === generatedImageUrl)
              if (idx !== -1) {
                openLightbox(idx)
              } else {
                openLightbox(0) // Fallback if it's the only one
              }
            }}>
              <img src={generatedImageUrl} alt={t('design_generated_success')} className="w-full object-contain max-h-96 hover:opacity-95 transition-opacity" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDownload(generatedImageUrl, generatedImages.length) }}
                className="absolute top-2 left-2 bg-white/80 hover:bg-white text-gray-700 rounded-lg p-2 shadow z-10"
                title={t('download')}
              >
                <Download className="w-4 h-4" />
              </button>
              {onDeleteGeneratedImage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const idx = generatedImages.findIndex(img => img === generatedImageUrl)
                    if (idx !== -1) onDeleteGeneratedImage(idx)
                    setGeneratedImageUrl(null)
                    setStep('idle')
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow z-10"
                  title={t('delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => { setStep('idle'); setGeneratedImageUrl(null) }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 hover:text-purple-800 font-medium"
        >
          <Sparkles className="w-4 h-4" />
          <span>{t('generate_new_design')}</span>
        </button>

        {generatedImages.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>{t('all_generated_designs', { count: generatedImages.length })}</span>
            </button>
            {showHistory && (
              <GeneratedImagesGallery
                images={generatedImages}
                onDownload={handleDownload}
                onDelete={onDeleteGeneratedImage}
                onViewFullscreen={openLightbox}
              />
            )}
          </div>
        )}

        {renderLightboxPortal()}
      </div>
    )
  }

  return null
}

// ──────────────────────────────────────────
// Secondary Fabric Modal
// ──────────────────────────────────────────
function SecondaryFabricModal({
  pendingName,
  onSelectName,
  onConfirm,
  onClose,
  showCustomInput,
  setShowCustomInput,
  customInput,
  setCustomInput,
  selectedColor,
  onSelectColor,
  showCustomColorInput,
  setShowCustomColorInput,
  customColorInput,
  setCustomColorInput,
}: {
  pendingName: string | null
  onSelectName: (name: string) => void
  onConfirm: () => void
  onClose: () => void
  showCustomInput: boolean
  setShowCustomInput: (v: boolean) => void
  customInput: string
  setCustomInput: (v: string) => void
  selectedColor: string
  onSelectColor: (c: string) => void
  showCustomColorInput: boolean
  setShowCustomColorInput: (v: boolean) => void
  customColorInput: string
  setCustomColorInput: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 flex-shrink-0">
          <h5 className="font-bold text-gray-800">{t('add_secondary_fabric')}</h5>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 space-y-4 pb-4">
          {/* Fabric name selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('fabric_type')}</p>
            <div className="grid grid-cols-2 gap-2">
              {SECONDARY_FABRIC_OPTIONS.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectName(name)}
                  className={`text-sm px-3 py-2.5 rounded-xl border transition-all text-right font-medium ${pendingName === name
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200 hover:border-purple-400'
                    }`}
                >
                  {name}
                </button>
              ))}
            </div>

            {!showCustomInput ? (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 hover:border-purple-400 text-gray-600 hover:text-purple-600 rounded-xl transition-all text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t('other_fabric')}
              </button>
            ) : (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  placeholder={t('type_fabric_placeholder')}
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && customInput.trim()) { e.preventDefault(); onSelectName(customInput.trim()) } }}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
                <button
                  type="button"
                  onClick={() => { if (customInput.trim()) onSelectName(customInput.trim()) }}
                  disabled={!customInput.trim()}
                  className="px-3 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-50"
                >
                  {t('select_action')}
                </button>
              </div>
            )}
          </div>

          {/* Color selection */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              {t('fabric_color')} <span className="text-gray-400 font-normal">({t('optional')})</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(c => {
                const isSelected = selectedColor === c.label && !showCustomColorInput
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => { onSelectColor(c.label); setShowCustomColorInput(false) }}
                    title={c.label}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-full border transition-all ${isSelected
                      ? 'border-purple-600 ring-2 ring-purple-300 bg-purple-50 text-purple-800 font-semibold'
                      : 'border-gray-200 hover:border-purple-300 text-gray-700'
                      }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: c.hex }}
                    />
                    {c.label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => { setShowCustomColorInput(true); onSelectColor('') }}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-all ${showCustomColorInput
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 text-gray-600 hover:border-indigo-400'
                  }`}
              >
                {t('other_color')}
              </button>
            </div>

            {showCustomColorInput && (
              <input
                type="text"
                placeholder={t('type_color_placeholder')}
                value={customColorInput}
                onChange={e => setCustomColorInput(e.target.value)}
                autoFocus
                className="mt-2 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 flex gap-3 flex-shrink-0 border-t border-gray-100">
          <button
            type="button"
            onClick={onConfirm}
            disabled={!pendingName && !customInput.trim()}
            className="flex-1 py-2.5 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('add')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 text-sm transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────
// Generated images gallery
// ──────────────────────────────────────────
function GeneratedImagesGallery({
  images,
  onDownload,
  onDelete,
  onViewFullscreen
}: {
  images: string[]
  onDownload: (url: string, index: number) => void
  onDelete?: (index: number) => void
  onViewFullscreen: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {images.map((img, i) => (
        <div key={i} className="relative rounded-xl overflow-hidden border border-purple-200 bg-purple-50 group">
          <img
            src={img}
            alt={t('generated_design_alt', { n: i + 1 })}
            className="w-full object-contain max-h-64 cursor-pointer hover:opacity-95 transition-opacity"
            onClick={() => onViewFullscreen(i)}
          />
          <div className="absolute top-2 left-2 flex gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(img, i); }}
              className="bg-white/80 hover:bg-white text-gray-700 rounded-lg p-1.5 shadow text-xs transition-colors"
              title={t('download')}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                className="bg-red-50 hover:bg-red-100 text-red-600 rounded-lg p-1.5 shadow text-xs transition-colors"
                title={t('delete')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="absolute bottom-2 right-2 bg-purple-600/80 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
            {t('design_number', { n: i + 1 })}
          </div>
        </div>
      ))}
    </div>
  )
}
