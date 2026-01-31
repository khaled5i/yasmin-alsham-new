'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Loader2, Trash2, Play, Pause, Languages } from 'lucide-react'
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

interface UnifiedNotesInputProps {
  notes: string
  voiceNotes: VoiceNote[]
  onNotesChange: (notes: string) => void
  onVoiceNotesChange: (voiceNotes: VoiceNote[]) => void
  disabled?: boolean
  placeholder?: string
}

export default function UnifiedNotesInput({
  notes,
  voiceNotes,
  onNotesChange,
  onVoiceNotesChange,
  disabled = false,
  placeholder = 'اكتب ملاحظاتك هنا أو اضغط على المايكروفون للتسجيل الصوتي...'
}: UnifiedNotesInputProps) {
  const { t } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<string>('en') // اللغة المستهدفة للترجمة
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // تحويل base64 إلى Blob
  const base64ToBlob = (base64: string): Blob => {
    const byteCharacters = atob(base64.split(',')[1])
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'audio/webm' })
  }

  // تنسيق الوقت
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // بدء التسجيل
  const startRecording = async () => {
    try {
      setError(null)

      // طلب الأذونات
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        try {
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

        // تحويل إلى base64
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

          // تحويل تلقائي للصوت إلى نص
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
      setError('فشل الوصول إلى الميكروفون. يرجى التحقق من الأذونات.')
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

  // تحويل تلقائي للصوت إلى نص
  const transcribeAudioAutomatically = async (noteId: string, audioBlob: Blob, currentNotes: VoiceNote[]) => {
    try {
      setTranscribingId(noteId)

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        console.warn('Voice transcription not available in Capacitor build.')
        setTranscribingId(null)
        return
      }

      // إنشاء FormData لإرسال الملف الصوتي
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('language', 'ar')

      // إرسال الطلب إلى API
      const response = await fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        console.error('Auto-transcription failed')
        setTranscribingId(null)
        return
      }

      const data = await response.json()

      if (data.text) {
        // تحديث الملاحظة بالنص المحول
        const updatedNotes = currentNotes.map(n =>
          n.id === noteId ? { ...n, transcription: data.text } : n
        )
        onVoiceNotesChange(updatedNotes)

        // إضافة النص المحول إلى حقل الملاحظات النصية
        const newNotesText = notes ? `${notes}\n\n${data.text}` : data.text
        onNotesChange(newNotesText)
      }

      setTranscribingId(null)
    } catch (error) {
      console.error('Transcription error:', error)
      setTranscribingId(null)
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

  // حذف ملاحظة صوتية
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
      setError('فشلت عملية الترجمة')
      setTranslatingId(null)
    }
  }

  // ترجمة جميع النصوص (الملاحظات النصية + التسجيلات الصوتية)
  const translateAllTexts = async () => {
    try {
      setError(null)

      // التحقق من أننا لسنا في Capacitor
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        return
      }

      // ترجمة الملاحظات النصية إذا كانت موجودة
      if (notes && notes.trim()) {
        setTranslatingId('main-notes')

        const response = await fetch('/api/translate-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: notes,
            targetLanguage: targetLanguage
          })
        })

        if (response.ok) {
          const data = await response.json()
          // إضافة الترجمة تحت النص الأصلي
          const langName = getLanguageName(targetLanguage)
          const translatedNotes = `${notes}\n\n--- الترجمة (${langName}) ---\n${data.translatedText}`
          onNotesChange(translatedNotes)
        }

        setTranslatingId(null)
      }

      // ترجمة جميع التسجيلات الصوتية التي لها نص محول
      const notesToTranslate = voiceNotes.filter(note => note.transcription && !note.translatedText)

      for (const note of notesToTranslate) {
        await translateText(note.id, targetLanguage)
        // انتظار قصير بين كل طلب
        await new Promise(resolve => setTimeout(resolve, 500))
      }

    } catch (error) {
      console.error('Translation error:', error)
      setError('فشلت عملية الترجمة')
      setTranslatingId(null)
    }
  }

  // إغلاق القائمة المنسدلة عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showLanguageDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.language-dropdown-container')) {
          setShowLanguageDropdown(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showLanguageDropdown])

  // تنظيف عند إلغاء التحميل
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
      {/* رسالة الخطأ */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* حقل الملاحظات النصية مع أيقونة المايكروفون وزر الترجمة */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={6}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pr-4 pl-28 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300 resize-none"
          dir="rtl"
        />

        {/* أيقونات المايكروفون والترجمة داخل الحقل النصي */}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {/* أيقونة المايكروفون */}
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="p-2 bg-pink-600 text-white rounded-full hover:bg-pink-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              title="تسجيل ملاحظة صوتية"
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all duration-300 shadow-md hover:shadow-lg animate-pulse"
              title="إيقاف التسجيل"
            >
              <MicOff className="w-5 h-5" />
            </button>
          )}

          {/* زر الترجمة مع القائمة المنسدلة */}
          <div className="relative language-dropdown-container">
            <button
              type="button"
              onClick={translateAllTexts}
              disabled={disabled || translatingId !== null || (!(notes || '').trim() && voiceNotes.filter(n => n.transcription).length === 0)}
              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              title={`ترجمة جميع النصوص إلى ${getLanguageName(targetLanguage)}`}
              onContextMenu={(e) => {
                e.preventDefault()
                setShowLanguageDropdown(!showLanguageDropdown)
              }}
            >
              {translatingId ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Languages className="w-5 h-5" />
              )}
            </button>

            {/* أيقونة صغيرة لفتح القائمة المنسدلة */}
            <button
              type="button"
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              disabled={disabled}
              className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50"
              title="اختيار اللغة"
            >
              ▼
            </button>

            {/* القائمة المنسدلة لاختيار اللغة */}
            <AnimatePresence>
              {showLanguageDropdown && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  className="absolute left-full ml-2 top-0 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden z-50 min-w-[150px]"
                >
                  <div className="py-1">
                    {availableLanguages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setTargetLanguage(lang.code)
                          setShowLanguageDropdown(false)
                        }}
                        className={`w-full px-4 py-2 text-right text-sm hover:bg-blue-50 transition-colors ${targetLanguage === lang.code
                          ? 'bg-blue-100 text-blue-700 font-semibold'
                          : 'text-gray-700'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500">{lang.name}</span>
                          <span>{lang.nameAr}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* مؤشر التسجيل */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute left-3 bottom-3 flex items-center gap-2 bg-red-100 px-3 py-1.5 rounded-full border border-red-300"
            >
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-red-700">
                {formatTime(recordingTime)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* مؤشر التحويل */}
        <AnimatePresence>
          {transcribingId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute left-3 bottom-3 flex items-center gap-2 bg-blue-100 px-3 py-1.5 rounded-full border border-blue-300"
            >
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                جاري تحويل الصوت إلى نص...
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* قائمة التسجيلات الصوتية المحفوظة */}
      <AnimatePresence>
        {voiceNotes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <p className="text-sm font-medium text-gray-700">
              التسجيلات الصوتية ({voiceNotes.length})
            </p>

            {voiceNotes.map((note, index) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-pink-300 transition-colors"
              >
                {/* زر التشغيل */}
                <button
                  type="button"
                  onClick={() => togglePlayback(note)}
                  className="p-2 bg-pink-600 text-white rounded-full hover:bg-pink-700 transition-colors flex-shrink-0"
                >
                  {playingId === note.id ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>

                {/* معلومات التسجيل */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    تسجيل #{index + 1}
                    {note.duration && (
                      <span className="text-gray-500 mr-2">
                        ({formatTime(note.duration)})
                      </span>
                    )}
                  </p>

                  {/* النص المحول من الصوت */}
                  {note.transcription && (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-gray-600 line-clamp-2">
                        <span className="font-semibold text-gray-700">النص: </span>
                        {note.transcription}
                      </p>

                      {/* النص المترجم */}
                      {note.translatedText && (
                        <p className="text-xs text-blue-600 line-clamp-2">
                          <span className="font-semibold">الترجمة ({note.translationLanguage || 'en'}): </span>
                          {note.translatedText}
                        </p>
                      )}

                      {/* زر ترجمة فردي إذا لم يكن مترجماً */}
                      {!note.translatedText && (
                        <button
                          type="button"
                          onClick={() => translateText(note.id, targetLanguage)}
                          disabled={disabled || translatingId === note.id}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 mt-1"
                          title={`ترجمة إلى ${getLanguageName(targetLanguage)}`}
                        >
                          {translatingId === note.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>جاري الترجمة...</span>
                            </>
                          ) : (
                            <>
                              <Languages className="w-3 h-3" />
                              <span>ترجمة إلى {getLanguageName(targetLanguage)}</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* زر الحذف */}
                <button
                  type="button"
                  onClick={() => deleteVoiceNote(note.id)}
                  disabled={disabled}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

