'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Play, Pause, Trash2, Download, FileText, Languages, Loader2, ChevronDown } from 'lucide-react'
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
  orderId?: string // معرف الطلب لحفظ الترجمات
  workerId?: string // معرف العامل لحفظ الترجمات الخاصة به
}

// قائمة اللغات المتاحة للترجمة
const availableLanguages = [
  { code: 'en', name: 'English', nameAr: 'الإنجليزية' },
  { code: 'hi', name: 'Hindi', nameAr: 'الهندية' },
  { code: 'bn', name: 'Bengali', nameAr: 'البنغالية' },
  { code: 'ur', name: 'Urdu', nameAr: 'الأوردو' },
  { code: 'ar', name: 'Arabic', nameAr: 'العربية' }
]

// الحصول على اسم اللغة
const getLanguageName = (code: string) => {
  const lang = availableLanguages.find(l => l.code === code)
  return lang ? lang.nameAr : code
}

export default function VoiceNotes({
  voiceNotes = [],
  onVoiceNotesChange,
  disabled = false,
  readOnly = false,
  orderId,
  workerId
}: VoiceNotesProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { t } = useTranslation()
  const [recordingTime, setRecordingTime] = useState(0)
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<Record<string, string>>({})
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [showLanguageDropdown, setShowLanguageDropdown] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // تحميل الترجمات المحفوظة عند فتح الصفحة
  useEffect(() => {
    const loadSavedTranslations = async () => {
      if (!orderId || !workerId || voiceNotes.length === 0) return

      try {
        const response = await fetch(`/api/worker-translations?orderId=${orderId}&workerId=${workerId}`)
        if (!response.ok) return

        const savedTranslations = await response.json()

        // دمج الترجمات المحفوظة مع الملاحظات الصوتية
        const updatedNotes = voiceNotes.map(note => {
          const savedTranslation = savedTranslations.find((t: any) => t.voice_note_id === note.id)
          if (savedTranslation) {
            return {
              ...note,
              translatedText: savedTranslation.translated_text,
              translationLanguage: savedTranslation.target_language
            }
          }
          return note
        })

        // تحديث الملاحظات فقط إذا كانت هناك تغييرات
        const hasChanges = updatedNotes.some((note, index) =>
          note.translatedText !== voiceNotes[index].translatedText
        )

        if (hasChanges) {
          onVoiceNotesChange(updatedNotes)
        }
      } catch (error) {
        console.error('Error loading saved translations:', error)
      }
    }

    loadSavedTranslations()
  }, [orderId, workerId]) // نستمع فقط لتغييرات orderId و workerId

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
        const errorData = await response.json().catch(() => ({}))
        console.error('Translation API error:', errorData)
        throw new Error(errorData.error || 'Translation failed')
      }

      const data = await response.json()

      if (!data.translatedText) {
        throw new Error('No translation returned from API')
      }

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

      // حفظ الترجمة في قاعدة البيانات إذا كان orderId و workerId متوفرين
      if (orderId && workerId) {
        try {
          await fetch('/api/worker-translations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              workerId,
              voiceNoteId: noteId,
              originalText: note.transcription,
              translatedText: data.translatedText,
              targetLanguage: targetLanguage
            })
          })
        } catch (dbError) {
          console.error('Error saving translation to database:', dbError)
          // لا نعرض خطأ للمستخدم لأن الترجمة نجحت في الواجهة
        }
      }

      setTranslatingId(null)

    } catch (error) {
      console.error('Translation error:', error)
      const errorMessage = error instanceof Error ? error.message : t('translation_error')
      setError(`خطأ في الترجمة: ${errorMessage}`)
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

  // إغلاق قائمة اللغات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showLanguageDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.language-dropdown-container')) {
          setShowLanguageDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showLanguageDropdown])

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
      <AnimatePresence>
        {voiceNotes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-50 rounded-lg p-4 border border-gray-200"
          >
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Mic className="w-4 h-4 text-pink-600" />
              التسجيلات الصوتية ({voiceNotes.length})
              {/* زر تحويل الكل - مدمج وصغير */}
              {!readOnly && voiceNotes.some(note => !note.transcription) && (
                <button
                  type="button"
                  onClick={transcribeAllNotes}
                  disabled={disabled || transcribingId !== null}
                  className="mr-auto inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {transcribingId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <FileText className="w-3 h-3" />
                  )}
                  <span>{t('transcribe_all')}</span>
                </button>
              )}
            </h4>
            <div className="space-y-3 max-h-[500px] overflow-y-auto" style={{ overflow: 'visible' }}>
              {voiceNotes.map((note, index) => (
                <div
                  key={note.id}
                  className="bg-white rounded-lg p-3 border border-gray-200 transition-all relative"
                  style={{ overflow: 'visible' }}
                >
                  {/* رأس التسجيل - الرقم والنص على نفس السطر */}
                  <div className="flex items-start justify-between gap-2 mb-2 relative">
                    {/* الرقم والنص على نفس السطر */}
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <span className="text-base text-pink-600 font-bold flex-shrink-0 mt-0.5">
                        {index + 1}.
                      </span>
                      {note.transcription && (
                        <p className="text-sm text-gray-700 leading-relaxed break-words">
                          {note.transcription}
                        </p>
                      )}
                    </div>

                    {/* أزرار التحكم */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* زر تشغيل الصوت */}
                      <button
                        type="button"
                        onClick={() => togglePlayback(note)}
                        className={`p-1.5 rounded transition-colors ${playingId === note.id
                          ? 'bg-green-500 text-white'
                          : 'text-green-600 hover:bg-green-50'
                          }`}
                        title={playingId === note.id ? 'إيقاف' : 'تشغيل الصوت'}
                      >
                        {playingId === note.id ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>

                      {/* زر الترجمة مع dropdown - يظهر دائماً إذا كان هناك نص محول */}
                      {note.transcription && (
                        <div className="relative language-dropdown-container">
                          <button
                            type="button"
                            onClick={() => setShowLanguageDropdown(showLanguageDropdown === note.id ? null : note.id)}
                            disabled={(disabled && !readOnly) || translatingId === note.id}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50 flex items-center gap-0.5"
                            title="ترجمة"
                          >
                            {translatingId === note.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Languages className="w-4 h-4" />
                                <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>

                          {/* قائمة اللغات المنسدلة */}
                          <AnimatePresence>
                            {showLanguageDropdown === note.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] min-w-[140px] overflow-hidden"
                              >
                                {availableLanguages.map((lang) => (
                                  <button
                                    key={lang.code}
                                    type="button"
                                    onClick={() => {
                                      translateText(note.id, lang.code)
                                      setShowLanguageDropdown(null)
                                    }}
                                    className={`w-full px-3 py-2 text-right text-sm hover:bg-purple-50 transition-colors ${note.translationLanguage === lang.code
                                      ? 'bg-purple-100 text-purple-700 font-semibold'
                                      : 'text-gray-700'
                                      }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-gray-500">{lang.name}</span>
                                      <span>{lang.nameAr}</span>
                                    </div>
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* زر تحويل الصوت إلى نص */}
                      {!note.transcription && transcribingId === note.id && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                      {!readOnly && !note.transcription && transcribingId !== note.id && (
                        <button
                          type="button"
                          onClick={() => transcribeAudio(note.id)}
                          disabled={disabled || transcribingId !== null}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                          title={t('transcribe_to_text')}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}

                      {/* زر الحذف */}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => deleteVoiceNote(note.id)}
                          disabled={disabled}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* محتوى التسجيل */}
                  {note.transcription ? (
                    <div className="space-y-2">
                      {/* النص المترجم - عرضه في صندوق بنفسجي */}
                      {note.translatedText && (
                        <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-2">
                          <p className="text-xs text-purple-600 font-medium mb-0.5 flex items-center gap-1">
                            <Languages className="w-3 h-3" />
                            الترجمة ({getLanguageName(note.translationLanguage || 'en')})
                          </p>
                          <p className="text-sm text-gray-600" dir="auto">
                            {note.translatedText}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 mr-6">تسجيل صوتي - في انتظار التحويل إلى نص...</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
