'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Check, Loader2, Mic, Pause, Pencil, Play, RefreshCw, Trash2, X } from 'lucide-react'
import type { DesignSummaryNote } from '@/components/InteractiveImageAnnotation'
import DesignSummaryRecorder from '@/components/DesignSummaryRecorder'
import { recordingBlobToWav, cleanTranscriptText } from '@/lib/audio-utils'

interface Props {
  notes: DesignSummaryNote[]
  onNotesChange: (notes: DesignSummaryNote[]) => void
  readOnly?: boolean
  /** إظهار أدوات إضافة التسجيل واستبداله (لمدير الورشة في نافذة الطلب). */
  allowRecording?: boolean
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

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
  allowRecording = false,
  saveStatus = 'idle'
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const audioRefsRef = useRef<Map<string, AudioEntry>>(new Map())

  // مرآة لأحدث قائمة ملاحظات لقراءتها داخل دوال التحويل غير المتزامنة
  const notesRef = useRef<DesignSummaryNote[]>(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  // معرّفات الملاحظات التي يجري تحويلها إلى نص الآن (لإظهار مؤشّر التحميل بدقّة)
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  // معرّفات الملاحظات التي حاولنا تحويلها بالفعل (لتجنّب التكرار)
  const transcribeAttemptedRef = useRef<Set<string>>(new Set())

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
    setDraftText(note.transcription || '')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setDraftText('')
  }

  const saveEditing = (noteId: string) => {
    const trimmed = draftText.trim()
    onNotesChange(
      notesRef.current.map(note => (note.id === noteId ? { ...note, transcription: trimmed } : note))
    )
    setEditingId(null)
    setDraftText('')
  }

  const base64ToBlob = (base64: string): Blob => {
    const [header, encodedData] = base64.includes(',') ? base64.split(',', 2) : ['', base64]
    const mimeType = header.match(/^data:([^;]+)/)?.[1] || 'audio/webm'
    const bytes = atob(encodedData)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: mimeType })
  }

  // تحويل تسجيل إلى نص من بياناته الصوتية المخزّنة (base64) وتحديث الملاحظة.
  const transcribeNote = async (note: DesignSummaryNote) => {
    setTranscribingIds(prev => new Set(prev).add(note.id))
    try {
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
      // trailing slash لتجنّب توجيه 308 الذي يرفع الصوت مرتين
      const res = await fetch('/api/soniox-async-transcribe/', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || body?.error || res.statusText)
      const text: string = body.text
      if (text) {
        onNotesChange(
          notesRef.current.map(n =>
            n.id === note.id ? { ...n, transcription: cleanTranscriptText(text) } : n
          )
        )
      }
    } catch (err) {
      console.error('Summary transcription failed:', err)
    } finally {
      setTranscribingIds(prev => {
        const next = new Set(prev)
        next.delete(note.id)
        return next
      })
    }
  }

  // تحويل أي تسجيل بلا نص محوّل إلى نص (في وضع المدير فقط).
  // يعالج الحالة الحيّة (تسجيل جديد) وحالة إعادة فتح طلب يحوي تسجيلاً لم يكتمل تحويله.
  useEffect(() => {
    if (!allowRecording || readOnly) return
    notes.forEach(note => {
      if (note.transcription || !note.data) return
      if (transcribeAttemptedRef.current.has(note.id)) return
      transcribeAttemptedRef.current.add(note.id)
      transcribeNote(note)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, allowRecording, readOnly])

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
    onNotesChange(notesRef.current.filter(note => note.id !== noteId))
  }

  const addRecording = useCallback((note: DesignSummaryNote) => {
    onNotesChange([...notesRef.current, note])
  }, [onNotesChange])

  const startReplacing = (noteId: string) => {
    releaseAudio(noteId)
    if (playingId === noteId) setPlayingId(null)
    setEditingId(null)
    setDraftText('')
    setReplacingId(noteId)
  }

  const replaceRecording = useCallback((replacement: DesignSummaryNote) => {
    if (!replacingId) return
    onNotesChange(
      notesRef.current.map(note => (note.id === replacingId ? replacement : note))
    )
    setReplacingId(null)
  }, [onNotesChange, replacingId])

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-teal-100">
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 flex-wrap">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
          <Mic className="w-5 h-5 text-teal-600" />
          <span>ملخص التصميم</span>
          <span className="text-sm font-normal text-gray-500 mr-1">({notes.length})</span>
        </h3>

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
                  {editingId === note.id ? (
                    <div className="mb-2">
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        dir="rtl"
                        rows={3}
                        autoFocus
                        placeholder="اكتب نص الملاحظة..."
                        className="w-full text-sm text-gray-800 leading-relaxed text-right bg-white border border-teal-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-y"
                      />
                      <div className="flex items-center gap-2 mt-2 justify-end">
                        <button
                          type="button"
                          onClick={() => saveEditing(note.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>حفظ</span>
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>إلغاء</span>
                        </button>
                      </div>
                    </div>
                  ) : note.transcription ? (
                    <p className="text-sm text-gray-800 leading-relaxed mb-2 text-right">
                      {note.transcription.split('\n').filter(Boolean).map((line, i) => (
                        <span key={i}>{i > 0 && <br />}{line}</span>
                      ))}
                    </p>
                  ) : (transcribingIds.has(note.id) || (!allowRecording && !readOnly)) ? (
                    // مؤشّر التحويل يظهر فقط أثناء تحويل فعلي جارٍ (هذه الجلسة)،
                    // أو في صفحة التعديل حيث يتولّى مكوّن الرسم التحويل الحيّ.
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
                          onClick={() => startEditing(note)}
                          className="p-2 text-teal-700 hover:bg-teal-100 rounded-lg transition-colors"
                          title="تعديل النص المحوّل"
                          aria-label="تعديل النص المحوّل"
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
