'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Loader2, Trash2, Play, Pause, Languages, Pencil, Check, X } from 'lucide-react'
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
  appendTranscriptionToNotes?: boolean
  allowTranscriptionEditing?: boolean
}

export default function UnifiedNotesInput({
  notes,
  voiceNotes,
  onNotesChange,
  onVoiceNotesChange,
  disabled = false,
  placeholder = 'اكتب ملاحظاتك هنا أو اضغط على المايكروفون للتسجيل الصوتي...',
  appendTranscriptionToNotes = true,
  allowTranscriptionEditing = false
}: UnifiedNotesInputProps) {
  const { t, isArabic } = useTranslation()
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<string>('en')
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
  const [editingTranscriptionId, setEditingTranscriptionId] = useState<string | null>(null)
  const [transcriptionDraft, setTranscriptionDraft] = useState('')

  // Soniox real-time STT
  const [liveTranscription, setLiveTranscription] = useState('')
  const [sonioxConnected, setSonioxConnected] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRefsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const transcriptionTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Soniox refs
  const sonioxWsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const finalTokensRef = useRef<string[]>([])
  const currentBlobRef = useRef<Blob | null>(null)
  const sonioxFinishedRef = useRef<boolean>(false)
  const hasSonioxRef = useRef<boolean>(false)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const recordingIdRef = useRef<string>('')
  const recordingDurationRef = useRef<number>(0)
  const voiceNotesRef = useRef<VoiceNote[]>(voiceNotes)
  const notesRef = useRef<string>(notes)

  useEffect(() => { voiceNotesRef.current = voiceNotes }, [voiceNotes])
  useEffect(() => { notesRef.current = notes }, [notes])

  useLayoutEffect(() => {
    if (!editingTranscriptionId) return

    const textarea = transcriptionTextareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(textarea.scrollHeight, 192)}px`
  }, [editingTranscriptionId, transcriptionDraft])

  // قائمة اللغات المتاحة للترجمة
  const availableLanguages = [
    { code: 'en', name: 'English', nameAr: 'الإنجليزية' },
    { code: 'hi', name: 'Hindi', nameAr: 'الهندية' },
    { code: 'bn', name: 'Bengali', nameAr: 'البنغالية' },
    { code: 'ur', name: 'Urdu', nameAr: 'الأوردو' },
    { code: 'ar', name: 'Arabic', nameAr: 'العربية' }
  ]

  const getLanguageName = (code: string) => {
    const lang = availableLanguages.find(l => l.code === code)
    return lang ? lang.nameAr : code
  }

  const base64ToBlob = (base64: string): Blob => {
    const byteCharacters = atob(base64.split(',')[1])
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new Blob([byteArray], { type: 'audio/webm' })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // إنشاء الملاحظة الصوتية عندما يكون الصوت والنص جاهزين
  const tryFinalizeNote = () => {
    const blob = currentBlobRef.current
    if (!blob) return
    if (!sonioxFinishedRef.current) return

    const rawFinalText = finalTokensRef.current.join('')
    const finalText = rawFinalText.replace(/<end>/gi, '\n').replace(/\n{2,}/g, '\n').trim()
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
      const updated = [...voiceNotesRef.current, newNote]
      onVoiceNotesChange(updated)

      // بعض النماذج تعرض النص داخل التسجيل نفسه فقط لتجنب تكراره في الملاحظات.
      if (appendTranscriptionToNotes && finalText) {
        const current = notesRef.current
        onNotesChange(current ? `${current}\n\n${finalText}` : finalText)
      }

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
        } catch {
          setError('يرجى السماح بالوصول إلى الميكروفون من إعدادات التطبيق')
          return
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
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

            // التقاط PCM - buffer صغير (1024) لزمن استجابة منخفض
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
                audioQueueRef.current.push(buffer)
              }
            }
          }
        } catch (e) {
          console.error('Soniox setup failed:', e)
          sonioxFinishedRef.current = true
        }
      } else {
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
      setError('فشل الوصول إلى الميكروفون. يرجى التحقق من الأذونات.')
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

    scriptProcessorRef.current?.disconnect()
    scriptProcessorRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null

    if (hasSonioxRef.current && sonioxWsRef.current?.readyState === WebSocket.OPEN) {
      hasSonioxRef.current = false
      sonioxWsRef.current.send('')

      // Timeout احتياطي
      setTimeout(() => {
        if (!sonioxFinishedRef.current) {
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

    if (playingId && playingId !== voiceNote.id) {
      audioRefs.get(playingId)?.pause()
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
    if (playingId === noteId) setPlayingId(null)
    onVoiceNotesChange(voiceNotes.filter(note => note.id !== noteId))
  }

  const startEditingTranscription = (note: VoiceNote) => {
    setEditingTranscriptionId(note.id)
    setTranscriptionDraft(note.transcription || '')
  }

  const cancelEditingTranscription = () => {
    setEditingTranscriptionId(null)
    setTranscriptionDraft('')
  }

  const saveTranscription = (noteId: string) => {
    const transcription = transcriptionDraft.trim()
    if (!transcription) return

    const updatedNotes = voiceNotesRef.current.map(note =>
      note.id === noteId
        ? {
            ...note,
            transcription,
            // يجب إعادة الترجمة بعد تعديل النص الأصلي حتى لا تبقى ترجمة قديمة.
            translatedText: undefined,
            translationLanguage: undefined
          }
        : note
    )
    onVoiceNotesChange(updatedNotes)
    setEditingTranscriptionId(null)
    setTranscriptionDraft('')
  }

  // ترجمة النص باستخدام OpenRouter API
  const translateText = async (noteId: string, lang: string) => {
    try {
      setTranslatingId(noteId)
      setError(null)

      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        setTranslatingId(null)
        return
      }

      const note = voiceNotes.find(n => n.id === noteId)
      if (!note?.transcription) {
        setError('لا يوجد نص لترجمته')
        setTranslatingId(null)
        return
      }

      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: note.transcription, targetLanguage: lang })
      })

      if (!response.ok) throw new Error('Translation failed')
      const data = await response.json()

      onVoiceNotesChange(voiceNotes.map(n =>
        n.id === noteId ? { ...n, translatedText: data.translatedText, translationLanguage: lang } : n
      ))
      setTranslatingId(null)
    } catch {
      setError('فشلت عملية الترجمة')
      setTranslatingId(null)
    }
  }

  // ترجمة جميع النصوص
  const translateAllTexts = async () => {
    try {
      setError(null)

      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        setError('ميزة الترجمة غير متاحة في التطبيق المحمول حالياً')
        return
      }

      if (notes?.trim()) {
        setTranslatingId('main-notes')
        const response = await fetch('/api/translate-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: notes, targetLanguage })
        })
        if (response.ok) {
          const data = await response.json()
          const langName = getLanguageName(targetLanguage)
          onNotesChange(`${notes}\n\n--- الترجمة (${langName}) ---\n${data.translatedText}`)
        }
        setTranslatingId(null)
      }

      for (const note of voiceNotes.filter(n => n.transcription && !n.translatedText)) {
        await translateText(note.id, targetLanguage)
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch {
      setError('فشلت عملية الترجمة')
      setTranslatingId(null)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showLanguageDropdown && !(event.target as HTMLElement).closest('.language-dropdown-container')) {
        setShowLanguageDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showLanguageDropdown])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      audioRefsRef.current.forEach(audio => audio.pause())
      audioRefsRef.current.clear()
    }
  }, [])

  return (
    <div className="space-y-4">
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

      {/* حقل الملاحظات النصية */}
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

        {/* أيقونات المايكروفون والترجمة */}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
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

          <div className="relative language-dropdown-container">
            <button
              type="button"
              onClick={translateAllTexts}
              disabled={disabled || translatingId !== null || (!(notes || '').trim() && voiceNotes.filter(n => n.transcription).length === 0)}
              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              title={`ترجمة جميع النصوص إلى ${getLanguageName(targetLanguage)}`}
              onContextMenu={(e) => { e.preventDefault(); setShowLanguageDropdown(!showLanguageDropdown) }}
            >
              {translatingId ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              disabled={disabled}
              className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50"
              title="اختيار اللغة"
            >
              ▼
            </button>

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
                        onClick={() => { setTargetLanguage(lang.code); setShowLanguageDropdown(false) }}
                        className={`w-full px-4 py-2 text-right text-sm hover:bg-blue-50 transition-colors ${targetLanguage === lang.code ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}`}
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
              <span className="text-sm font-medium text-red-700">{formatTime(recordingTime)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* النص الفوري من Soniox أثناء التسجيل */}
      <AnimatePresence>
        {sonioxConnected && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="p-3 bg-green-50 border border-green-200 rounded-lg text-right"
          >
            <p className="text-xs text-green-600 font-medium mb-1 flex items-center gap-1 justify-end">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block"></span>
              نص فوري
            </p>
            {liveTranscription ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{liveTranscription.replace(/<end>/gi, '\n')}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">جاري الاستماع...</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة التسجيلات الصوتية المحفوظة */}
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
            <div className={`space-y-3 overflow-x-visible ${editingTranscriptionId ? 'overflow-y-visible' : 'max-h-[500px] overflow-y-auto'}`}>
              {voiceNotes.map((note, index) => (
                <div key={note.id} className="bg-white rounded-lg p-3 border border-gray-200 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2 relative">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <span className="text-base text-pink-600 font-bold flex-shrink-0 mt-0.5">
                        {index + 1}.
                      </span>
                      {note.transcription && editingTranscriptionId !== note.id && (
                        <p className="text-sm text-gray-700 leading-relaxed break-words">
                          {note.transcription.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && <br />}{line.trim()}</span>))}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => togglePlayback(note)}
                        className={`p-1.5 rounded transition-colors ${playingId === note.id ? 'bg-green-500 text-white' : 'text-green-600 hover:bg-green-50'}`}
                        title={playingId === note.id ? 'إيقاف' : 'تشغيل الصوت'}
                      >
                        {playingId === note.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>

                      {allowTranscriptionEditing && note.transcription && editingTranscriptionId !== note.id && (
                        <button
                          type="button"
                          onClick={() => startEditingTranscription(note)}
                          disabled={disabled}
                          className="p-1.5 text-pink-600 hover:bg-pink-50 rounded transition-colors disabled:opacity-50"
                          title={t('edit_transcription')}
                          aria-label={`${t('edit_transcription')} ${index + 1}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {note.transcription && !note.translatedText && editingTranscriptionId !== note.id && (
                        <button
                          type="button"
                          onClick={() => translateText(note.id, targetLanguage)}
                          disabled={disabled || translatingId === note.id}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                          title={`ترجمة إلى ${getLanguageName(targetLanguage)}`}
                        >
                          {translatingId === note.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Languages className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteVoiceNote(note.id)}
                        disabled={disabled}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {editingTranscriptionId === note.id && (
                    <div
                      className="space-y-3 rounded-xl border border-pink-200 bg-pink-50/50 p-3 sm:p-4"
                      dir={isArabic ? 'rtl' : 'ltr'}
                    >
                      <div>
                        <label
                          htmlFor={`voice-transcription-${note.id}`}
                          className="flex items-center gap-2 text-sm font-semibold text-gray-800"
                        >
                          <Pencil className="h-4 w-4 text-pink-600" />
                          {t('edit_transcription')}
                        </label>
                        <p id={`voice-transcription-help-${note.id}`} className="mt-1 text-xs leading-5 text-gray-500">
                          {isArabic
                            ? 'النص كامل أمامك، وسيزداد ارتفاع الحقل تلقائيًا أثناء التعديل.'
                            : 'The full text is visible, and the field grows automatically while you edit.'}
                        </p>
                      </div>

                      <textarea
                        ref={transcriptionTextareaRef}
                        id={`voice-transcription-${note.id}`}
                        aria-describedby={`voice-transcription-help-${note.id}`}
                        value={transcriptionDraft}
                        onChange={(event) => setTranscriptionDraft(event.target.value)}
                        rows={8}
                        dir="auto"
                        autoFocus
                        disabled={disabled}
                        className="block min-h-48 w-full resize-none overflow-y-hidden rounded-xl border border-pink-300 bg-white px-4 py-3 text-base leading-7 text-gray-900 shadow-sm outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200 disabled:cursor-not-allowed disabled:opacity-60"
                      />

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEditingTranscription}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                        >
                          <X className="h-4 w-4" />
                          {t('cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveTranscription(note.id)}
                          disabled={disabled || !transcriptionDraft.trim()}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          {t('save')}
                        </button>
                      </div>
                    </div>
                  )}

                  {note.transcription && editingTranscriptionId !== note.id ? (
                    note.translatedText && (
                      <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-2">
                        <p className="text-xs text-purple-600 font-medium mb-0.5 flex items-center gap-1">
                          <Languages className="w-3 h-3" />
                          الترجمة ({getLanguageName(note.translationLanguage || 'en')})
                        </p>
                        <p className="text-sm text-gray-600">{note.translatedText.split(/<end>|\n/gi).filter(s => s.trim()).map((line, i) => (<span key={i}>{i > 0 && <br />}{line.trim()}</span>))}</p>
                      </div>
                    )
                  ) : editingTranscriptionId !== note.id ? (
                    <p className="text-sm text-gray-500 mr-6">
                      {isArabic ? 'تسجيل صوتي - في انتظار التحويل إلى نص...' : 'Voice recording — waiting for transcription...'}
                    </p>
                  ) : (
                    null
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
