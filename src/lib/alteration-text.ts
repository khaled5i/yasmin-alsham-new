/**
 * نص التعديل كما سُجّل — مصدر واحد لكل من العرض على الشاشة والطباعة الحرارية.
 * الوصف والملاحظات وتفريغ الملاحظات الصوتية تُجمع بالترتيب نفسه ودون تكرار،
 * حتى تطابق ورقة الورشة ما يراه المدير في صفحة الطلب حرفيًا.
 */

export interface AlterationTextSource {
  description?: string | null
  notes?: string | null
  voice_transcriptions?: Array<{ transcription?: string | null } | null> | null
}

function normalizeAlterationText(value: string): string {
  return value
    .replace(/<end>/gi, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

export function getAlterationText(alteration: AlterationTextSource): string {
  const textParts: string[] = []

  const addUniqueText = (value?: string | null) => {
    const text = value?.replace(/<end>/gi, '\n').trim()
    if (!text) return

    const normalizedText = normalizeAlterationText(text)
    const alreadyIncluded = textParts.some(existingText => {
      const normalizedExistingText = normalizeAlterationText(existingText)
      return normalizedExistingText === normalizedText
        || normalizedExistingText.includes(normalizedText)
    })

    if (alreadyIncluded) return

    // إذا كان النص الجديد نسخة أكمل من جزء سابق، نحتفظ بالأكمل بدل عرضهما معًا.
    for (let index = textParts.length - 1; index >= 0; index -= 1) {
      if (normalizedText.includes(normalizeAlterationText(textParts[index]))) {
        textParts.splice(index, 1)
      }
    }

    textParts.push(text)
  }

  addUniqueText(alteration.notes)
  addUniqueText(alteration.description)

  if (Array.isArray(alteration.voice_transcriptions)) {
    alteration.voice_transcriptions.forEach(note => addUniqueText(note?.transcription))
  }

  return textParts.join('\n\n')
}
