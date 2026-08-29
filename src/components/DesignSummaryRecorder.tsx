'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, X } from 'lucide-react'
import type { DesignSummaryNote } from '@/components/InteractiveImageAnnotation'
import { pickSupportedMimeType } from '@/lib/audio-utils'

interface Props {
  onRecordingComplete: (note: DesignSummaryNote) => void
  disabled?: boolean
  mode?: 'add' | 'replace'
  onCancel?: () => void
  language?: 'ar' | 'en'
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

const RECORDER_COPY = {
  ar: {
    noAudio: 'لم يتم التقاط صوت. حاول التسجيل مرة أخرى.',
    prepareError: 'تعذّر تجهيز التسجيل للحفظ.',
    readError: 'تعذّر قراءة التسجيل الصوتي.',
    unsupported: 'المتصفح لا يدعم تسجيل الصوت. يرجى استخدام متصفح حديث مثل Chrome أو Safari.',
    secureContext: 'تسجيل الصوت يتطلب اتصالًا آمنًا (HTTPS).',
    recordingError: 'حدث خطأ أثناء التسجيل. حاول مرة أخرى.',
    startError: 'فشل بدء التسجيل',
    unexpected: 'خطأ غير متوقع',
    add: 'تسجيل صوت جديد',
    replace: 'ابدأ التسجيل البديل',
    stop: 'إنهاء وحفظ',
    cancelRecording: 'إلغاء التسجيل',
    cancelEdit: 'إلغاء التعديل',
  },
  en: {
    noAudio: 'No audio was captured. Please record again.',
    prepareError: 'Could not prepare the recording for saving.',
    readError: 'Could not read the audio recording.',
    unsupported: 'This browser does not support audio recording. Use a modern browser such as Chrome or Safari.',
    secureContext: 'Audio recording requires a secure HTTPS connection.',
    recordingError: 'An error occurred while recording. Please try again.',
    startError: 'Could not start recording',
    unexpected: 'Unexpected error',
    add: 'Record new audio',
    replace: 'Record replacement',
    stop: 'Finish and save',
    cancelRecording: 'Cancel recording',
    cancelEdit: 'Cancel edit',
  },
} as const

/**
 * مسجّل مستقل لإضافة تسجيل إلى ملخص التصميم أو تسجيل بديل عنه.
 * لا يغيّر قائمة الملخصات بنفسه؛ يعيد التسجيل المكتمل للمكوّن الأب حتى يقرر
 * إن كان سيضيفه أو يستبدل به تسجيلًا موجودًا.
 */
export default function DesignSummaryRecorder({
  onRecordingComplete,
  disabled = false,
  mode = 'add',
  onCancel,
  language = 'ar'
}: Props) {
  const copy = RECORDER_COPY[language]
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef('audio/webm')
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardRecordingRef = useRef(false)
  const isUnmountingRef = useRef(false)

  const stopTimer = useCallback(() => {
    if (!timerRef.current) return
    clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  const finalizeRecording = useCallback(() => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current })
    chunksRef.current = []
    if (blob.size === 0) {
      setError(copy.noAudio)
      return
    }

    const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000))
    const noteId = `summary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const reader = new FileReader()

    reader.onloadend = () => {
      if (isUnmountingRef.current) return
      if (typeof reader.result !== 'string') {
        setError(copy.prepareError)
        return
      }

      onRecordingComplete({
        id: noteId,
        data: reader.result,
        timestamp: Date.now(),
        duration,
        transcription: undefined
      })
    }
    reader.onerror = () => {
      if (!isUnmountingRef.current) setError(copy.readError)
    }
    reader.readAsDataURL(blob)
  }, [copy.noAudio, copy.prepareError, copy.readError, onRecordingComplete])

  useEffect(() => {
    // React Strict Mode يشغّل دورة setup/cleanup إضافية في التطوير.
    isUnmountingRef.current = false
    return () => {
      isUnmountingRef.current = true
      discardRecordingRef.current = true
      stopTimer()

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      cleanupStream()
    }
  }, [cleanupStream, stopTimer])

  const startRecording = async () => {
    setError(null)
    discardRecordingRef.current = false

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError(copy.unsupported)
        return
      }
      if (!window.isSecureContext) {
        setError(copy.secureContext)
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickSupportedMimeType()
      mimeTypeRef.current = mimeType || 'audio/webm'
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stopTimer()
        cleanupStream()
        mediaRecorderRef.current = null

        if (!isUnmountingRef.current) {
          setIsRecording(false)
          setRecordingTime(0)
        }

        if (!discardRecordingRef.current && !isUnmountingRef.current) finalizeRecording()
        discardRecordingRef.current = false
      }
      recorder.onerror = () => {
        setError(copy.recordingError)
      }

      startTimeRef.current = Date.now()
      recorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.round((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } catch (recordingError: unknown) {
      cleanupStream()
      setError(`${copy.startError}: ${getErrorMessage(recordingError, copy.unexpected)}`)
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }

  const discardRecording = () => {
    discardRecordingRef.current = true
    stopRecording()
  }

  const idleLabel = mode === 'replace' ? copy.replace : copy.add

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          whileTap={{ scale: 0.96 }}
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-sm transition-all ${
            isRecording
              ? 'bg-red-500 text-white ring-4 ring-red-100'
              : disabled
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'border border-teal-300 bg-white text-teal-700 hover:border-teal-400 hover:bg-teal-50'
          }`}
          title={isRecording ? copy.stop : idleLabel}
        >
          {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          <span>{isRecording ? copy.stop : idleLabel}</span>
          {isRecording ? (
            <span className="font-mono text-xs" dir="ltr">
              {`${Math.floor(recordingTime / 60)}:${String(recordingTime % 60).padStart(2, '0')}`}
            </span>
          ) : null}
        </motion.button>

        {isRecording ? (
          <button
            type="button"
            onClick={discardRecording}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5" />
            <span>{copy.cancelRecording}</span>
          </button>
        ) : onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            {copy.cancelEdit}
          </button>
        ) : null}

        {isRecording ? <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" /> : null}
      </div>

      <AnimatePresence>
        {error ? (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-sm text-right text-xs leading-5 text-red-600"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
