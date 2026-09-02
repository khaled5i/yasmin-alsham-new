/**
 * تجهيز ورقة التعديل وإرسالها إلى محطة الورشة.
 *
 * الترتيب مقصود: نجلب السجل كاملًا أولًا لأن قوائم التعديلات المخففة لا تحمل
 * voice_transcriptions، فالطباعة منها تُخرج ورقة ناقصة. ثم نحسم النسخة الهندية
 * (محفوظة أو مترجمة الآن) قبل وضع المهمة في الطابور، حتى تصل الورقتان معًا
 * في مهمة واحدة لا تنقسم.
 */

import { alterationService } from './alteration-service'
import { getAlterationText } from '@/lib/alteration-text'
import { buildAlterationSlipPayload } from '@/lib/print-alteration-slip'
import { enqueueAlterationSlipPrint } from './alteration-print-job-service'

export interface AlterationSlipPrintResult {
  jobId: string
  /** صحيح عندما تعذّرت الترجمة، فتُطبع الورقة العربية وحدها. */
  hindiMissing: boolean
}

async function translateToHindi(sourceText: string): Promise<string> {
  const response = await fetch('/api/translate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sourceText, targetLanguage: 'hi' }),
  })

  if (!response.ok) throw new Error('Translation request failed')

  const data = await response.json()
  const translatedText = String(data.translatedText || '').trim()
  if (!translatedText) throw new Error('Translation is empty')

  return translatedText
}

/**
 * يستعمل الترجمة المحفوظة إذا كانت مبنية على النص نفسه، وإلا يترجم ويحفظ.
 * فشل الترجمة لا يمنع الطباعة؛ تخرج الورقة العربية ويُبلَّغ المستدعي.
 */
async function resolveHindiContent(
  alterationId: string,
  sourceText: string
): Promise<string> {
  if (!sourceText) return ''

  const { data: stored } = await alterationService.getHindiTranslation(alterationId)
  if (stored?.source_text === sourceText && stored.translated_text?.trim()) {
    return stored.translated_text.trim()
  }

  try {
    const translatedText = await translateToHindi(sourceText)
    // الحفظ أفضل جهد: الورقة تُطبع حتى لو تعذّر تخزين الترجمة للمرة القادمة.
    await alterationService.saveHindiTranslation(alterationId, sourceText, translatedText)
    return translatedText
  } catch (error) {
    console.error('Alteration slip Hindi translation failed:', error)
    return ''
  }
}

export async function printAlterationSlip(
  alterationId: string
): Promise<AlterationSlipPrintResult> {
  const { data: alteration, error } = await alterationService.getById(alterationId)
  if (error) throw new Error(error)
  if (!alteration) throw new Error('تعذّر العثور على طلب التعديل.')

  const sourceText = getAlterationText(alteration)
  if (!sourceText) {
    throw new Error('لا يوجد محتوى مسجّل لهذا التعديل، فلا شيء لطباعته.')
  }

  const hindiContent = await resolveHindiContent(alterationId, sourceText)
  const payload = buildAlterationSlipPayload(alteration, hindiContent)
  const queued = await enqueueAlterationSlipPrint(payload)

  return { jobId: queued.job_id, hindiMissing: hindiContent.length === 0 }
}
