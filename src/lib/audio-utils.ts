// أدوات الصوت المشتركة للتسجيل والتحويل إلى نص.
// مستخرجة من InteractiveImageAnnotation لإعادة الاستخدام في DesignSummaryRecorder.

// تحويل تسجيل المتصفح (webm/opus أو mp4) إلى WAV نظيف (PCM 16-bit).
// السبب: تسجيلات MediaRecorder تأتي بلا بيانات مدّة/فهرسة، فيتوقّف معالج Soniox async
// عندها (Transcription timed out). المتصفح يفك ترميز تسجيله الخاص بسهولة، وWAV مدعوم بثبات.
export async function recordingBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  const ctx = new AudioCtx()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const numCh = audioBuffer.numberOfChannels
    const len = audioBuffer.length
    const sampleRate = audioBuffer.sampleRate

    // مزج كل القنوات إلى قناة واحدة (mono)
    const mono = new Float32Array(len)
    for (let ch = 0; ch < numCh; ch++) {
      const data = audioBuffer.getChannelData(ch)
      for (let i = 0; i < len; i++) mono[i] += data[i] / numCh
    }

    // ترميز WAV (PCM 16-bit, mono)
    const out = new ArrayBuffer(44 + len * 2)
    const view = new DataView(out)
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + len * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)        // حجم كتلة fmt
    view.setUint16(20, 1, true)         // PCM
    view.setUint16(22, 1, true)         // قناة واحدة
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate (sampleRate * channels * 2)
    view.setUint16(32, 2, true)         // block align
    view.setUint16(34, 16, true)        // bits per sample
    writeStr(36, 'data')
    view.setUint32(40, len * 2, true)
    let offset = 44
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, mono[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
    return new Blob([out], { type: 'audio/wav' })
  } finally {
    ctx.close().catch(() => {})
  }
}

// اختيار أول نوع MIME مدعوم للتسجيل في هذا المتصفح.
export function pickSupportedMimeType(): string {
  const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/wav']
  for (const mimeType of mimeTypes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  return 'audio/webm'
}

// تنظيف نص Soniox: تحويل <end> إلى أسطر ودمج الأسطر الفارغة المتكررة.
export function cleanTranscriptText(t: string): string {
  return t.replace(/<end>/gi, '\n').replace(/\n{2,}/g, '\n').trim()
}
