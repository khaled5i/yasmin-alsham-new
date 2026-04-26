import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// استخدام مفتاح OpenAI من متغيرات البيئة
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
})

/**
 * 🎙️ نموذج تحويل الصوت إلى نص المستخدم
 *
 * النموذج الحالي: gpt-4o-transcribe
 * - نموذج متقدم من OpenAI لتحويل الصوت إلى نص
 * - يجمع بين قدرات GPT-4o وتقنيات Whisper المتطورة
 * - أداء محسّن ودقة أعلى
 *
 * النماذج المتاحة عبر OpenAI Audio Transcription API:
 * - 'gpt-4o-transcribe': النموذج الأحدث والأكثر تطوراً ⭐ (مستخدم حالياً)
 * - 'whisper-1': النموذج الأساسي (Large-v2) - دقة عالية، سرعة متوسطة
 *
 * المميزات الحالية لـ gpt-4o-transcribe:
 * ✅ دقة محسّنة للعربية الفصحى
 * ✅ يدعم 99+ لغة
 * ✅ أداء أفضل في فهم السياق
 * ✅ معالجة متقدمة للصوت
 * ⚠️ اللهجات العامية: قد يكون أفضل من whisper-1 لكن لا يزال محدوداً
 */
const WHISPER_MODEL = 'gpt-4o-transcribe'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const language = formData.get('language') as string || 'ar'

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // تحويل الملف إلى Buffer ثم إلى File object
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // إنشاء File object جديد من Buffer
    const file = new File([buffer], audioFile.name || 'audio.webm', {
      type: audioFile.type || 'audio/webm'
    })

    // استخدام OpenAI Audio Transcription API لتحويل الصوت إلى نص
    // النموذج المستخدم: gpt-4o-transcribe (أحدث نموذج متاح)
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: WHISPER_MODEL,
      language: language,
      response_format: 'json'
    })

    // تنظيف نص التحويل من علامات <end> والأرقام التي يضيفها النموذج
    const cleanedText = transcription.text
      .replace(/<end>/gi, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim()

    return NextResponse.json({
      text: cleanedText,
      language: language,
      success: true
    })

  } catch (error) {
    console.error('Transcription error:', error)

    // معالجة أخطاء OpenAI بشكل أفضل
    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: 'Failed to transcribe audio',
          message: error.message,
          details: error.toString()
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to transcribe audio', message: 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * 📝 ملاحظات حول نموذج التحويل الصوتي:
 *
 * تاريخ آخر تحديث: يناير 2026
 *
 * النموذج الحالي: gpt-4o-transcribe ⭐
 * - نموذج متقدم يجمع بين GPT-4o وتقنيات Whisper
 * - دقة محسّنة للعربية الفصحى
 * - أداء أفضل في فهم السياق والمعاني
 * - معالجة متقدمة للصوت
 *
 * النماذج البديلة المتاحة:
 * - whisper-1: النموذج الأساسي (Large-v2)
 * - whisper-turbo: قد يتوفر مستقبلاً (أسرع 8x)
 * - whisper-large-v3-turbo: قد يتوفر مستقبلاً
 *
 * للتبديل بين النماذج:
 * 1. قم بتحديث قيمة WHISPER_MODEL في السطر 28
 * 2. اختبر الأداء والدقة
 * 3. راقب التكلفة (قد تختلف بين النماذج)
 * 4. تحقق من وثائق OpenAI للنماذج المتاحة
 *
 * المميزات الحالية لـ gpt-4o-transcribe:
 * ✅ دقة عالية جداً للعربية الفصحى
 * ✅ فهم أفضل للسياق
 * ✅ معالجة متقدمة للصوت
 * ⚠️ اللهجات العامية: أداء محسّن لكن لا يزال محدوداً
 *
 * القيود العامة:
 * ⚠️ جميع نماذج التحويل الصوتي تواجه صعوبة مع اللهجات العامية
 * ⚠️ الدقة قد تنخفض للهجات المحلية (حسب اللهجة)
 * ✅ الأداء الأفضل يكون مع العربية الفصحى
 */
