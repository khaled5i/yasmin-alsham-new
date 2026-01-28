'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Play, Pause, Trash2, Download, FileText, Languages, Loader2 } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'

interface VoiceNote {
  id: string
  data: string
  timestamp: number
  duration?: number
  transcription?: string
  translatedText?: string
  translationLanguage?: string
}

interface VoiceNotesProps {
  voiceNotes?: VoiceNote[]
  onVoiceNotesChange: (voiceNotes: VoiceNote[]) => void
  disabled?: boolean
  readOnly?: boolean // للسماح بالترجمة فقط دون التسجيل أو الحذف
}

export default function VoiceNotes({ voiceNotes = [], onVoiceNotesChange, disabled = false, readOnly = false }: VoiceNotesProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { t } = useTranslation()
  const [recordingTime, setRecordingTime] = useState(0)
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<Record<string, string>>({})

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

      // طلب الأذونات بشكل صريح على Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        try {
          // محاولة طلب الأذونات بشكل صريح
          await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (permError) {
          console.error('Permission error:', permError)
          setError('يرجى السماح بالوصول إلى الميكروفون من إعدادات التطبيق')
          return
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setCurrentAudioBlob(blob)

        // تحويل إلى base64 وإضافة إلى القائمة
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = reader.result as string
          const noteId = Date.now().toString()
          const newVoiceNote: VoiceNote = {
            id: noteId,
            data: base64,
            timestamp: Date.now(),
            duration: recordingTime
          }

          const updatedNotes = [...voiceNotes, newVoiceNote]
          onVoiceNotesChange(updatedNotes)

          // تحويل تلقائي للصوت إلى نص - تمرير الملاحظات المحدثة
          await transcribeAudioAutomatically(noteId, blob, updatedNotes)
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
      setError('فشل الوصول إلى الميكروفون. يرجى التحقق من الأذونات في إعدادات التطبيق.')
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

  // تحويل الصوت إلى نص باستخدام OpenAI Whisper API
  const transcribeAudio = async (noteId: string) => {
    try {
      setTranscribingId(noteId)
      setError(null)

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة تحويل الصوت إلى نص غير متاحة في التطبيق المحمول حالياً')
        setTranscribingId(null)
        return
      }

      const note = voiceNotes.find(n => n.id === noteId)
      if (!note) return

      // تحويل base64 إلى Blob
      const blob = base64ToBlob(note.data)

      // إنشاء FormData لإرسال الملف الصوتي
      const formData = new FormData()
      formData.append('audio', blob, 'audio.webm')
      formData.append('language', 'ar') // اللغة العربية

      // إرسال الطلب إلى API
      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to transcribe audio')
      }

      const data = await response.json()

      if (!data.text) {
        throw new Error('No transcription returned')
      }

      // تحديث الملاحظة بالنص المحول
      const updatedNotes = voiceNotes.map(n =>
        n.id === noteId ? { ...n, transcription: data.text } : n
      )
      onVoiceNotesChange(updatedNotes)
      setTranscribingId(null)

    } catch (error) {
      console.error('Transcription error:', error)
      setError(t('transcription_error') + ': ' + (error instanceof Error ? error.message : 'Unknown error'))
      setTranscribingId(null)
    }
  }

  // تحويل تلقائي للصوت إلى نص (يتم استدعاؤه بعد التسجيل مباشرة)
  const transcribeAudioAutomatically = async (noteId: string, audioBlob: Blob, currentNotes: VoiceNote[]) => {
    try {
      setTranscribingId(noteId)

      // ملاحظة: API Routes لا تعمل في Static Export (Capacitor)
      // يجب استخدام Supabase Edge Function أو external API endpoint
      // للتطبيق المحمول، يجب نشر API على server منفصل

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        console.warn('Voice transcription not available in Capacitor build. API Routes require server-side execution.')
        setTranscribingId(null)
        return
      }

      // إنشاء FormData لإرسال الملف الصوتي
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('language', 'ar') // اللغة العربية

      // إرسال الطلب إلى API
      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Auto-transcription failed:', errorData)
        setTranscribingId(null)
        return // فشل التحويل التلقائي لا يجب أن يوقف العملية
      }

      const data = await response.json()

      if (data.text) {
        // تحديث الملاحظة بالنص المحول - استخدام الملاحظات المحدثة المُمررة
        const updatedNotes = currentNotes.map(n =>
          n.id === noteId ? { ...n, transcription: data.text } : n
        )
        onVoiceNotesChange(updatedNotes)
      }

      setTranscribingId(null)

    } catch (error) {
      console.error('Auto-transcription error:', error)
      setTranscribingId(null)
      // لا نعرض رسالة خطأ للمستخدم في التحويل التلقائي
    }
  }

  // تحويل جميع التسجيلات القديمة دفعة واحدة
  const transcribeAllNotes = async () => {
    const notesToTranscribe = voiceNotes.filter(note => !note.transcription)

    if (notesToTranscribe.length === 0) {
      setError(t('no_notes_to_transcribe'))
      return
    }

    setError(null)

    for (const note of notesToTranscribe) {
      await transcribeAudio(note.id)
      // انتظار قصير بين كل طلب لتجنب تجاوز حدود API
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // ترجمة النص باستخدام OpenRouter API
  const translateText = async (noteId: string, targetLanguage: string) => {
    try {
      setTranslatingId(noteId)
      setError(null)

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        setTranslatingId(null)
        return
      }

      const note = voiceNotes.find(n => n.id === noteId)
      if (!note || !note.transcription) {
        setError('لا يوجد نص لترجمته')
        setTranslatingId(null)
        return
      }

      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: note.transcription,
          targetLanguage: targetLanguage
        })
      })

      if (!response.ok) {
        throw new Error('Translation failed')
      }

      const data = await response.json()

      // تحديث الملاحظة بالنص المترجم
      const updatedNotes = voiceNotes.map(n =>
        n.id === noteId
          ? {
            ...n,
            translatedText: data.translatedText,
            translationLanguage: targetLanguage
          }
          : n
      )
      onVoiceNotesChange(updatedNotes)
      setTranslatingId(null)

    } catch (error) {
      console.error('Translation error:', error)
      setError(t('translation_error'))
      setTranslatingId(null)
    }
  }

  // تحديث النص المحول
  const updateTranscription = (noteId: string, newText: string) => {
    const updatedNotes = voiceNotes.map(n =>
      n.id === noteId ? { ...n, transcription: newText } : n
    )
    onVoiceNotesChange(updatedNotes)
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

      {/* قسم التسجيل الجديد - إخفاء في وضع القراءة فقط */}
      {!readOnly && (
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
      )}

      {/* قائمة التسجيلات الصوتية */}
      {voiceNotes.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-gray-700">
              {t('voice_notes')} ({voiceNotes.length})
            </h4>

            {/* زر تحويل الكل - إخفاء في وضع القراءة فقط */}
            {!readOnly && voiceNotes.some(note => !note.transcription) && (
              <button
                type="button"
                onClick={transcribeAllNotes}
                disabled={disabled || transcribingId !== null}
                className="inline-flex items-center space-x-1 space-x-reverse px-3 py-1.5 text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {transcribingId ? (
                  <>
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                    <span>{t('transcribing')}</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{t('transcribe_all')}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {voiceNotes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm space-y-3"
            >
              {/* رأس التسجيل الصوتي */}
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

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => deleteVoiceNote(note.id)}
                    disabled={disabled}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* أزرار التحويل والترجمة */}
              <div className="flex flex-wrap items-center gap-2">
                {/* مؤشر التحويل التلقائي أو زر تحويل يدوي */}
                {!note.transcription && transcribingId === note.id && (
                  <div className="inline-flex items-center space-x-1 space-x-reverse px-3 py-1.5 text-xs sm:text-sm bg-blue-100 text-blue-700 rounded-lg border border-blue-300">
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                    <span>{t('transcribing')}</span>
                  </div>
                )}

                {!readOnly && !note.transcription && transcribingId !== note.id && (
                  <button
                    type="button"
                    onClick={() => transcribeAudio(note.id)}
                    disabled={disabled || transcribingId !== null}
                    className="inline-flex items-center space-x-1 space-x-reverse px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{t('transcribe_to_text')}</span>
                  </button>
                )}

                {/* قائمة اللغات للترجمة */}
                {note.transcription && (
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <select
                      value={selectedLanguage[note.id] || note.translationLanguage || ''}
                      onChange={(e) => {
                        setSelectedLanguage({ ...selectedLanguage, [note.id]: e.target.value })
                        if (e.target.value) {
                          translateText(note.id, e.target.value)
                        }
                      }}
                      disabled={(disabled && !readOnly) || translatingId === note.id}
                      className="px-2 py-1 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">{t('select_language')}</option>
                      <option value="en">{t('english')}</option>
                      <option value="ur">{t('urdu')}</option>
                      <option value="bn">{t('bengali')}</option>
                    </select>

                    {translatingId === note.id && (
                      <div className="inline-flex items-center space-x-1 space-x-reverse text-xs text-gray-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{t('translating')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* عرض النص المحول */}
              {note.transcription && (
                <div className="space-y-2 bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <label className="text-xs sm:text-sm font-semibold text-blue-800">
                        {t('transcription')}
                      </label>
                    </div>
                    {!readOnly && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                        {t('edit_transcription')}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={note.transcription}
                    onChange={(e) => updateTranscription(note.id, e.target.value)}
                    disabled={disabled || readOnly}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border-2 border-blue-300 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 resize-none"
                    placeholder={t('transcription')}
                    dir="auto"
                  />
                </div>
              )}

              {/* عرض النص المترجم */}
              {note.translatedText && (
                <div className="space-y-2 bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200">
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Languages className="w-4 h-4 text-green-600" />
                    <label className="text-xs sm:text-sm font-semibold text-green-800">
                      {t('translation')}
                    </label>
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                      {note.translationLanguage?.toUpperCase()}
                    </span>
                  </div>
                  <div className="w-full px-3 py-2 text-sm border-2 border-green-300 bg-white rounded-lg whitespace-pre-wrap" dir="auto">
                    {note.translatedText}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
