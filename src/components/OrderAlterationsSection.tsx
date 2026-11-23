'use client'

import { getAuthHeader } from '@/lib/client-auth'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarClock, ChevronDown, ImageIcon, Languages, Loader2, RefreshCw, Wrench } from 'lucide-react'
import { alterationService, type OrderAlterationSummary } from '@/lib/services/alteration-service'
import { getAlterationText } from '@/lib/alteration-text'
import { useTranslation } from '@/hooks/useTranslation'
import {
  StatusBadge,
  formatAlterationTimestampDate,
  getAlterationTypeMeta,
  getDueInfo,
} from '@/components/alterations/alteration-ui'

type TranslationMap = Record<string, string>

interface OrderAlterationsSectionProps {
  orderId: string
  autoTranslateHindi?: boolean
  onOpenImage: (index: number, images: string[]) => void
  /** سبب الخطأ يُعرض لمدير النظام فقط، ولا يُجلب من القاعدة لغيره. */
  showErrorReason?: boolean
}

// ألوان الأنواع من المصدر المشترك: الأولى كهرماني، الثانية أخضر، بعد التسليم أحمر.

export default function OrderAlterationsSection({
  orderId,
  autoTranslateHindi = false,
  onOpenImage,
  showErrorReason = false,
}: OrderAlterationsSectionProps) {
  const { t, isArabic } = useTranslation()
  const [isSectionOpen, setIsSectionOpen] = useState(true)
  const [alterations, setAlterations] = useState<OrderAlterationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [translations, setTranslations] = useState<TranslationMap>({})
  const [visibleTranslationIds, setVisibleTranslationIds] = useState<Set<string>>(new Set())
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({})
  const [translatingKeys, setTranslatingKeys] = useState<Set<string>>(new Set())
  const autoTranslatedRef = useRef<Set<string>>(new Set())
  const pendingTranslationsRef = useRef<TranslationMap>({})

  useEffect(() => {
    let isCurrent = true
    setIsLoading(true)
    setLoadError(null)
    setAlterations([])
    setTranslations({})
    setVisibleTranslationIds(new Set())
    setTranslationErrors({})
    autoTranslatedRef.current.clear()
    pendingTranslationsRef.current = {}

    void alterationService.getByOriginalOrderId(orderId, { includeErrorType: showErrorReason }).then(({ data, error }) => {
      if (!isCurrent) return
      if (error) {
        setLoadError(error)
        setIsLoading(false)
        return
      }
      const loadedAlterations = data || []
      const storedTranslations: TranslationMap = {}

      loadedAlterations.forEach(alteration => {
        const sourceText = getAlterationText(alteration)
        const storedTranslation = alteration.alteration_translations?.find(translation => (
          translation.target_language === 'hi'
          && translation.source_text === sourceText
          && Boolean(translation.translated_text?.trim())
        ))

        if (storedTranslation) {
          storedTranslations[alteration.id] = storedTranslation.translated_text.trim()
          autoTranslatedRef.current.add(alteration.id)
        }
      })

      setAlterations(loadedAlterations)
      setTranslations(storedTranslations)
      setVisibleTranslationIds(autoTranslateHindi
        ? new Set(Object.keys(storedTranslations))
        : new Set())
      setIsLoading(false)
    })

    return () => { isCurrent = false }
  }, [autoTranslateHindi, orderId, showErrorReason])

  const numberedAlterations = useMemo(() => {
    let postDeliveryIndex = 0
    return alterations.map(alteration => ({
      alteration,
      postDeliveryNumber: alteration.alteration_type === 'after_delivery' ? ++postDeliveryIndex : null,
    }))
  }, [alterations])

  const translate = useCallback(async (
    alteration: OrderAlterationSummary,
    showError = true,
  ) => {
    const sourceText = getAlterationText(alteration)
    if (!sourceText) return

    const key = alteration.id
    const storedTranslation = translations[key]
    if (storedTranslation) {
      setVisibleTranslationIds(previous => new Set(previous).add(key))
      setTranslationErrors(previous => {
        const next = { ...previous }
        delete next[key]
        return next
      })
      return
    }

    setTranslatingKeys(previous => new Set(previous).add(key))
    setTranslationErrors(previous => {
      const next = { ...previous }
      delete next[key]
      return next
    })

    try {
      let translatedText = pendingTranslationsRef.current[key]
      if (!translatedText) {
        const response = await fetch('/api/translate-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...await getAuthHeader() },
          body: JSON.stringify({ text: sourceText, targetLanguage: 'hi' }),
        })
        if (!response.ok) throw new Error('Translation request failed')

        const data = await response.json()
        translatedText = String(data.translatedText || '').trim()
        if (!translatedText) throw new Error('Translation is empty')
        pendingTranslationsRef.current[key] = translatedText
      }

      const { data: savedTranslation, error: saveError } = await alterationService.saveHindiTranslation(
        alteration.id,
        sourceText,
        translatedText
      )

      if (saveError) {
        if (showError) {
          setTranslationErrors(previous => ({
            ...previous,
            [key]: t('alteration_translation_save_error')
          }))
        }
        return
      }

      const persistedText = savedTranslation?.translated_text || translatedText
      setTranslations(previous => ({
        ...previous,
        [alteration.id]: persistedText,
      }))
      setVisibleTranslationIds(previous => new Set(previous).add(key))
      delete pendingTranslationsRef.current[key]
    } catch (error) {
      console.error('Alteration translation error:', error)
      if (showError) {
        setTranslationErrors(previous => ({ ...previous, [key]: t('alteration_translation_error') }))
      }
    } finally {
      setTranslatingKeys(previous => {
        const next = new Set(previous)
        next.delete(key)
        return next
      })
    }
  }, [t, translations])

  useEffect(() => {
    if (!autoTranslateHindi || alterations.length === 0) return

    const pending = alterations.filter(alteration => {
      const key = alteration.id
      if (!getAlterationText(alteration) || autoTranslatedRef.current.has(key)) return false
      autoTranslatedRef.current.add(key)
      return true
    })

    if (pending.length > 0) {
      void Promise.all(pending.map(alteration => translate(alteration, false)))
    }
  }, [alterations, autoTranslateHindi, translate])

  const restoreOriginalText = (alterationId: string) => {
    setVisibleTranslationIds(previous => {
      const next = new Set(previous)
      next.delete(alterationId)
      return next
    })
    setTranslationErrors(previous => {
      const next = { ...previous }
      delete next[alterationId]
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/40 py-7 text-sm text-amber-800">
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
        {t('loading_alterations')}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {t('alterations_load_error')}
      </div>
    )
  }

  if (alterations.length === 0) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50/60 via-white to-purple-50/60">
      <button
        type="button"
        onClick={() => setIsSectionOpen(previous => !previous)}
        aria-expanded={isSectionOpen}
        className={`flex min-h-14 w-full items-center justify-between gap-3 bg-white/70 px-4 py-3 text-start transition hover:bg-white ${isSectionOpen ? 'border-b border-pink-100' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 text-pink-700">
            <Wrench className="h-4 w-4" />
          </span>
          <h3 className="text-base font-extrabold text-slate-900">{t('alterations_section_title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-pink-200 bg-white px-2.5 py-1 text-sm font-bold text-pink-700">
            {alterations.length}
          </span>
          <ChevronDown className={`h-5 w-5 flex-shrink-0 text-pink-600 transition-transform duration-300 ${isSectionOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isSectionOpen && (
      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
        {numberedAlterations.map(({ alteration, postDeliveryNumber }) => {
          const text = getAlterationText(alteration)
          const translatedText = visibleTranslationIds.has(alteration.id)
            ? translations[alteration.id]
            : undefined
          const isTranslating = translatingKeys.has(alteration.id)
          const typeMeta = getAlterationTypeMeta(alteration.alteration_type)
          const due = getDueInfo(alteration.alteration_due_date, alteration.status, isArabic)
          const createdDate = formatAlterationTimestampDate(alteration.created_at)
          const alterationPhotos = Array.from(new Set(
            (alteration.alteration_photos || []).map(photo => photo.trim()).filter(Boolean)
          ))
          const errorReason = showErrorReason && alteration.error_type
            ? t(`alteration_error_${alteration.error_type}`)
            : null
          const title = alteration.alteration_type === 'first_proof'
            ? t('first_proof_alteration')
            : alteration.alteration_type === 'second_proof'
              ? t('second_proof_alteration')
              : `${t('post_delivery_alteration')} (${postDeliveryNumber || 1})`

          return (
            <article key={alteration.id} className={`relative flex min-h-44 flex-col overflow-hidden rounded-2xl border bg-white p-4 ps-5 shadow-sm ${typeMeta.soft}`}>
              <span className={`absolute inset-y-0 start-0 w-1.5 ${typeMeta.bar}`} aria-hidden />

              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-[15px] font-extrabold leading-6 text-slate-900">{title}</h4>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    <span dir="ltr">{alteration.alteration_number || '—'}</span>
                    {createdDate ? <> · {isArabic ? 'سُجّل' : 'Added'} <span dir="ltr">{createdDate}</span></> : null}
                  </p>
                </div>
                <StatusBadge status={alteration.status} isArabic={isArabic} />
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {due.date ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${due.tone}`}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    <span dir="ltr">{due.date}</span>
                    {due.relative ? <span>· {due.relative}</span> : null}
                  </span>
                ) : null}
                {errorReason ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {t('alteration_error_reason')}: {errorReason}
                  </span>
                ) : null}
              </div>

              <p
                className="flex-1 whitespace-pre-wrap text-[15px] leading-7 text-slate-700"
                dir={translatedText ? 'ltr' : 'auto'}
              >
                {translatedText || text || t('alteration_text_not_available')}
              </p>

              {alterationPhotos.length > 0 ? (
                <div className="mt-4 border-t border-slate-200/70 pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-700">
                      <ImageIcon className="h-4 w-4" />
                      {t('alteration_photos_label')}
                    </p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">
                      {alterationPhotos.length}
                    </span>
                  </div>
                  <div className={`grid gap-2 ${alterationPhotos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {alterationPhotos.map((photo, photoIndex) => (
                      <button
                        key={photo}
                        type="button"
                        onClick={() => onOpenImage(photoIndex, alterationPhotos)}
                        aria-label={t('open_alteration_photo', { number: photoIndex + 1 })}
                        className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/90 bg-white/70 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Stored alteration photos can include data URLs. */}
                        <img
                          src={photo}
                          alt={t('alteration_photo_alt', { number: photoIndex + 1 })}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <span className="absolute bottom-1.5 end-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                          {photoIndex + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {translationErrors[alteration.id] ? (
                <p className="mt-2 text-sm font-medium text-red-600">
                  {translationErrors[alteration.id]}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => translatedText
                  ? restoreOriginalText(alteration.id)
                  : void translate(alteration)}
                disabled={!text || isTranslating}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${translatedText
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100'
                }`}
              >
                {isTranslating
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : translatedText
                    ? <RefreshCw className="h-4 w-4" />
                    : <Languages className="h-4 w-4" />}
                {isTranslating
                  ? t('translating')
                  : translatedText
                    ? t('restore_alteration_text')
                    : t('translate_alteration_text')}
              </button>
            </article>
          )
        })}
      </div>
      )}
    </section>
  )
}
