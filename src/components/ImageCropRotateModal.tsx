'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw, RotateCw, Crop, Check, RefreshCw, Loader2 } from 'lucide-react'

interface CropBox {
  x: number // percentage 0-100
  y: number // percentage 0-100
  width: number // percentage
  height: number // percentage
}

interface ImageCropRotateModalProps {
  imageSrc: string
  isOpen: boolean
  onClose: () => void
  onSave: (editedImageDataUrl: string) => void
  title?: string
}

type DragHandle =
  | 'tl' | 'tc' | 'tr'
  | 'ml' | 'mr'
  | 'bl' | 'bc' | 'br'
  | 'move'

const INITIAL_CROP: CropBox = { x: 0, y: 0, width: 100, height: 100 }
const MIN_CROP_SIZE = 5 // percentage

export default function ImageCropRotateModal({
  imageSrc,
  isOpen,
  onClose,
  onSave,
  title = 'تعديل الصورة',
}: ImageCropRotateModalProps) {
  const [rotation, setRotation] = useState(0)
  const [cropBox, setCropBox] = useState<CropBox>(INITIAL_CROP)
  const [isApplying, setIsApplying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isClientMounted, setIsClientMounted] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Drag state kept in refs to avoid re-renders during drag
  const dragStateRef = useRef<{
    handle: DragHandle | null
    startX: number
    startY: number
    startCrop: CropBox
  }>({ handle: null, startX: 0, startY: 0, startCrop: INITIAL_CROP })

  useEffect(() => {
    setIsClientMounted(true)
  }, [])

  // Reset state when modal opens with a new image
  useEffect(() => {
    if (isOpen) {
      setRotation(0)
      setCropBox(INITIAL_CROP)
      setImageLoaded(false)
    }
  }, [isOpen, imageSrc])

  // Draw image on canvas whenever rotation changes or image loads
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rad = (rotation * Math.PI) / 180
    const sin = Math.abs(Math.sin(rad))
    const cos = Math.abs(Math.cos(rad))

    const rotatedW = img.naturalWidth * cos + img.naturalHeight * sin
    const rotatedH = img.naturalWidth * sin + img.naturalHeight * cos

    canvas.width = rotatedW
    canvas.height = rotatedH

    ctx.clearRect(0, 0, rotatedW, rotatedH)
    ctx.save()
    ctx.translate(rotatedW / 2, rotatedH / 2)
    ctx.rotate(rad)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    ctx.restore()
  }, [rotation])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas, imageLoaded])

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true)
  }, [])

  // Rotate ±90°
  const rotate = useCallback((delta: number) => {
    setRotation(prev => {
      let next = prev + delta
      if (next > 180) next -= 360
      if (next < -180) next += 360
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setRotation(0)
    setCropBox(INITIAL_CROP)
  }, [])

  // ──────────────────────────── Drag logic ────────────────────────────

  const getContainerCoords = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { px: 0, py: 0 }
    return {
      px: ((clientX - rect.left) / rect.width) * 100,
      py: ((clientY - rect.top) / rect.height) * 100,
    }
  }

  const startDrag = useCallback((handle: DragHandle, clientX: number, clientY: number) => {
    dragStateRef.current = {
      handle,
      startX: clientX,
      startY: clientY,
      startCrop: { ...cropBox },
    }
  }, [cropBox])

  const onMouseMove = useCallback((clientX: number, clientY: number) => {
    const { handle, startX, startY, startCrop } = dragStateRef.current
    if (!handle) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const dx = ((clientX - startX) / rect.width) * 100
    const dy = ((clientY - startY) / rect.height) * 100

    setCropBox(prev => {
      let { x, y, width, height } = startCrop

      if (handle === 'move') {
        x = Math.max(0, Math.min(100 - width, x + dx))
        y = Math.max(0, Math.min(100 - height, y + dy))
        return { x, y, width, height }
      }

      // Resize handles
      if (handle.includes('l')) {
        const newX = Math.min(x + width - MIN_CROP_SIZE, x + dx)
        const newW = width - (newX - x)
        x = Math.max(0, newX)
        width = Math.max(MIN_CROP_SIZE, newW - Math.max(0, -newX))
      }
      if (handle.includes('r')) {
        width = Math.max(MIN_CROP_SIZE, Math.min(100 - x, width + dx))
      }
      if (handle.includes('t')) {
        const newY = Math.min(y + height - MIN_CROP_SIZE, y + dy)
        const newH = height - (newY - y)
        y = Math.max(0, newY)
        height = Math.max(MIN_CROP_SIZE, newH - Math.max(0, -newY))
      }
      if (handle.includes('b')) {
        height = Math.max(MIN_CROP_SIZE, Math.min(100 - y, height + dy))
      }

      // Clamp to container boundaries
      if (x + width > 100) width = 100 - x
      if (y + height > 100) height = 100 - y

      return { x, y, width, height }
    })
  }, [])

  const stopDrag = useCallback(() => {
    dragStateRef.current.handle = null
  }, [])

  // Global mouse/touch listeners while dragging
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStateRef.current.handle) return
      const touch = 'touches' in e ? e.touches[0] : e
      onMouseMove(touch.clientX, touch.clientY)
    }
    const onUp = () => stopDrag()

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [onMouseMove, stopDrag])

  // ──────────────────────────── Apply ────────────────────────────

  const handleApply = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsApplying(true)
    try {
      const cw = canvas.width
      const ch = canvas.height

      const sx = (cropBox.x / 100) * cw
      const sy = (cropBox.y / 100) * ch
      const sw = (cropBox.width / 100) * cw
      const sh = (cropBox.height / 100) * ch

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = Math.round(sw)
      outputCanvas.height = Math.round(sh)
      const ctx = outputCanvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)

      const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92)
      onSave(dataUrl)
      onClose()
    } finally {
      setIsApplying(false)
    }
  }, [cropBox, onSave, onClose])

  // ──────────────────────────── Handle positions ────────────────────────────

  const handles: { id: DragHandle; style: React.CSSProperties; cursor: string }[] = [
    { id: 'tl', style: { top: -5, left: -5 }, cursor: 'nw-resize' },
    { id: 'tc', style: { top: -5, left: '50%', transform: 'translateX(-50%)' }, cursor: 'n-resize' },
    { id: 'tr', style: { top: -5, right: -5 }, cursor: 'ne-resize' },
    { id: 'ml', style: { top: '50%', left: -5, transform: 'translateY(-50%)' }, cursor: 'w-resize' },
    { id: 'mr', style: { top: '50%', right: -5, transform: 'translateY(-50%)' }, cursor: 'e-resize' },
    { id: 'bl', style: { bottom: -5, left: -5 }, cursor: 'sw-resize' },
    { id: 'bc', style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' }, cursor: 's-resize' },
    { id: 'br', style: { bottom: -5, right: -5 }, cursor: 'se-resize' },
  ]

  // ──────────────────────────── Render ────────────────────────────

  if (!isClientMounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Crop className="w-5 h-5 text-pink-600" />
                {title}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image area */}
            <div className="flex-1 overflow-hidden p-4 flex items-center justify-center bg-gray-100 min-h-0">
              <div
                ref={containerRef}
                className="relative select-none"
                style={{ maxWidth: '100%', maxHeight: '100%' }}
              >
                {/* Hidden image for loading */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={el => { imgRef.current = el }}
                  src={imageSrc}
                  alt=""
                  crossOrigin="anonymous"
                  onLoad={handleImageLoad}
                  className="hidden"
                />

                {/* Canvas preview */}
                <canvas
                  ref={canvasRef}
                  className="block max-w-full max-h-[50vh] object-contain"
                  style={{ display: imageLoaded ? 'block' : 'none' }}
                />

                {!imageLoaded && (
                  <div className="w-64 h-48 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                  </div>
                )}

                {/* Crop overlay */}
                {imageLoaded && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  >
                    {/* Dark mask - top */}
                    <div className="absolute bg-black/50" style={{ top: 0, left: 0, right: 0, height: `${cropBox.y}%` }} />
                    {/* Dark mask - bottom */}
                    <div className="absolute bg-black/50" style={{ top: `${cropBox.y + cropBox.height}%`, left: 0, right: 0, bottom: 0 }} />
                    {/* Dark mask - left */}
                    <div className="absolute bg-black/50" style={{ top: `${cropBox.y}%`, left: 0, width: `${cropBox.x}%`, height: `${cropBox.height}%` }} />
                    {/* Dark mask - right */}
                    <div className="absolute bg-black/50" style={{ top: `${cropBox.y}%`, left: `${cropBox.x + cropBox.width}%`, right: 0, height: `${cropBox.height}%` }} />

                    {/* Crop box */}
                    <div
                      className="absolute border-2 border-white pointer-events-auto"
                      style={{
                        left: `${cropBox.x}%`,
                        top: `${cropBox.y}%`,
                        width: `${cropBox.width}%`,
                        height: `${cropBox.height}%`,
                        cursor: 'move',
                      }}
                      onMouseDown={e => { e.preventDefault(); startDrag('move', e.clientX, e.clientY) }}
                      onTouchStart={e => { e.preventDefault(); startDrag('move', e.touches[0].clientX, e.touches[0].clientY) }}
                    >
                      {/* Rule of thirds grid lines */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute border-t border-white/30" style={{ top: '33.33%', left: 0, right: 0 }} />
                        <div className="absolute border-t border-white/30" style={{ top: '66.66%', left: 0, right: 0 }} />
                        <div className="absolute border-l border-white/30" style={{ left: '33.33%', top: 0, bottom: 0 }} />
                        <div className="absolute border-l border-white/30" style={{ left: '66.66%', top: 0, bottom: 0 }} />
                      </div>

                      {/* Handles */}
                      {handles.map(h => (
                        <div
                          key={h.id}
                          className="absolute w-3 h-3 bg-white rounded-sm shadow-md border border-gray-400"
                          style={{ ...h.style, cursor: h.cursor, position: 'absolute' }}
                          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startDrag(h.id, e.clientX, e.clientY) }}
                          onTouchStart={e => { e.preventDefault(); e.stopPropagation(); startDrag(h.id, e.touches[0].clientX, e.touches[0].clientY) }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 border-t space-y-3 bg-white rounded-b-2xl">
              {/* Rotation */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => rotate(-90)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
                  title="تدوير 90° لليسار"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">-90°</span>
                </button>

                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12 text-center">{rotation}°</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={rotation}
                    onChange={e => setRotation(Number(e.target.value))}
                    className="flex-1 h-2 accent-pink-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => rotate(90)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
                  title="تدوير 90° لليمين"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="hidden sm:inline">+90°</span>
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm"
                  title="إعادة تعيين"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">إعادة</span>
                </button>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying || !imageLoaded}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {isApplying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  تطبيق
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
