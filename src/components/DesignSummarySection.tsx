'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Play, Pause, Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
import { DesignSummaryNote } from '@/components/InteractiveImageAnnotation'
import DesignSummaryRecorder from '@/components/DesignSummaryRecorder'
import { recordingBlobToWav, cleanTranscriptText } from '@/lib/audio-utils'

interface Props {
  notes: DesignSummaryNote[]
  onNotesChange: (notes: DesignSummaryNote[]) => void
  readOnly?: boolean
  /** إظهار زر "تسجيل صوتي جديد" أعلى القسم (للمدير فقط) */
  allowRecording?: boolean
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

export default function DesignSummarySection({ notes, onNotesChange, readOnly = false, allowRecording = false }: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  // مرآة لأحدث قائمة ملاحظات لقراءتها داخل دوال التحويل غير المتزامنة
  const notesRef = useRef<DesignSummaryNote[]>(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  // معرّفات الملاحظات التي يجري تحويلها إلى نص الآن (لإظهار مؤشّر التحميل بدقّة)
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  // معرّفات الملاحظات التي حاولنا تحويلها بالفعل (لتجنّب التكرار)
  const transcribeAttemptedRef = useRef<Set<string>>(new Set())

  const startEditing = (note: DesignSummaryNote) => {
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
      notes.map(n => (n.id === noteId ? { ...n, transcription: trimmed } : n))
    )
    setEditingId(null)
    setDraftText('')
  }

  const base64ToBlob = (base64: string): Blob => {
    const b64 = base64.split(',')[1]
    const bytes = atob(b64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: 'audio/webm' })
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
    // stop any current
    if (playingId && playingId !== note.id) {
      audioRefsRef.current.get(playingId)?.pause()
    }

    let audio = audioRefsRef.current.get(note.id)
    if (!audio) {
      const blob = base64ToBlob(note.data)
      audio = new Audio(URL.createObjectURL(blob))
      audio.onended = () => setPlayingId(null)
      audioRefsRef.current.set(note.id, audio)
    }

    if (playingId === note.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      audio.play()
      setPlayingId(note.id)
    }
  }

  const deleteNote = (noteId: string) => {
    const audio = audioRefsRef.current.get(noteId)
    if (audio) { audio.pause(); audioRefsRef.current.delete(noteId) }
    if (playingId === noteId) setPlayingId(null)
    onNotesChange(notes.filter(n => n.id !== noteId))
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-teal-100">
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 flex-wrap">
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
          <Mic className="w-5 h-5 text-teal-600" />
          <span>ملخص التصميم</span>
          <span className="text-sm font-normal text-gray-500 mr-1">({notes.length})</span>
        </h3>

        {/* زر إضافة تسجيل صوتي جديد (للمدير فقط) */}
        {allowRecording && !readOnly && (
          <DesignSummaryRecorder notes={notes} onNotesChange={onNotesChange} />
        )}
      </div>

      {notes.length === 0 && allowRecording && !readOnly && (
        <p className="text-sm text-gray-400 text-center py-4">
          لا توجد تسجيلات بعد. اضغط على "تسجيل جديد" لإضافة ملخص صوتي.
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
                </div>

                {/* أزرار التحكم */}
                {editingId !== note.id && (
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
                        <button
                          type="button"
                          onClick={() => startEditing(note)}
                          className="p-2 text-teal-700 hover:bg-teal-100 rounded-lg transition-colors"
                          title="تعديل النص"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNote(note.id)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="حذف"
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
