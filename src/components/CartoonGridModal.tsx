'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Search,
  CheckCircle,
  Clock,
  Package,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  Printer,
  Download,
  Wand2,
  Trash2,
  Eye,
  Check
} from 'lucide-react'
import { orderService } from '@/lib/services/order-service'
import OrderModal from '@/components/OrderModal'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface SelectedOrderItem {
  id: string
  clientName: string
  orderNumber: string
  cartoonImage: string // data-URL or HTTP URL
}

interface CartoonGridModalProps {
  isOpen: boolean
  onClose: () => void
  workers: any[]
}

// ─────────────────────────────────────────────
// A4 canvas dimensions (150 dpi equivalent)
// A4  = 1240 × 1754 px
// A6  =  620 ×  877 px  (half width, half height)
// ─────────────────────────────────────────────
const A4_W = 1240
const A4_H = 1754
const CELL_W = A4_W / 2
const CELL_H = A4_H / 2
const CELL_PAD = 12 // inner padding per cell

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function getStatusInfo(status: string) {
  const map: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
    pending:     { label: 'معلق',         color: 'text-yellow-600', bg: 'bg-yellow-100', Icon: Clock },
    in_progress: { label: 'قيد التنفيذ',  color: 'text-blue-600',   bg: 'bg-blue-100',   Icon: Package },
    completed:   { label: 'مكتمل',        color: 'text-green-600',  bg: 'bg-green-100',  Icon: CheckCircle },
    delivered:   { label: 'تم التسليم',   color: 'text-purple-600', bg: 'bg-purple-100', Icon: CheckCircle },
    cancelled:   { label: 'ملغي',         color: 'text-red-600',    bg: 'bg-red-100',    Icon: AlertCircle },
  }
  return map[status] ?? map.pending
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`فشل تحميل الصورة: ${src.slice(0, 60)}`))
    img.src = src
  })
}

/** Draw one cartoon image into an A6 cell on the canvas */
async function drawCell(
  ctx: CanvasRenderingContext2D,
  src: string,
  col: 0 | 1,
  row: 0 | 1
) {
  const x = col * CELL_W
  const y = row * CELL_H

  // cell background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, CELL_W, CELL_H)

  // thin border
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1)

  // draw image (full cell, no label area)
  const imgX = x + CELL_PAD
  const imgY = y + CELL_PAD
  const imgW = CELL_W - CELL_PAD * 2
  const imgH = CELL_H - CELL_PAD * 2

  try {
    const img = await loadImage(src)
    // object-fit: contain
    const scale = Math.min(imgW / img.width, imgH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = imgX + (imgW - dw) / 2
    const dy = imgY + (imgH - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
  } catch {
    // placeholder if image fails
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(imgX, imgY, imgW, imgH)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('تعذّر تحميل الصورة', imgX + imgW / 2, imgY + imgH / 2)
  }
}

/** Generate the A4 composite image and return a data-URL */
async function generateGridImage(selected: SelectedOrderItem[]): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width  = A4_W
  canvas.height = A4_H
  const ctx = canvas.getContext('2d')!

  // white background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, A4_W, A4_H)

  // draw each cell
  const positions: [0 | 1, 0 | 1][] = [[0, 0], [1, 0], [0, 1], [1, 1]]
  for (let i = 0; i < selected.length; i++) {
    const [col, row] = positions[i]
    const item = selected[i]
    await drawCell(ctx, item.cartoonImage, col, row)
  }

  return canvas.toDataURL('image/png')
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function CartoonGridModal({ isOpen, onClose, workers }: CartoonGridModalProps) {
  const [searchTerm, setSearchTerm]           = useState('')
  const [orders, setOrders]                   = useState<any[]>([])
  const [isSearching, setIsSearching]         = useState(false)
  const [selectedItems, setSelectedItems]     = useState<SelectedOrderItem[]>([])
  const [loadingIds, setLoadingIds]           = useState<Set<string>>(new Set())
  const [gridImage, setGridImage]             = useState<string | null>(null)
  const [isGenerating, setIsGenerating]       = useState(false)
  const [showPreview, setShowPreview]         = useState(false)
  // detail modal
  const [detailOrder, setDetailOrder]         = useState<any>(null)
  const [showDetail, setShowDetail]           = useState(false)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setOrders([])
      setSelectedItems([])
      setGridImage(null)
      setShowPreview(false)
      setShowDetail(false)
      setDetailOrder(null)
    }
  }, [isOpen])

  // Debounced search
  const runSearch = useCallback(async (term: string) => {
    setIsSearching(true)
    try {
      const { data } = await orderService.getAll({
        search: term || undefined,
        pageSize: 30,
        page: 0,
      })
      setOrders(data || [])
    } catch {
      setOrders([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => runSearch(searchTerm), 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [searchTerm, isOpen, runSearch])

  // ─── Select / Deselect ───────────────────────
  const isSelected = (id: string) => selectedItems.some(s => s.id === id)

  const handleToggleSelect = async (order: any) => {
    // Deselect
    if (isSelected(order.id)) {
      setSelectedItems(prev => prev.filter(s => s.id !== order.id))
      return
    }

    // Max 4
    if (selectedItems.length >= 4) {
      toast.error('الحد الأقصى للتحديد هو 4 طلبات')
      return
    }

    // Fetch measurements to get cartoon_image
    setLoadingIds(prev => new Set(prev).add(order.id))
    try {
      const { data: meas } = await orderService.getMeasurements(order.id)
      const cartoonImage: string | null = meas?.cartoon_image ?? null

      if (!cartoonImage) {
        toast.error(
          `طلب "${order.client_name}" لا يحتوي على صورة كرتونية.\nيرجى إنشاء واحدة أولاً من داخل الطلب.`,
          { duration: 4000 }
        )
        return
      }

      setSelectedItems(prev => [
        ...prev,
        {
          id:           order.id,
          clientName:   order.client_name,
          orderNumber:  order.order_number || order.id,
          cartoonImage,
        },
      ])
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(order.id); return s })
    }
  }

  // ─── Generate grid ────────────────────────────
  const handleGenerate = async () => {
    if (selectedItems.length === 0) return
    setIsGenerating(true)
    try {
      const url = await generateGridImage(selectedItems)
      setGridImage(url)
      setShowPreview(true)
    } catch (e: any) {
      toast.error('فشل إنشاء الصورة المجمّعة: ' + e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── Save / Print ─────────────────────────────
  const handleSave = () => {
    if (!gridImage) return
    const a = document.createElement('a')
    a.href = gridImage
    a.download = `كرتون-${new Date().toISOString().slice(0, 10)}.png`
    a.click()
  }

  const handlePrint = () => {
    if (!gridImage) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>طباعة الكرتون</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:210mm; height:297mm; }
    @page { size:A4 portrait; margin:0; }
    img { width:210mm; height:297mm; display:block; }
  </style>
</head>
<body>
  <img src="${gridImage}" />
  <script>window.onload=function(){window.print();window.close();}<\/script>
</body>
</html>`)
    win.document.close()
  }

  // ─── View order detail ────────────────────────
  const handleViewDetail = (order: any) => {
    setDetailOrder(order)
    setShowDetail(true)
  }

  if (!isOpen) return null

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <>
      {/* ── Main Modal ── */}
      <AnimatePresence>
        {isOpen && !showPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-l from-purple-50 to-pink-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow">
                    <Wand2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">تحويل الفستان إلى كرتون</h2>
                    <p className="text-xs text-gray-500">حدّد حتى 4 طلبات تحتوي على صورة كرتونية لدمجها في ورقة A4</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Selected bar */}
              {selectedItems.length > 0 && (
                <div className="px-6 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-purple-700">
                    المحدّد ({selectedItems.length}/4):
                  </span>
                  {selectedItems.map(item => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                    >
                      {item.clientName}
                      <button
                        onClick={() => setSelectedItems(prev => prev.filter(s => s.id !== item.id))}
                        className="hover:text-purple-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="mr-auto inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                  >
                    {isGenerating
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <ImageIcon className="w-4 h-4" />
                    }
                    {isGenerating ? 'جارٍ الإنشاء...' : 'إنشاء الشبكة'}
                  </button>
                </div>
              )}

              {/* Search */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="ابحث باسم العميل أو رقم الطلب أو رقم الهاتف..."
                    className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent"
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 animate-spin" />
                  )}
                </div>
              </div>

              {/* Orders list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {isSearching && orders.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin ml-2" />
                    <span className="text-sm">جارٍ البحث...</span>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Search className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm">ابدأ بكتابة اسم العميل أو رقم الطلب للبحث</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {orders.map(order => {
                      const { label, color, bg, Icon } = getStatusInfo(order.status)
                      const selected   = isSelected(order.id)
                      const isLoading  = loadingIds.has(order.id)
                      const maxReached = selectedItems.length >= 4 && !selected

                      return (
                        <div
                          key={order.id}
                          className={`relative bg-white rounded-xl border p-4 transition-all ${
                            selected
                              ? 'border-purple-400 ring-2 ring-purple-200 bg-purple-50/30'
                              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          } ${maxReached ? 'opacity-50' : ''}`}
                        >
                          {/* Selection badge */}
                          {selected && (
                            <div className="absolute top-3 left-3 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shadow">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}

                          {/* Content — click to view details */}
                          <div
                            className="cursor-pointer"
                            onClick={() => handleViewDetail(order)}
                          >
                            <div className="flex items-start justify-between mb-2 gap-2">
                              <div>
                                <h3 className="font-semibold text-gray-900 text-sm">{order.client_name}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  #{order.order_number || order.id.slice(0, 8)}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${color} shrink-0`}>
                                <Icon className="w-3 h-3" />
                                {label}
                              </span>
                            </div>

                            {order.fabric && (
                              <span className="inline-block px-2 py-0.5 rounded-md text-xs bg-gray-100 text-gray-700 mb-2">
                                {order.fabric}
                              </span>
                            )}

                            {order.description && (
                              <p className="text-xs text-gray-500 line-clamp-1 mb-2">{order.description}</p>
                            )}

                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <span>موعد التسليم:</span>
                              <span className="font-medium text-gray-600">{order.due_date ? order.due_date.slice(0, 10) : '—'}</span>
                            </p>
                          </div>

                          {/* Bottom actions */}
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => handleViewDetail(order)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              عرض
                            </button>

                            <button
                              onClick={() => handleToggleSelect(order)}
                              disabled={isLoading || (maxReached && !selected)}
                              className={`mr-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                selected
                                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {isLoading
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : selected
                                  ? <><X className="w-3.5 h-3.5" /> إلغاء التحديد</>
                                  : <><Check className="w-3.5 h-3.5" /> تحديد</>
                              }
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {orders.length > 0 && !isSearching ? `${orders.length} نتيجة` : ''}
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={selectedItems.length === 0 || isGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
                >
                  {isGenerating
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ImageIcon className="w-4 h-4" />
                  }
                  {isGenerating
                    ? 'جارٍ الإنشاء...'
                    : `إنشاء الشبكة${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Preview Modal ── */}
      <AnimatePresence>
        {showPreview && gridImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowPreview(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800">معاينة الشبكة الكرتونية</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    حفظ
                  </button>
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    طباعة
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Image */}
              <div className="flex-1 overflow-auto p-6 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gridImage}
                  alt="الشبكة الكرتونية"
                  className="w-full h-auto rounded-xl shadow-lg border border-gray-200"
                />
              </div>

              {/* Footer info */}
              <div className="px-6 py-3 border-t border-gray-100 bg-white">
                <p className="text-xs text-gray-400 text-center">
                  حجم A4 — {selectedItems.length} {selectedItems.length === 1 ? 'طلب' : 'طلبات'}:&nbsp;
                  {selectedItems.map(s => s.clientName).join(' · ')}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Order Detail Modal ── */}
      {showDetail && detailOrder && (
        <OrderModal
          order={detailOrder}
          workers={workers}
          isOpen={showDetail}
          onClose={() => { setShowDetail(false); setDetailOrder(null) }}
          showCartoonButton={false}
        />
      )}
    </>
  )
}
