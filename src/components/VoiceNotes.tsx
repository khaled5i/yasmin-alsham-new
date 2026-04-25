'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Play, Pause, Trash2, Languages, Loader2, ChevronDown } from 'lucide-react'
import { useTranslation } from '@/hooks/useTranslation'
import { useAuthStore } from '@/store/authStore'

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
  const [error, setError] = useState<string | null>(null)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [showLanguageDropdown, setShowLanguageDropdown] = useState<string | null>(null)
  const { user } = useAuthStore()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const timerRef = useRef<any>(null)
  const chunksRef = useRef<Blob[]>([])

  // Soniox real-time STT refs
  const [liveTranscription, setLiveTranscription] = useState('')
  const [sonioxConnected, setSonioxConnected] = useState(false)
  const sonioxWsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const finalTokensRef = useRef<string[]>([])
  const currentBlobRef = useRef<Blob | null>(null)
  const sonioxFinishedRef = useRef<boolean>(false)
  const hasSonioxRef = useRef<boolean>(false)
  const recordingIdRef = useRef<string>('')
  const recordingDurationRef = useRef<number>(0)
  const voiceNotesRef = useRef<VoiceNote[]>(voiceNotes)
  // قائمة انتظار للصوت أثناء اتصال WebSocket
  const audioQueueRef = useRef<ArrayBuffer[]>([])

  // مزامنة voiceNotesRef مع آخر قيمة
  useEffect(() => {
    voiceNotesRef.current = voiceNotes
  }, [voiceNotes])

  // تحميل الترجمات المحفوظة محلياً عند فتح الصفحة
  useEffect(() => {
    if (!user?.id || voiceNotes.length === 0) return

    let hasChanges = false

    // دمج الترجمات المحفوظة مع الملاحظات الصوتية
    const updatedNotes = voiceNotes.map(note => {
      // إذا كانت الترجمة موجودة بالفعل، لا داعي للتحميل من التخزين (لمنع التحديث المستمر)
      // إلا إذا كنا نريد فرض التحديث من التخزين، ولكن هنا نفترض أن الحالة الحالية هي الأحدث
      if (note.translatedText) return note

      // البحث عن ترجمة محفوظة في localStorage
      const storageKey = `yasmin_translation_${user.id}_${note.id}`
      const savedData = localStorage.getItem(storageKey)

      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData)
          // نتحقق مما إذا كانت الترجمة مختلفة عما هو موجود (أو الملاحظة لا تحتوي ترجمة)
          if (parsedData.translatedText && note.translatedText !== parsedData.translatedText) {
            hasChanges = true
            return {
              ...note,
              translatedText: parsedData.translatedText,
              translationLanguage: parsedData.targetLanguage
            }
          }
        } catch (e) {
          console.error('Error parsing saved translation:', e)
        }
      }
      return note
    })

    // تحديث الملاحظات فقط إذا تم العثور على ترجمات جديدة غير موجودة في الحالة الحالية
    if (hasChanges) {
      // استخدام setTimeout لتأخير التحديث قليلاً لتجنب تعارض التصيير المتزامن
      setTimeout(() => {
        onVoiceNotesChange(updatedNotes)
      }, 0)
    }
  }, [user?.id, voiceNotes]) // الاعتماد على voiceNotes لضمان التحديث عند وصول بيانات جديدة

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

  // إنشاء الملاحظة الصوتية عندما يكون الصوت والنص جاهزين
  const tryFinalizeNote = () => {
    const blob = currentBlobRef.current
    if (!blob) return
    if (!sonioxFinishedRef.current) return

    const finalText = finalTokensRef.current.join('')
    const noteId = recordingIdRef.current
    const duration = recordingDurationRef.current

    currentBlobRef.current = null
    finalTokensRef.current = []
    sonioxFinishedRef.current = false

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      const newNote: VoiceNote = {
        id: noteId,
        data: base64,
        timestamp: Date.now(),
        duration,
        transcription: finalText || undefined
      }
      onVoiceNotesChange([...voiceNotesRef.current, newNote])
      setLiveTranscription('')
    }
    reader.readAsDataURL(blob)
  }

  // بدء التسجيل مع Soniox real-time STT
  const startRecording = async () => {
    try {
      setError(null)
      setLiveTranscription('')
      setSonioxConnected(false)
      finalTokensRef.current = []
      audioQueueRef.current = []
      sonioxFinishedRef.current = false
      hasSonioxRef.current = false
      currentBlobRef.current = null
      recordingIdRef.current = Date.now().toString()

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

      // --- إعداد Soniox WebSocket للتحويل الفوري ---
      if (typeof window !== 'undefined' && !(window as any).Capacitor) {
        try {
          const tokenRes = await fetch('/api/soniox-token')
          if (tokenRes.ok) {
            const { apiKey } = await tokenRes.json()

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
            const audioCtx = new AudioContextClass()
            audioContextRef.current = audioCtx
            const sampleRate = audioCtx.sampleRate

            const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket')
            sonioxWsRef.current = ws

            ws.onopen = () => {
              ws.send(JSON.stringify({
                api_key: apiKey,
                model: 'stt-rt-v4',
                language_hints: ['ar'],
                audio_format: 'pcm_s16le',
                sample_rate: sampleRate,
                num_channels: 1,
                enable_endpoint_detection: true
              }))
              hasSonioxRef.current = true
              setSonioxConnected(true)
              // إرسال الصوت المخزن أثناء الاتصال
              const queued = audioQueueRef.current.splice(0)
              queued.forEach(chunk => ws.send(chunk))
            }

            ws.onmessage = (event) => {
              try {
                const res = JSON.parse(event.data as string)
                if (res.error_code) {
                  console.error('Soniox error:', res.error_code, res.error_message)
                  return
                }
                const nonFinalTexts: string[] = []
                for (const token of (res.tokens || [])) {
                  if (token.is_final) {
                    finalTokensRef.current.push(token.text)
                  } else {
                    nonFinalTexts.push(token.text)
                  }
                }
                setLiveTranscription(
                  finalTokensRef.current.join('') + nonFinalTexts.join('')
                )
                if (res.finished) {
                  sonioxFinishedRef.current = true
                  setSonioxConnected(false)
                  ws.close()
                  sonioxWsRef.current = null
                  tryFinalizeNote()
                }
              } catch (e) {
                console.error('Soniox parse error:', e)
              }
            }

            ws.onerror = () => {
              console.error('Soniox WebSocket error')
              setSonioxConnected(false)
              sonioxFinishedRef.current = true
              sonioxWsRef.current = null
              tryFinalizeNote()
            }

            ws.onclose = () => {
              setSonioxConnected(false)
              if (!sonioxFinishedRef.current) {
                sonioxFinishedRef.current = true
                sonioxWsRef.current = null
                tryFinalizeNote()
              }
            }

            // التقاط PCM وإرساله لـ Soniox - buffer صغير (1024) لزمن استجابة منخفض
            const source = audioCtx.createMediaStreamSource(stream)
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            const processor = audioCtx.createScriptProcessor(1024, 1, 1)
            scriptProcessorRef.current = processor
            source.connect(processor)
            processor.connect(audioCtx.destination)

            processor.onaudioprocess = (e) => {
              if (!sonioxWsRef.current) return
              const float32 = e.inputBuffer.getChannelData(0)
              const int16 = new Int16Array(float32.length)
              for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]))
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
              }
              const buffer = int16.buffer.slice(0)
              if (sonioxWsRef.current.readyState === WebSocket.OPEN) {
                sonioxWsRef.current.send(buffer)
              } else if (sonioxWsRef.current.readyState === WebSocket.CONNECTING) {
                // خزّن الصوت أثناء انتظار الاتصال
                audioQueueRef.current.push(buffer)
              }
            }
          }
        } catch (e) {
          console.error('Soniox setup failed:', e)
          // التسجيل يستمر بدون تحويل فوري
          sonioxFinishedRef.current = true
        }
      } else {
        // Capacitor: لا يوجد Soniox
        sonioxFinishedRef.current = true
      }

      // --- MediaRecorder لحفظ الصوت ---
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        currentBlobRef.current = blob
        stream.getTracks().forEach(track => track.stop())
        tryFinalizeNote()
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (error) {
      console.error('خطأ في بدء التسجيل:', error)
      setError('فشل الوصول إلى الميكروفون. يرجى التحقق من الأذونات في إعدادات التطبيق.')
    }
  }

  // إيقاف التسجيل وإشارة نهاية الصوت لـ Soniox
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      recordingDurationRef.current = recordingTime
      mediaRecorderRef.current.stop()
      setIsRecording(false)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    // تنظيف AudioContext
    scriptProcessorRef.current?.disconnect()
    scriptProcessorRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null

    // إشارة نهاية الصوت لـ Soniox
    if (hasSonioxRef.current && sonioxWsRef.current?.readyState === WebSocket.OPEN) {
      hasSonioxRef.current = false
      sonioxWsRef.current.send('') // Empty string = نهاية الصوت

      // Timeout احتياطي: 15 ثانية
      setTimeout(() => {
        if (!sonioxFinishedRef.current) {
          console.warn('Soniox timeout - finalizing without full transcription')
          sonioxFinishedRef.current = true
          sonioxWsRef.current?.close()
          sonioxWsRef.current = null
          tryFinalizeNote()
        }
      }, 15000)
    } else if (sonioxWsRef.current) {
      sonioxWsRef.current.close()
      sonioxWsRef.current = null
      sonioxFinishedRef.current = true
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

      // حفظ الترجمة في localStorage لكل مستخدم على حدة
      if (user?.id) {
        try {
          const storageKey = `yasmin_translation_${user.id}_${noteId}`
          const translationData = {
            translatedText: data.translatedText,
            targetLanguage: targetLanguage,
            timestamp: Date.now()
          }
          localStorage.setItem(storageKey, JSON.stringify(translationData))
        } catch (error) {
          console.error('Error saving translation to localStorage:', error)
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
                className="inline-flex items-center space-x-2 space-x-reverse mb-3"
              >
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-red-600 font-medium">جاري التسجيل...</span>
              </motion.div>

              <div className="text-2xl font-bold text-gray-800 mb-3">
                {formatTime(recordingTime)}
              </div>

              {/* النص الفوري من Soniox */}
              {sonioxConnected && (
                <div className="mb-3 mx-2 p-2 bg-green-50 border border-green-200 rounded-lg text-right min-h-[52px]">
                  <p className="text-xs text-green-600 font-medium mb-1 flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block"></span>
                    نص فوري
                  </p>
                  {liveTranscription ? (
                    <p className="text-sm text-gray-700 leading-relaxed">{liveTranscription}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">جاري الاستماع...</p>
                  )}
                </div>
              )}

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
