'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Play, Pause, Trash2, Download } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface VoiceNote {
  id: string
  data: string
  timestamp: number
  duration?: number
}

interface VoiceNotesProps {
  voiceNotes?: VoiceNote[]
  onVoiceNotesChange: (voiceNotes: VoiceNote[]) => void
  disabled?: boolean
}

export default function VoiceNotes({ voiceNotes = [], onVoiceNotesChange, disabled = false }: VoiceNotesProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { t } = useTranslation()
  const [recordingTime, setRecordingTime] = useState(0)
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // تحويل base64 إلى Blob للتشغيل
  const base64ToBlob = (base64: string): Blob => {
    const byteCharacters = atob(base64.split(',')[1])
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'audio/webm' })
  }

  // بدء التسجيل
  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setCurrentAudioBlob(blob)

        // تحويل إلى base64 وإضافة إلى القائمة
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = reader.result as string
          const newVoiceNote: VoiceNote = {
            id: Date.now().toString(),
            data: base64,
            timestamp: Date.now(),
            duration: recordingTime
          }

          const updatedNotes = [...voiceNotes, newVoiceNote]
          onVoiceNotesChange(updatedNotes)
        }
        reader.readAsDataURL(blob)

        // إيقاف جميع المسارات
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      // بدء العداد
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (error) {
      console.error('خطأ في بدء التسجيل:', error)
      setError(t('microphone_access_error'))
    }
  }

  // إيقاف التسجيل
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  // تشغيل/إيقاف الصوت
  const togglePlayback = (voiceNote: VoiceNote) => {
    const audioRefs = audioRefsRef.current

    // إيقاف أي تشغيل حالي
    if (playingId && playingId !== voiceNote.id) {
      const currentAudio = audioRefs.get(playingId)
      if (currentAudio) {
        currentAudio.pause()
      }
    }

    let audio = audioRefs.get(voiceNote.id)
    if (!audio) {
      const blob = base64ToBlob(voiceNote.data)
      audio = new Audio(URL.createObjectURL(blob))
      audio.onended = () => setPlayingId(null)
      audioRefs.set(voiceNote.id, audio)
    }

    if (playingId === voiceNote.id) {
      audio.pause()
      setPlayingId(null)
    } else {
      audio.play()
      setPlayingId(voiceNote.id)
    }
  }

  // حذف ملاحظة صوتية محددة
  const deleteVoiceNote = (noteId: string) => {
    const audioRefs = audioRefsRef.current
    const audio = audioRefs.get(noteId)

    if (audio) {
      audio.pause()
      audioRefs.delete(noteId)
    }

    if (playingId === noteId) {
      setPlayingId(null)
    }

    const updatedNotes = voiceNotes.filter(note => note.id !== noteId)
    onVoiceNotesChange(updatedNotes)
  }

  // تنسيق الوقت
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // تنسيق التاريخ
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // تنظيف الموارد عند إلغاء التحميل
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      const audioRefs = audioRefsRef.current
      audioRefs.forEach(audio => audio.pause())
      audioRefs.clear()
    }
  }, [])

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* قسم التسجيل الجديد */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        {!isRecording ? (
          // زر بدء التسجيل
          <div className="text-center">
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="inline-flex items-center space-x-2 space-x-reverse px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mic className="w-5 h-5" />
              <span>{t('start_recording')}</span>
            </button>
            <p className="text-xs text-gray-500 mt-2">{t('click_to_record_voice_note')}</p>
          </div>
        ) : (
          // واجهة التسجيل
          <div className="text-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="inline-flex items-center space-x-2 space-x-reverse mb-4"
            >
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-red-600 font-medium">جاري التسجيل...</span>
            </motion.div>

            <div className="text-2xl font-bold text-gray-800 mb-4">
              {formatTime(recordingTime)}
            </div>

            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center space-x-2 space-x-reverse px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-300"
            >
              <MicOff className="w-5 h-5" />
              <span>{t('stop_recording')}</span>
            </button>
          </div>
        )}
      </div>

      {/* قائمة التسجيلات الصوتية */}
      {voiceNotes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">
              {t('voice_notes')} ({voiceNotes.length})
            </h4>
          </div>

          {voiceNotes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <button
                    type="button"
                    onClick={() => togglePlayback(note)}
                    className="p-2 bg-pink-600 text-white rounded-full hover:bg-pink-700 transition-colors duration-300"
                  >
                    {playingId === note.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>

                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {t('voice_note')} #{index + 1}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(note.timestamp)}
                      {note.duration && ` • ${formatTime(note.duration)}`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteVoiceNote(note.id)}
                  disabled={disabled}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
