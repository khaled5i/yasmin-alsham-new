'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Heart, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  FABRIC_LINE_NOTICE_MESSAGES,
  FABRIC_LINE_STATUS_MESSAGES,
  formatPurchaseModeLabel,
  formatQuantityLabel,
  formatUnitPriceLabel,
  type ResolvedFabricCartLine,
} from '@/lib/fabric-commerce'
import { formatFabricNumber } from '@/lib/fabric-number-format'
import { useFabricCartStore } from '@/store/fabricCartStore'
import { useFabricFavoritesStore } from '@/store/fabricFavoritesStore'
import FabricQuantitySelector from './FabricQuantitySelector'

interface FabricCartLineRowProps {
  line: ResolvedFabricCartLine
  /** الدرج أضيق من الصفحة الكاملة. */
  compact?: boolean
  onNavigate?: () => void
}

/**
 * سطر السلة: صورة القماش الفعلي، رقمه، الاسم، اللون، وحدة البيع، الكمية،
 * سعر الوحدة والإجمالي، مع تعديل الكمية والحذف والنقل للمفضلة.
 *
 * العناصر غير المتاحة تبقى ظاهرة بحالتها ولا تختفي بصمت.
 */
export default function FabricCartLineRow({ line, compact = false, onNavigate }: FabricCartLineRowProps) {
  const setQuantity = useFabricCartStore(state => state.setQuantity)
  const removeLine = useFabricCartStore(state => state.removeLine)
  const addFavorite = useFabricFavoritesStore(state => state.add)

  const { fabric, line: stored, status, notices } = line

  // وحدة البيع انقلبت ⇒ تختار المستخدمة الكمية بوحدتها الجديدة ثم تؤكّد.
  // التأكيد هو ما يثبّت الوحدة الجديدة على السطر المحفوظ.
  const needsQuantity = status === 'needs-quantity'
  const [draftQuantity, setDraftQuantity] = useState(line.quantity)
  useEffect(() => setDraftQuantity(line.quantity), [line.quantity, line.purchaseMode])
  // الاسم الحيّ يسبق اللقطة المحفوظة؛ اللقطة احتياط حين يتعذّر جلب القماش.
  const label = fabric?.name?.trim() || fabric?.fabric_code?.trim() || stored.snapshot.label
  const image = fabric?.images?.[0] || fabric?.thumbnail_image || fabric?.image_url || stored.snapshot.image
  const code = fabric?.fabric_code || stored.snapshot.fabricCode
  const color = fabric?.available_colors?.[0] || stored.snapshot.color

  const handleRemove = () => {
    removeLine(line.key)
    toast.success(`حُذف «${label}» من السلة`, { icon: '🗑️' })
  }

  const handleMoveToFavorites = () => {
    if (!fabric) {
      toast.error('تعذّر نقل هذا القماش — لم تعد بياناته متاحة')
      return
    }
    // إضافة لا تبديل: لو كان القماش مفضلاً أصلاً فالتبديل كان سيزيله من
    // المفضلة ويحذفه من السلة معاً، فيختفي من المكانين بضغطة «نقل».
    const wasAdded = addFavorite(fabric)
    removeLine(line.key)
    toast.success(
      wasAdded ? `نُقل «${label}» إلى المفضلة` : `«${label}» موجود في المفضلة، وحُذف من السلة`,
      { icon: '❤️' }
    )
  }

  return (
    <article
      className={`rounded-2xl border-2 bg-[#f6f0e8] p-3 transition-colors duration-300 sm:p-4 ${
        line.isPurchasable || status === 'pending'
          ? 'border-[#d8c5ae]/70'
          : 'border-[#6b1726]/35 bg-[#6b1726]/[0.04]'
      }`}
    >
      <div className="flex gap-3 sm:gap-4">
        {/* صورة القماش الفعلي */}
        <Link
          href={`/fabrics/${stored.fabricId}`}
          onNavigate={onNavigate}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:ring-offset-2 rounded-xl"
          aria-label={`فتح صفحة ${label}`}
        >
          <div
            className={`relative overflow-hidden rounded-xl border border-[#d8c5ae]/70 bg-[#fbf8f3] ${
              compact ? 'h-20 w-16' : 'h-28 w-20 sm:h-32 sm:w-24'
            }`}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={label}
                loading="lazy"
                decoding="async"
                className={`h-full w-full object-cover ${line.isPurchasable || status === 'pending' ? '' : 'opacity-50 grayscale'}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-[#211b19]/40">
                لا صورة
              </div>
            )}
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/fabrics/${stored.fabricId}`}
                onNavigate={onNavigate}
                className="block truncate font-bold text-[#211b19] transition-colors duration-200 hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
              >
                {label}
              </Link>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#211b19]/70">
                {code && (
                  <span dir="ltr" className="font-mono font-bold text-[#6b1726]">
                    {code}
                  </span>
                )}
                {color && <span className="rounded-full bg-[#fbf8f3] px-2 py-0.5 border border-[#d8c5ae]/70">{color}</span>}
                <span className="rounded-full bg-[#fbf8f3] px-2 py-0.5 border border-[#d8c5ae]/70">
                  {formatPurchaseModeLabel(line.purchaseMode)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              aria-label={`حذف ${label} من السلة`}
              title="حذف من السلة"
              className="shrink-0 rounded-lg p-2 text-[#211b19]/50 transition-colors duration-200 hover:bg-[#6b1726]/10 hover:text-[#6b1726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* حالة غير قابلة للشراء: نص صريح لا يعتمد على اللون وحده.
              «قيد التحقق» حالة محايدة — لا تُقال بنبرة «حُذف المنتج». */}
          {status !== 'ok' && (
            <p
              role="status"
              className={`mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                status === 'pending'
                  ? 'bg-[#d8c5ae]/30 text-[#211b19]/70'
                  : 'bg-[#6b1726]/10 text-[#6b1726]'
              }`}
            >
              {status === 'pending' ? (
                <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{FABRIC_LINE_STATUS_MESSAGES[status]}</span>
            </p>
          )}

          {/* تنبيهات: تغيّر السعر أو الكمية أو طريقة البيع */}
          {notices.map(notice => (
            <p
              key={notice}
              role="status"
              className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#b99a68]/20 px-2.5 py-1.5 text-xs font-semibold text-[#2f0c14]"
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{FABRIC_LINE_NOTICE_MESSAGES[notice]}</span>
            </p>
          ))}

          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            {needsQuantity && line.bounds ? (
              <div className="flex flex-wrap items-end gap-2">
                <FabricQuantitySelector
                  value={draftQuantity}
                  bounds={line.bounds}
                  mode={line.purchaseMode}
                  onChange={setDraftQuantity}
                  label={label}
                  size="sm"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(line.key, draftQuantity, fabric)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#6b1726] px-3 py-2 text-xs font-bold text-[#f6f0e8] transition-colors duration-300 hover:bg-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68]"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>تأكيد الكمية</span>
                </button>
              </div>
            ) : line.isPurchasable && line.bounds ? (
              <FabricQuantitySelector
                value={line.quantity}
                bounds={line.bounds}
                mode={line.purchaseMode}
                onChange={next => setQuantity(line.key, next, fabric)}
                label={label}
                size="sm"
              />
            ) : (
              <p className="text-xs text-[#211b19]/60">
                {formatQuantityLabel(line.quantity, line.purchaseMode)}
              </p>
            )}

            <div className="text-left" dir="rtl">
              <p className="text-xs text-[#211b19]/60">
                {formatUnitPriceLabel(line.unitPrice, line.purchaseMode)}
              </p>
              <p className="text-base font-bold text-[#6b1726] sm:text-lg">
                {line.lineTotal != null ? `${formatFabricNumber(line.lineTotal)} ريال` : '—'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMoveToFavorites}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#6b1726] transition-colors duration-200 hover:text-[#2f0c14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b99a68] focus-visible:rounded"
          >
            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
            <span>نقل إلى المفضلة</span>
          </button>
        </div>
      </div>
    </article>
  )
}
