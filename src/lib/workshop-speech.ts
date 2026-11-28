export const workshopSpeechContext = {
  "general": [
    {
      "key": "domain",
      "value": "تفصيل فساتين نسائية وتعديلات البروفة في ورشة بالمنطقة الشرقية في السعودية"
    },
    {
      "key": "topic",
      "value": "قصّات الفستان، الأقمشة، موضع التعديل، والمقاسات"
    }
  ],
  "text": "يتحدث فريق الورشة بالعربية الخليجية أو الشامية، وأحيانًا بالهندية مع مصطلحات خياطة عربية وإنجليزية. تتضمن التعليمات موضع التعديل وجهته، ومقداره بالإنش أو السنتيمتر، وأحيانًا تشير إلى دبوس أو صورة. دوّن ما تسمعه بلغته، واحفظ النفي والكسور والتصحيحات كما قيلت.",
  "terms": [
    "لوح الظهر",
    "لوح الصدر",
    "دوران الأكتاف",
    "حفرة الجيرو",
    "الزند",
    "البنسات",
    "قصة الخصر",
    "الشيالات",
    "الأسوارة",
    "القبة",
    "حاشية",
    "شكّ بالخرز",
    "كسرات",
    "كلوش",
    "إيلاين",
    "جبونيز",
    "كورسيه",
    "تفتة ستريتش",
    "تفتة روسي",
    "جازار",
    "جورجيت",
    "شيفون",
    "كريب",
    "تول",
    "نص إنش",
    "إنش ونص",
    "على الدبوس"
  ]
}

// Keep the speaker's wording and existing line breaks. Only start another
// bullet at punctuation followed by a workshop action, never before a measure.
export function formatWorkshopInstructions(text: string): string {
  const lines = text.replace(/<end>/gi, '\n')
    .replace(/([،,.؛;])\s+(?=(?:و)?(?:تقصير|تطويل|تضييق|تضيق|توسيع|تركيب|تثبيت|تعديل|تخفيف|رفع|تنزيل|تغيير|زيادة|إلغاء|قص|فك|عمل)\s)/gu, '$1\n')
    .replace(/([^\n])\n+\s*((?:[\d٠-٩]+(?:[.,٫][\d٠-٩]+)?|نص|نصف|ربع)\s*(?:إنش|انش|سم|سنتيمتر)[.،]?)(?=\s*(?:\n|$))/gu, '$1 $2')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
  return lines.length > 1
    ? lines.map(line => line.startsWith('• ') ? line : `• ${line}`).join('\n')
    : lines.join('')
}
