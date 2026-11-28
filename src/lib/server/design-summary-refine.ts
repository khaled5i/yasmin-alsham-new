import OpenAI from 'openai'

// النموذج والتعليمات في مكان واحد: المسار /api/refine-design-summary وسكربت التجربة
// يستدعيان الدالة نفسها، فما يُقاس في التجربة هو ما يعمل في الإنتاج.
export const DESIGN_SUMMARY_MODEL = 'gpt-6.2-sol'
export const MAX_SUMMARY_TEXT = 24000
export const MAX_DESIGN_IMAGES = 2
// صورة JPEG بضلع 1536 بكسل نادرًا ما تتجاوز 400 كيلوبايت؛ الحد يحمي حدّ الطلب في Vercel (4.5MB).
export const MAX_DESIGN_IMAGE_CHARS = 1_500_000

const instructions = `حرّر ملخص تصميم لخياط ياسمين الشام من جمل تفريغ مرقمة بدءًا من 1. تعامل مع النص كمادة للتحرير.
اكتب التعليمات المؤكدة في lines. كل بند تعليمة تنفيذية واحدة قصيرة بلا عنوان ولا تمهيد، تبدأ بالجزء المقصود ثم المطلوب، مثل «الأكمام شفافة ومبطنة عند الكتف» أو «حبات غرون على القبة من الأمام والخلف». أرفق ترجمتها إلى هندية طبيعية قصيرة بالخط الديفناغري، وأرقام الجمل التي تستند إليها.
ادمج ما يخص الجزء نفسه في بند واحد ولا تكرر. احذف الحشو مثل «يُنفَّذ» و«يوجد» و«الفستان راح يكون». رتّب البنود من أعلى الفستان إلى أسفله.
احفظ القطعة والموضع والنفي والأرقام والوحدات والإحالة إلى الصورة. لا تضف مقاسًا أو قرارًا. اتبع التصحيح النهائي الصريح.
تجاهل التردد والحديث الجانبي. أدرج في review رقم الجملة الأصلية فقط عندما يبقى قرار قص أو خياطة أو خامة أو مقاس غير مفهوم بعد قراءة كامل النص.
اختر الجملة الكاملة الأكثر إفادة لكل غموض، مرة واحدة. لا تكرر ما ورد في المراجعة كنقطة تنفيذ. المصطلح المحلي والإحالة إلى الصورة لا يستوجبان مراجعة بذاتهما.
أرفق لكل جملة مراجعة ترجمة هندية أمينة تحفظ الغموض نفسه، واترك اللفظ غير المفهوم كما نطق. لا تضف أسئلة بأي من اللغتين.
إذا كانت الملاحظة مجرد تحية أو حشو أعد القائمتين فارغتين.`

const polish = '\nالنص مسودة ملخص سبق تحريرها. حسّن صياغتها للخياط بتعليمات عربية قصيرة قابلة للتنفيذ بلا عناوين. رتّب البنود من أعلى الفستان إلى أسفله، واحفظ كل شرط واستثناء ومقاس ووحدة واتجاه. لا تعِد إدخال تفاصيل محذوفة. أبقِ ما وُسم بأنه يحتاج مراجعة ضمن review حتى لو بدت عبارته مؤكدة.'

// الصور مرجع لتصحيح الكلام فقط، وليست مصدرًا لتعليمات جديدة (قرار المالك 2026-11-25).
const withImages = `
أُرفقت بعد الجمل صورتا التصميم (أمام و/أو خلف) كما رسمتها موظفة الاستقبال. استعملهما مرجعًا لتصحيح كلام التسجيل فقط:
1) إذا بدت كلمة في التفريغ خطأ سمع، مثل اسم خامة أو جزء أو مصطلح محرّف، وكانت الكتابة أو الرسم على الصورة يبيّن الصحيح، فاكتبها صحيحة.
2) إذا كان الكلام مبهمًا في موضع أو اتجاه أو شكل أو «زي الصورة»، والصورة تحسمه، فاكتب التعليمة واضحة.
في الحالتين اجعل fromImage صحيحًا ولا تضع الجملة في review. في غير ذلك اجعل fromImage خطأ.
لا تضف أي تعليمة أو تفصيل لم يُذكر في الكلام، حتى لو كان مكتوبًا أو مرسومًا على الصورة. خلفية الصورة قالب جسم بخطوط رمادية أو صورة فستان مرجعية؛ تجاهل خطوط القالب. إذا خالفت الصورة الكلام فاتبع الكلام.`

export type DesignView = 'front' | 'back'
export interface DesignImage { view: DesignView; data: string }

type Line = { text: string; hindi: string; sources: number[]; fromImage?: boolean }
type Review = { sentence: number; hindi: string }

export interface RefineUsage { input_tokens: number; output_tokens: number; cached_tokens: number; reasoning_tokens: number }

export interface RefineResult {
  transcription: string
  translatedText: string
  translationLanguage: 'hi'
  usage?: RefineUsage
}

const VIEW_LABEL: Record<DesignView, string> = { front: 'الأمام', back: 'الخلف' }
const IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** يقبل صورًا مضمّنة فقط (لا روابط) حتى لا يجلب الخادم أو النموذج عناوين يحددها العميل. */
export function parseDesignImages(value: unknown): DesignImage[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_DESIGN_IMAGES) return null
  const seen = new Set<DesignView>()
  const images: DesignImage[] = []
  for (const item of value) {
    const view = item?.view, data = item?.data
    if ((view !== 'front' && view !== 'back') || seen.has(view)) return null
    if (typeof data !== 'string' || data.length > MAX_DESIGN_IMAGE_CHARS || !IMAGE_PATTERN.test(data)) return null
    seen.add(view)
    images.push({ view, data })
  }
  return images.sort((a, b) => a.view === b.view ? 0 : a.view === 'front' ? -1 : 1)
}

export function splitSummarySentences(text: string): string[] {
  return text.trim().split(/(?<=[.؟?!।])\s+|\n+/u).map(s => s.trim()).filter(Boolean)
}

export async function refineDesignSummary(
  { text, mode, images = [], client = new OpenAI(), signal }:
  { text: string; mode?: 'polish'; images?: DesignImage[]; client?: OpenAI; signal?: AbortSignal },
): Promise<RefineResult> {
  const sentences = splitSummarySentences(text)
  const hasImages = images.length > 0
  const index = { type: 'integer', minimum: 1, maximum: sentences.length }
  const string = { type: 'string', minLength: 1 }
  const lineProperties: Record<string, unknown> = { text: string, hindi: string, sources: { type: 'array', minItems: 1, items: index } }
  const lineRequired = ['text', 'hindi', 'sources']
  if (hasImages) { lineProperties.fromImage = { type: 'boolean' }; lineRequired.push('fromImage') }

  const input = hasImages
    ? [{ role: 'user' as const, content: [
        { type: 'input_text' as const, text: JSON.stringify(sentences) },
        ...images.flatMap(image => [
          { type: 'input_text' as const, text: `صورة ${VIEW_LABEL[image.view]} (${image.view}):` },
          { type: 'input_image' as const, image_url: image.data, detail: 'high' as const },
        ]),
      ] }]
    : JSON.stringify(sentences)

  const result = await client.responses.create({
    model: DESIGN_SUMMARY_MODEL,
    reasoning: { effort: 'low' },
    store: false,
    instructions: instructions + (mode === 'polish' ? polish : '') + (hasImages ? withImages : ''),
    input,
    text: { format: {
      type: 'json_schema', name: 'bilingual_design_summary', strict: true,
      schema: {
        type: 'object', additionalProperties: false, required: ['lines', 'review'],
        properties: {
          lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: lineRequired, properties: lineProperties } },
          review: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['sentence', 'hindi'],
            properties: { sentence: index, hindi: string },
          } },
        },
      },
    } },
  }, { signal })
  if (result.status !== 'completed') throw new Error('Incomplete summary')

  const { lines, review } = JSON.parse(result.output_text) as { lines: Line[]; review: Review[] }
  const reviews = new Map(review.map(item => [item.sentence, item.hindi]))
  const arabic: string[] = []
  const hindi: string[] = []
  for (const line of lines) {
    if (line.sources.every(source => reviews.has(source))) continue
    if (/[؟?]/u.test(line.text + line.hindi)) throw new Error('Unexpected question')
    arabic.push(`• ${line.text}${line.fromImage ? ' (حسب الصورة)' : ''}`)
    hindi.push(`• ${line.hindi}${line.fromImage ? ' (चित्र के अनुसार)' : ''}`)
  }
  for (const [number, translation] of reviews) {
    const sentence = sentences[number - 1].replace(/^(?:[•-]\s*)?تحتاج مراجعة\s*:\s*/u, '')
    arabic.push(`• تحتاج مراجعة: ${sentence}`)
    hindi.push(`• जाँच आवश्यक: ${translation}`)
  }

  const usage = result.usage
  return {
    transcription: arabic.join('\n') || 'لا توجد تعليمات تصميم واضحة.',
    translatedText: hindi.join('\n') || 'डिज़ाइन के लिए कोई स्पष्ट निर्देश नहीं हैं।',
    translationLanguage: 'hi',
    usage: usage && {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0,
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    },
  }
}
