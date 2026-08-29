import { ensureValidSession, isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  OrderQualityReview,
  OrderQualityReviewStage,
  SubmitOrderQualityReviewInput,
} from '@/types/order-quality-review'

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

export const orderQualityReviewService = {
  async getLatestReview(
    orderId: string,
    stage: OrderQualityReviewStage
  ): Promise<{ data: OrderQualityReview | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      await ensureValidSession()
      const { data, error } = await supabase
        .from('order_quality_review_attempts')
        .select(
          'id, order_id, stage, attempt_number, status, measurement_checks, design_matches, discrepancy_text, voice_notes, reviewed_by, created_at'
        )
        .eq('order_id', orderId)
        .eq('stage', stage)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return { data: (data as OrderQualityReview | null) ?? null, error: null }
    } catch (error: unknown) {
      return {
        data: null,
        error: getErrorMessage(error, 'تعذّر تحميل ملخص المراجعة'),
      }
    }
  },

  async submitReview(
    input: SubmitOrderQualityReviewInput
  ): Promise<{ data: OrderQualityReview | null; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: null, error: 'Supabase is not configured.' }
    }

    try {
      await ensureValidSession()
      const { data, error } = await supabase
        .from('order_quality_review_attempts')
        .insert({
          order_id: input.orderId,
          stage: input.stage,
          measurement_checks: input.measurementChecks,
          design_matches: input.designMatches,
          discrepancy_text: input.discrepancyText?.trim() || null,
          voice_notes: input.voiceNotes || [],
        })
        .select(
          'id, order_id, stage, attempt_number, status, measurement_checks, design_matches, discrepancy_text, voice_notes, reviewed_by, created_at'
        )
        .single()

      if (error) throw error
      return { data: data as OrderQualityReview, error: null }
    } catch (error: unknown) {
      return {
        data: null,
        error: getErrorMessage(error, 'تعذّر حفظ المراجعة'),
      }
    }
  },
}
