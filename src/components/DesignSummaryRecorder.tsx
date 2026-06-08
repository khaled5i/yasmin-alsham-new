'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'
import { DesignSummaryNote } from '@/components/InteractiveImageAnnotation'
import { recordingBlobToWav, pickSupportedMimeType, cleanTranscriptText } from '@/lib/audio-utils'

interface Props {
  notes: DesignSummaryNote[]
  onNotesChange: (notes: DesignSummaryNote[]) => void
  disabled?: boolean
}

/**
 * زر مستقل لإضافة تسجيل صوتي جديد إلى ملخص التصميم.
 * يستخدم نفس مسار ملخص التصميم في InteractiveImageAnnotation:
 * تسجيل عبر MediaRecorder ثم تحويل الملف إلى نص عبر Soniox async (لدقة أعلى).
 */
export default function DesignSummaryRecorder({ notes, onNotesChange, disabled = false }: Props) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('audio/webm')
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // مرآة لأحدث قائمة ملاحظات لقراءتها داخل دوال async (تجنّب القيم القديمة)
  const notesRef = useRef<DesignSummaryNote[]>(notes)
  useEffect(() => { notesRef.current = notes }, [notes])

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      stopTimer()
      cleanupStream()
    }
  }, [])

  // عند انتهاء التسجيل: حفظ الصوت كملاحظة ثم تحويله إلى نص
  const finalizeRecording = useCallback(() => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
    chunksRef.current = []
    if (blob.size === 0) return

    const duration = Math.round((Date.now() - startTimeRef.current) / 1000)
    const noteId = `summary_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      const newNote: DesignSummaryNote = {
        id: noteId,
        data: base64,
        timestamp: Date.now(),
        duration,
        transcription: undefined
      }
      onNotesChange([...notesRef.current, newNote])

      // التحويل إلى نص من الملف المسجّل (async) — نُعيد ترميزه إلى WAV نظيف أولاً
      ;(async () => {
        try {
          let uploadBlob: Blob = blob
          let filename = `recording.${mimeTypeRef.current.split('/')[1]?.split(';')[0] || 'webm'}`
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
            const updated = notesRef.current.map(n =>
              n.id === noteId ? { ...n, transcription: cleanTranscriptText(text) } : n
            )
            onNotesChange(updated)
          }
        } catch (err) {
          console.error('Summary transcription failed:', err)
        }
      })()
    }
    reader.readAsDataURL(blob)
  }, [onNotesChange])

  const startRecording = async () => {
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('المتصفح لا يدعم تسجيل الصوت. يرجى استخدام متصفح حديث مثل Chrome أو Safari')
        return
      }
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setError('تسجيل الصوت يتطلب اتصالاً آمناً (HTTPS)')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickSupportedMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stopTimer()
        cleanupStream()
        setIsRecording(false)
        setRecordingTime(0)
        finalizeRecording()
      }
      recorder.onerror = () => {
        setError('حدث خطأ أثناء التسجيل')
      }

      startTimeRef.current = Date.now()
      recorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.round((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } catch (err: any) {
      cleanupStream()
      setError(`فشل بدء التسجيل: ${err?.message || 'خطأ غير متوقع'}`)
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <motion.button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium shadow-sm transition-all ${
          isRecording
            ? 'bg-red-500 text-white ring-2 ring-red-300'
            : disabled
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              : 'bg-white text-teal-600 hover:bg-teal-50 border border-teal-300'
        }`}
        title={isRecording ? 'إيقاف التسجيل' : 'إضافة تسجيل صوتي جديد'}
      >
        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        <span>{isRecording ? 'إيقاف' : 'تسجيل جديد'}</span>
        {isRecording && (
          <span className="font-mono text-xs">
            {`${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, '0')}`}
          </span>
        )}
      </motion.button>

      {isRecording && (
        <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
      )}

      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-full right-0 mt-1 text-xs text-red-500 whitespace-nowrap"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
