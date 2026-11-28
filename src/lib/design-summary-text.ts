import type { Order } from '@/lib/services/order-service'

interface SummaryText {
  transcription?: string
  sourceTranscription?: string
  translatedText?: string
  translationLanguage?: string
}

// Older notes only have the raw transcription. During refinement the raw
// text and source may also be identical until the translated pair arrives.
export function hasRefinedSummary(note: SummaryText): boolean {
  return Boolean(note.transcription?.trim() && note.sourceTranscription &&
    (note.transcription !== note.sourceTranscription || note.translatedText?.trim()))
}

export function savedHindiSummary(note: SummaryText): string | undefined {
  return note.translationLanguage === 'hi' ? note.translatedText?.trim() || undefined : undefined
}

export function originalSummary(note: SummaryText): string {
  return note.sourceTranscription?.trim() || note.transcription?.trim() || ''
}

export function printableSummaryNotes(order: Order): NonNullable<Order['design_summary_notes']> {
  const notes = order.design_summary_notes?.length
    ? order.design_summary_notes
    : order.measurements?.design_summary_notes
  return Array.isArray(notes) ? notes.filter(note => note && originalSummary(note)) : []
}
