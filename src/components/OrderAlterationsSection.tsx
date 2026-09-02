'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Languages, Loader2, RefreshCw, Wrench } from 'lucide-react'
import { alterationService, type OrderAlterationSummary } from '@/lib/services/alteration-service'
import { getAlterationText } from '@/lib/alteration-text'
import { useTranslation } from '@/hooks/useTranslation'

type TranslationMap = Record<string, string>

interface OrderAlterationsSectionProps {
  orderId: string
  autoTranslateHindi?: boolean
  /** سبب الخطأ يُعرض لمدير النظام فقط، ولا يُجلب من القاعدة لغيره. */
  showErrorReason?: boolean
}

// لون مميز لكل نوع تعديل: البروفة الثانية بالأخضر والتعديل بعد التسليم بالأحمر.
const ALTERATION_TYPE_THEMES = {
  first_proof: {
    card: 'border-amber-200 bg-white/90 ring-amber-100/70',
    title: 'text-slate-900',
    badge: 'bg-amber-50 text-amber-700',
    restoreButton: 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50',
  },
  second_proof: {
    card: 'border-emerald-300 bg-emerald-50/70 ring-emerald-100',
    title: 'text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-700',
    restoreButton: 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50',
  },
  after_delivery: {
    card: 'border-red-300 bg-red-50/70 ring-red-100',
    title: 'text-red-900',
    badge: 'bg-red-100 text-red-700',
    restoreButton: 'border-red-200 bg-white text-red-800 hover:bg-red-50',
  },
} as const

type AlterationTypeTheme = typeof ALTERATION_TYPE_THEMES[keyof typeof ALTERATION_TYPE_THEMES]

function getAlterationTheme(alterationType: string | null | undefined): AlterationTypeTheme {
  return ALTERATION_TYPE_THEMES[alterationType as keyof typeof ALTERATION_TYPE_THEMES]
    || ALTERATION_TYPE_THEMES.first_proof
}

export default function OrderAlterationsSection({
  orderId,
  autoTranslateHindi = false,
  showErrorReason = false,
}: OrderAlterationsSectionProps) {
  const { t } = useTranslation()
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
          headers: { 'Content-Type': 'application/json' },
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
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-rose-50/70">
      <button
        type="button"
        onClick={() => setIsSectionOpen(previous => !previous)}
        aria-expanded={isSectionOpen}
        className={`flex w-full items-center justify-between gap-3 bg-white/60 px-4 py-3 text-start transition hover:bg-white/80 ${isSectionOpen ? 'border-b border-amber-200/70' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Wrench className="h-4 w-4" />
          </span>
          <h3 className="font-extrabold text-slate-900">{t('alterations_section_title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-800">
            {alterations.length}
          </span>
          <ChevronDown className={`h-5 w-5 flex-shrink-0 text-amber-700 transition-transform duration-300 ${isSectionOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isSectionOpen && (
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {numberedAlterations.map(({ alteration, postDeliveryNumber }) => {
          const text = getAlterationText(alteration)
          const translatedText = visibleTranslationIds.has(alteration.id)
            ? translations[alteration.id]
            : undefined
          const isTranslating = translatingKeys.has(alteration.id)
          const theme = getAlterationTheme(alteration.alteration_type)
          const errorReason = showErrorReason && alteration.error_type
            ? t(`alteration_error_${alteration.error_type}`)
            : null
          const title = alteration.alteration_type === 'first_proof'
            ? t('first_proof_alteration')
            : alteration.alteration_type === 'second_proof'
              ? t('second_proof_alteration')
              : `${t('post_delivery_alteration')} (${postDeliveryNumber || 1})`

          return (
            <article key={alteration.id} className={`flex min-h-44 flex-col rounded-2xl border p-4 shadow-sm ring-1 ${theme.card}`}>
              {errorReason ? (
                <p className="mb-2 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  {t('alteration_error_reason')}: {errorReason}
                </p>
              ) : null}

              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h4 className={`font-black ${theme.title}`}>{title}</h4>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400">{alteration.alteration_number}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${theme.badge}`}>
                  {t(`alteration_status_${alteration.status}`)}
                </span>
              </div>

              <p
                className="flex-1 whitespace-pre-wrap text-sm leading-6 text-slate-700"
                dir={translatedText ? 'ltr' : 'auto'}
              >
                {translatedText || text || t('alteration_text_not_available')}
              </p>

              {translationErrors[alteration.id] ? (
                <p className="mt-2 text-xs font-medium text-red-600">
                  {translationErrors[alteration.id]}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => translatedText
                  ? restoreOriginalText(alteration.id)
                  : void translate(alteration)}
                disabled={!text || isTranslating}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${translatedText
                  ? theme.restoreButton
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
