'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Check, Loader2, Mic, Pause, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { DesignSummaryNote } from '@/components/InteractiveImageAnnotation'
import DesignSummaryEditor from '@/components/DesignSummaryEditor'
import DesignSummaryRecorder from '@/components/DesignSummaryRecorder'
import { recordingBlobToWav, cleanTranscriptText } from '@/lib/audio-utils'
import { hasRefinedSummary, savedHindiSummary } from '@/lib/design-summary-text'
import { prepareDesignImages, type DesignImageSource } from '@/lib/design-summary-images'
import { getAuthHeader } from '@/lib/client-auth'

interface Props {
  notes: DesignSummaryNote[]
  onNotesChange: (notes: DesignSummaryNote[]) => void
  onBusyChange?: (busy: boolean) => void
  showHindi?: boolean
  onToggleHindi?: () => void
  readOnly?: boolean
  /** إظهار أدوات إضافة التسجيل واستبداله (لمدير الورشة في نافذة الطلب). */
  allowRecording?: boolean
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  /**
   * 'compact' = بطاقة مضغوطة (نافذة الطلب الحديثة): زر تشغيل دائري بجانب النص، والنص الطويل
   * يُختصر إلى 3 أسطر مع «عرض الكل». الوظائف والصلاحيات نفسها تماماً.
   * الافتراضي 'default' = الشكل الأصلي (إضافة الطلب، تعديل الطلب، النافذة الكلاسيكية).
   */
  variant?: 'default' | 'compact'
  /**
   * صور الأمام والخلف الحالية للتصميم. تُرسل مع التنقيح مرجعًا لتصحيح أخطاء
   * السمع وحسم ما التبس في الكلام فقط، ولا يُستخرج منها شيء جديد.
   */
  getDesignImages?: () => Promise<DesignImageSource[]> | DesignImageSource[]
}

const COMPACT_TEXT_CLAMP_CHARS = 160
const COMPACT_TEXT_CLAMP_LINES = 3

interface AudioEntry {
  audio: HTMLAudioElement
  objectUrl: string
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('ar-SA-u-nu-latn', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function DesignSummarySection({
  notes,
  onNotesChange,
  readOnly = false,
  showHindi = false,
  onToggleHindi,
  onBusyChange,
  allowRecording = false,
  saveStatus = 'idle',
  variant = 'default',
  getDesignImages
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  // الشكل المضغوط: التسجيلات التي فتح المستخدم نصها الكامل
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const audioRefsRef = useRef<Map<string, AudioEntry>>(new Map())

  // مرآة لأحدث قائمة ملاحظات لقراءتها داخل دوال التحويل غير المتزامنة
  const notesRef = useRef<DesignSummaryNote[]>(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  // معرّفات الملاحظات التي يجري تحويلها إلى نص الآن (لإظهار مؤشّر التحميل بدقّة)
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  // معرّفات الملاحظات التي حاولنا تحويلها بالفعل (لتجنّب التكرار)
  const transcribeAttemptedRef = useRef<Set<string>>(new Set())

  const requests = useRef(new Map<string, AbortController>())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const busyCallback = useRef(onBusyChange)
  busyCallback.current = onBusyChange
  const designImagesRef = useRef(getDesignImages)
  designImagesRef.current = getDesignImages

  const commit = (next: DesignSummaryNote[]) => {
    notesRef.current = next
    onNotesChange(next)
  }

  useEffect(() => {
    const pending = requests.current
    const attempted = transcribeAttemptedRef.current
    return () => {
      for (const controller of pending.values()) controller.abort()
      pending.clear()
      attempted.clear()
      busyCallback.current?.(false)
    }
  }, [])

  const releaseAudio = useCallback((noteId: string) => {
    const entry = audioRefsRef.current.get(noteId)
    if (!entry) return
    entry.audio.pause()
    URL.revokeObjectURL(entry.objectUrl)
    audioRefsRef.current.delete(noteId)
  }, [])

  useEffect(() => {
    const currentIds = new Set(notes.map(note => note.id))
    for (const noteId of audioRefsRef.current.keys()) {
      if (!currentIds.has(noteId)) releaseAudio(noteId)
    }
  }, [notes, releaseAudio])

  useEffect(() => {
    const audioEntries = audioRefsRef.current
    return () => {
      for (const entry of audioEntries.values()) {
        entry.audio.pause()
        URL.revokeObjectURL(entry.objectUrl)
      }
      audioEntries.clear()
    }
  }, [])

  const startEditing = (note: DesignSummaryNote) => {
    setReplacingId(null)
    setEditingId(note.id)
  }

  const editor = (note: DesignSummaryNote, index: number) => (
    <DesignSummaryEditor
      note={note}
      number={index + 1}
      onCancel={() => setEditingId(null)}
      onSave={async (text, translation) => {
        if (text !== (note.transcription || '') || translation) {
          if (!await processNote(note, text, translation)) return false
        }
        setEditingId(null)
        return true
      }}
    />
  )

  const base64ToBlob = (base64: string): Blob => {
    const [header, encodedData] = base64.includes(',') ? base64.split(',', 2) : ['', base64]
    const mimeType = header.match(/^data:([^;]+)/)?.[1] || 'audio/webm'
    const bytes = atob(encodedData)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: mimeType })
  }

  // تحويل تسجيل إلى نص من بياناته الصوتية المخزّنة (base64) وتحديث الملاحظة.
  const readAudio = async (note: DesignSummaryNote, signal: AbortSignal) => {
    const blob = base64ToBlob(note.data)
    let uploadBlob: Blob = blob
    let filename = 'recording.webm'
    try {
      uploadBlob = await recordingBlobToWav(blob)
      filename = 'recording.wav'
    } catch (convErr) {
      console.warn('WAV conversion failed, sending original recording:', convErr)
    }
    const form = new FormData()
    form.append('audio', uploadBlob, filename)
    form.append('purpose', 'design-summary')
    // trailing slash لتجنّب توجيه 308 الذي يرفع الصوت مرتين
    const res = await fetch('/api/soniox-async-transcribe/', { method: 'POST', headers: await getAuthHeader(), body: form, signal })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.message || body?.error || res.statusText)
    const text = cleanTranscriptText(body.text || '')
    if (!text) throw new Error('التسجيل بلا نص محوّل')
    return text
  }

  // A manual edit is authoritative: only translate it. New voice notes are refined
  // and translated together, and keep the raw transcript for retries.
  const processNote = async (note: DesignSummaryNote, edit?: string, translation?: string) => {
    if (requests.current.has(note.id)) return false
    const controller = new AbortController()
    requests.current.set(note.id, controller)
    const timeout = setTimeout(() => controller.abort(), 180_000)
    const publish = () => {
      setTranscribingIds(new Set(requests.current.keys()))
      busyCallback.current?.(requests.current.size > 0)
    }
    const patch = (fields: Partial<DesignSummaryNote>) => {
      if (controller.signal.aborted || !notesRef.current.some(n => n.id === note.id && n.data === note.data)) return false
      commit(notesRef.current.map(n => n.id === note.id ? { ...n, ...fields } : n))
      return true
    }
    publish()
    setErrors(prev => ({ ...prev, [note.id]: '' }))
    try {
      if (edit === '') return patch({ sourceTranscription: note.sourceTranscription || note.transcription, transcription: '', translatedText: undefined, translationLanguage: undefined })
      let source = edit ?? (note.transcription || note.sourceTranscription)
      if (!source) {
        source = await readAudio(note, controller.signal)
        if (!patch({ sourceTranscription: source, transcription: source })) return false
      }
      if (edit && translation) {
        return patch({
          sourceTranscription: note.sourceTranscription || note.transcription || undefined,
          transcription: edit, translatedText: translation, translationLanguage: 'hi',
        })
      }
      const refining = edit === undefined
      // صور التصميم اختيارية: أي فشل في تجهيزها يُكمل التنقيح بالنص وحده.
      const images = refining
        ? await Promise.resolve(designImagesRef.current?.() ?? []).then(prepareDesignImages).catch(() => [])
        : []
      const url = refining ? '/api/refine-design-summary/' : '/api/translate-text/'
      const response = await fetch(url, {
        method: 'POST', signal: controller.signal,
        headers: { ...await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source, targetLanguage: 'hi', ...(images.length ? { images } : {}) }),
      })
      const body = await response.json()
      if (!response.ok || !body.translatedText || !(edit ?? body.transcription)) throw new Error('لم يكتمل النص والترجمة')
      return patch({
        sourceTranscription: note.sourceTranscription || note.transcription || source,
        transcription: edit ?? body.transcription,
        translatedText: body.translatedText,
        translationLanguage: 'hi',
      })
    } catch {
      if (requests.current.get(note.id) === controller) {
        setErrors(prev => ({ ...prev, [note.id]: 'تعذّرت معالجة التسجيل. يمكنك إعادة المحاولة.' }))
      }
      return false
    } finally {
      clearTimeout(timeout)
      if (requests.current.get(note.id) === controller) {
        requests.current.delete(note.id)
        publish()
      }
    }
  }

  useEffect(() => {
    if (readOnly) return
    for (const note of notes) {
      if (note.transcription === '' || note.translatedText || (note.transcription && !note.sourceTranscription) || !note.data) continue
      if (transcribeAttemptedRef.current.has(note.id)) continue
      transcribeAttemptedRef.current.add(note.id)
      void processNote(note)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, readOnly])

  const displayParts = (note: DesignSummaryNote): { label: string; text: string; lang?: string }[] => {
    const hindi = showHindi && savedHindiSummary(note)
    if (hindi) return [{ label: 'ملخص التصميم بالهندية', text: hindi, lang: 'hi' }]
    const original = note.sourceTranscription || note.transcription
    return [
      ...(original ? [{ label: 'النص الأصلي', text: original }] : []),
      ...(note.transcription && hasRefinedSummary(note)
        ? [{ label: 'النص المحسّن', text: note.transcription, lang: 'ar' }]
        : []),
    ]
  }

  const summaryText = (note: DesignSummaryNote, collapsed = false) => {
    const parts = displayParts(note)
    return (
      <div className={parts.length > 1 ? 'grid gap-3 sm:grid-cols-2' : ''}>
        {parts.map(part => (
          <div key={part.label} className="min-w-0">
            <span className="text-xs font-semibold text-teal-700">{part.label}</span>
            <p lang={part.lang} dir="auto" className={`whitespace-pre-line text-start text-sm leading-6 text-slate-800 ${collapsed ? 'line-clamp-3' : ''}`}>{part.text}</p>
          </div>
        ))}
      </div>
    )
  }

  const languageToggle = onToggleHindi && notes.some(savedHindiSummary) && (
    <button type="button" aria-pressed={showHindi} onClick={onToggleHindi}
      className="rounded-lg border border-teal-200 px-3 py-1 text-sm font-semibold text-teal-700">
      {showHindi ? 'عرض النص العربي' : 'عرض الملخص بالهندية · हिंदी'}
    </button>
  )

  const processingStatus = (note: DesignSummaryNote) => (
    <>
      {!readOnly && errors[note.id] && <p role="alert" className="text-xs text-red-700">{errors[note.id]}</p>}
      {!readOnly && transcribingIds.has(note.id) && note.transcription && (
        <p role="status" className="text-xs text-teal-700">جارٍ إعداد النص والترجمة…</p>
      )}
      {!readOnly && !note.translatedText && !transcribingIds.has(note.id) && editingId !== note.id && (
        <button type="button" className="text-sm font-semibold text-teal-700 underline" onClick={() => void processNote(note)}>
          {errors[note.id] ? 'إعادة المحاولة' : 'تنقيح وترجمة للهندية'}
        </button>
      )}
    </>
  )

  const togglePlayback = (note: DesignSummaryNote) => {
    if (playingId && playingId !== note.id) {
      audioRefsRef.current.get(playingId)?.audio.pause()
    }

    let entry = audioRefsRef.current.get(note.id)
    if (!entry) {
      const blob = base64ToBlob(note.data)
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)
      audio.onended = () => setPlayingId(null)
      entry = { audio, objectUrl }
      audioRefsRef.current.set(note.id, entry)
    }

    if (playingId === note.id) {
      entry.audio.pause()
      setPlayingId(null)
    } else {
      setPlayingId(note.id)
      void entry.audio.play().catch(error => {
        console.error('Summary playback failed:', error)
        setPlayingId(null)
      })
    }
  }

  const deleteNote = (noteId: string) => {
    if (!window.confirm('هل تريد حذف هذا التسجيل الصوتي من ملخص التصميم؟')) return
    releaseAudio(noteId)
    if (playingId === noteId) setPlayingId(null)
    if (replacingId === noteId) setReplacingId(null)
    requests.current.get(noteId)?.abort()
    commit(notesRef.current.filter(note => note.id !== noteId))
  }

  const addRecording = (note: DesignSummaryNote) => commit([...notesRef.current, note])

  const startReplacing = (noteId: string) => {
    releaseAudio(noteId)
    if (playingId === noteId) setPlayingId(null)
    setEditingId(null)
    setReplacingId(noteId)
  }

  const replaceRecording = (replacement: DesignSummaryNote) => {
    if (!replacingId) return
    requests.current.get(replacingId)?.abort()
    commit(
      notesRef.current.map(note => (note.id === replacingId ? replacement : note))
    )
    setReplacingId(null)
  }

  if (variant === 'compact') {
    const canEdit = !readOnly
    const toggleExpanded = (noteId: string) => {
      setExpandedIds(prev => {
        const next = new Set(prev)
        if (next.has(noteId)) next.delete(noteId)
        else next.add(noteId)
        return next
      })
    }

    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {/* الرأس: العنوان + العدد + حالة الحفظ، وزر التسجيل لمدير الورشة فقط */}
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700">
              <Mic className="h-4 w-4" />
            </span>
            <span className="truncate text-[15px] font-extrabold text-slate-900">ملخص التصميم</span>
            {notes.length > 0 ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 tabular-nums">{notes.length}</span>
            ) : null}
            {languageToggle}
            {saveStatus !== 'idle' ? (
              <span
                aria-live="polite"
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  saveStatus === 'error'
                    ? 'bg-red-50 text-red-700'
                    : saveStatus === 'saved'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-teal-50 text-teal-700'
                }`}
              >
                {saveStatus === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {saveStatus === 'saved' ? <Check className="h-3 w-3" /> : null}
                {saveStatus === 'error' ? <AlertCircle className="h-3 w-3" /> : null}
                {saveStatus === 'saving' ? 'جارٍ الحفظ' : saveStatus === 'saved' ? 'تم الحفظ' : 'تعذّر الحفظ'}
              </span>
            ) : null}
          </div>
          {allowRecording && canEdit ? <DesignSummaryRecorder onRecordingComplete={addRecording} /> : null}
        </div>

        {notes.length > 0 ? (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {notes.map((note, index) => {
              const isPlaying = playingId === note.id
              const isEditing = editingId === note.id
              const isReplacing = replacingId === note.id
              const text = note.transcription || note.sourceTranscription
              const isLong = displayParts(note).some(({ text: value }) =>
                value.length > COMPACT_TEXT_CLAMP_CHARS || value.split('\n').length > COMPACT_TEXT_CLAMP_LINES
              )
              const isExpanded = expandedIds.has(note.id)

              return (
                <li key={note.id} className="flex items-start gap-2.5 px-3 py-2.5 sm:px-4">
                  {/* زر التشغيل */}
                  <button
                    type="button"
                    onClick={() => togglePlayback(note)}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
                      isPlaying ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}
                    title={isPlaying ? 'إيقاف' : 'تشغيل الصوت'}
                    aria-label={isPlaying ? 'إيقاف' : `تشغيل التسجيل ${index + 1}`}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    {isEditing && !readOnly ? (
                      editor(note, index)
                    ) : text ? (
                      <>
                        {summaryText(note, isLong && !isExpanded)}
                        {isLong ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(note.id)}
                            className="mt-0.5 text-xs font-bold text-teal-700 hover:underline"
                          >
                            {isExpanded ? 'إخفاء' : 'عرض الكل'}
                          </button>
                        ) : null}
                      </>
                    ) : transcribingIds.has(note.id) ? (
                      <div className="flex items-center gap-1.5 pt-2 text-sm text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>جاري التحويل إلى نص...</span>
                      </div>
                    ) : (
                      <p className="pt-2 text-sm italic text-gray-400">تسجيل صوتي (بدون نص محوّل)</p>
                    )}

                    {processingStatus(note)}
                    {/* رقم التسجيل · المدة · التاريخ — سطر صغير واحد */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                      <span className="tabular-nums">#{index + 1}</span>
                      {note.duration !== undefined ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums" dir="ltr">{formatTime(note.duration)}</span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>{formatDate(note.timestamp)}</span>
                    </p>

                    {isReplacing ? (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5">
                        <p className="mb-2 text-xs font-semibold text-amber-800">
                          سجّل الصوت البديل. سيبقى التسجيل الحالي محفوظًا حتى تنهي التسجيل الجديد.
                        </p>
                        <DesignSummaryRecorder
                          mode="replace"
                          onRecordingComplete={replaceRecording}
                          onCancel={() => setReplacingId(null)}
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* أدوات التعديل — لا تظهر في وضع العرض فقط */}
                  {canEdit && !isEditing && !isReplacing ? (
                    <div className="flex shrink-0 items-center">
                      {allowRecording ? (
                        <button
                          type="button"
                          onClick={() => startReplacing(note.id)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100"
                          title="تعديل الصوت بتسجيل بديل"
                          aria-label="تعديل الصوت بتسجيل بديل"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={transcribingIds.has(note.id)}
                        onClick={() => startEditing(note)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-teal-700 transition-colors hover:bg-teal-100"
                        title="تعديل النص المحسّن"
                        aria-label="تعديل النص المحسّن"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteNote(note.id)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-red-400 transition-colors hover:bg-red-50"
                        title="حذف التسجيل الصوتي"
                        aria-label="حذف التسجيل الصوتي"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : allowRecording && canEdit ? (
          <p className="border-t border-slate-100 px-3 py-2.5 text-xs text-slate-400 sm:px-4">
            لا توجد تسجيلات بعد — اضغط زر التسجيل لإضافة ملخص صوتي.
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-teal-100">
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 flex-wrap">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
          <Mic className="w-5 h-5 text-teal-600" />
          <span>ملخص التصميم</span>
          <span className="text-sm font-normal text-gray-500 mr-1">({notes.length})</span>
        </h3>

        {languageToggle}
        {/* أدوات الإضافة والحفظ لا تُمرّر إلا لمدير الورشة في نافذة الطلب. */}
        {allowRecording && !readOnly && (
          <DesignSummaryRecorder onRecordingComplete={addRecording} />
        )}
      </div>

      {saveStatus !== 'idle' ? (
        <div
          aria-live="polite"
          className={`mb-4 flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            saveStatus === 'error'
              ? 'bg-red-50 text-red-700'
              : saveStatus === 'saved'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-teal-50 text-teal-700'
          }`}
        >
          {saveStatus === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saveStatus === 'saved' ? <Check className="h-3.5 w-3.5" /> : null}
          {saveStatus === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : null}
          <span>
            {saveStatus === 'saving' ? 'جارٍ حفظ ملخص التصميم...' : null}
            {saveStatus === 'saved' ? 'تم حفظ ملخص التصميم' : null}
            {saveStatus === 'error' ? 'تعذّر حفظ آخر تعديل' : null}
          </span>
        </div>
      ) : null}

      {notes.length === 0 && allowRecording && !readOnly && (
        <p className="text-sm text-gray-400 text-center py-4">
          لا توجد تسجيلات بعد. اضغط على زر تسجيل صوت جديد لإضافة ملخص صوتي.
        </p>
      )}

      <div className="space-y-3">
        <AnimatePresence>
          {notes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-teal-50 border border-teal-200 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                {/* رقم التسجيل */}
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold mt-0.5">
                  {index + 1}
                </span>

                {/* المحتوى */}
                <div className="flex-1 min-w-0">
                  {/* النص المحوّل */}
                  {editingId === note.id && !readOnly ? (
                      editor(note, index)
                  ) : (note.transcription || note.sourceTranscription) ? (
                    summaryText(note)
                  ) : transcribingIds.has(note.id) ? (
                    // مؤشّر التحويل يظهر فقط أثناء تحويل فعلي جارٍ (هذه الجلسة)،
                    <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التحويل إلى نص...</span>
                    </div>
                  ) : (
                    // ملاحظة بلا نص ولا تحويل جارٍ: لا نُظهر حلقة تحميل لا نهائية.
                    // التسجيل الصوتي ما زال قابلاً للتشغيل عبر زر التشغيل.
                    <div className="flex items-center gap-1.5 mb-2 text-sm text-gray-400 italic">
                      <span>تسجيل صوتي (بدون نص محوّل)</span>
                    </div>
                  )}

                  {processingStatus(note)}
                  {/* معلومات التسجيل */}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{formatDate(note.timestamp)}</span>
                    {note.duration !== undefined && (
                      <span className="flex items-center gap-0.5">
                        <span>⏱</span>
                        <span>{formatTime(note.duration)}</span>
                      </span>
                    )}
                  </div>

                  {replacingId === note.id ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                      <p className="mb-2 text-xs font-semibold text-amber-800">
                        سجّل الصوت البديل. سيبقى التسجيل الحالي محفوظًا حتى تنهي التسجيل الجديد.
                      </p>
                      <DesignSummaryRecorder
                        mode="replace"
                        onRecordingComplete={replaceRecording}
                        onCancel={() => setReplacingId(null)}
                      />
                    </div>
                  ) : null}
                </div>

                {/* أزرار التحكم */}
                {editingId !== note.id && replacingId !== note.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => togglePlayback(note)}
                      className={`p-2 rounded-lg transition-colors ${
                        playingId === note.id
                          ? 'bg-teal-600 text-white'
                          : 'text-teal-700 hover:bg-teal-100'
                      }`}
                      title={playingId === note.id ? 'إيقاف' : 'تشغيل الصوت'}
                    >
                      {playingId === note.id
                        ? <Pause className="w-4 h-4" />
                        : <Play className="w-4 h-4" />
                      }
                    </button>

                    {!readOnly && (
                      <>
                        {allowRecording ? (
                          <button
                            type="button"
                            onClick={() => startReplacing(note.id)}
                            className="rounded-lg p-2 text-amber-700 transition-colors hover:bg-amber-100"
                            title="تعديل الصوت بتسجيل بديل"
                            aria-label="تعديل الصوت بتسجيل بديل"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                        disabled={transcribingIds.has(note.id)}
                        onClick={() => startEditing(note)}
                          className="p-2 text-teal-700 hover:bg-teal-100 rounded-lg transition-colors"
                          title="تعديل النص المحسّن"
                          aria-label="تعديل النص المحسّن"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNote(note.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف التسجيل الصوتي"
                          aria-label="حذف التسجيل الصوتي"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
