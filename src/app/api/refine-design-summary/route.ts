import { NextRequest, NextResponse } from 'next/server'
import { requirePaidStaff } from '@/lib/server/staff-ai-access'
import { MAX_SUMMARY_TEXT, parseDesignImages, refineDesignSummary } from '@/lib/server/design-summary-refine'

export async function POST(request: NextRequest) {
  const access = await requirePaidStaff(request, 'translate-text')
  if (!access.ok) return access.response

  const input = await request.json().catch(() => null)
  if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > MAX_SUMMARY_TEXT) {
    return NextResponse.json({ error: 'نص ملخص التصميم فارغ أو طويل جدًا' }, { status: 400 })
  }
  // صور الأمام والخلف اختيارية: تحسم التباس الكلام وتُستخرج منها تعليمات في قسم مستقل.
  const images = parseDesignImages(input.images)
  if (!images) return NextResponse.json({ error: 'صور التصميم غير صالحة' }, { status: 400 })

  try {
    const result = await refineDesignSummary({
      text: input.text,
      mode: input.mode === 'polish' ? 'polish' : undefined,
      images,
      signal: request.signal,
    })
    return NextResponse.json({ ...result, usage: undefined })
  } catch {
    return NextResponse.json({ error: 'تعذّر تنقيح ملخص التصميم وترجمته' }, { status: 502 })
  }
}
