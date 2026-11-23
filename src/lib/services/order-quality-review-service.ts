import { ensureValidSession, isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  OrderQualityReview,
  OrderQualityReviewStage,
  SubmitOrderQualityReviewInput,
} from '@/types/order-quality-review'

const REVIEW_SELECT = `
  id,
  order_id,
  stage,
  attempt_number,
  status,
  measurement_checks,
  design_matches,
  previous_alterations_applied,
  reviewed_alterations,
  discrepancy_text,
  voice_notes,
  reviewed_by,
  created_at,
  reviewer:users!order_quality_review_attempts_reviewed_by_fkey(full_name)
`

function normalizeReview(data: unknown): OrderQualityReview {
  const review = data as Omit<OrderQualityReview, 'reviewer'> & {
    reviewer?: OrderQualityReview['reviewer'] | Array<NonNullable<OrderQualityReview['reviewer']>>
  }
  return {
    ...review,
    // الأعمدة أُضيفت في migration 20260906120000؛ نضمن القيم الافتراضية للسجلات الأقدم.
    previous_alterations_applied: review.previous_alterations_applied ?? null,
    reviewed_alterations: Array.isArray(review.reviewed_alterations) ? review.reviewed_alterations : [],
    reviewer: Array.isArray(review.reviewer) ? (review.reviewer[0] || null) : (review.reviewer || null),
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

/** ملخص محاولة مراجعة بلا تفاصيل (بلا مقاسات ولا تسجيلات صوتية). */
export interface QualityReviewAttemptSummary {
  order_id: string
  stage: OrderQualityReviewStage
  attempt_number: number
  status: 'passed' | 'failed'
  /** يصل فقط مع includeCreatedAt. */
  created_at?: string
}

export const orderQualityReviewService = {
  /**
   * محاولات المراجعة لمجموعة طلبات بأعمدة خفيفة — لعرض «النجاح من أول مراجعة» في متابعة العمال.
   */
  async getAttemptSummariesForOrders(
    orderIds: string[],
    options: { includeCreatedAt?: boolean } = {}
  ): Promise<{ data: QualityReviewAttemptSummary[]; error: string | null }> {
    if (!isSupabaseConfigured()) {
      return { data: [], error: 'Supabase is not configured.' }
    }
    const ids = [...new Set(orderIds.filter(Boolean))]
    if (ids.length === 0) return { data: [], error: null }

    const CHUNK = 100
    const rows: QualityReviewAttemptSummary[] = []
    try {
      for (let index = 0; index < ids.length; index += CHUNK) {
        const { data, error } = await supabase
          .from('order_quality_review_attempts')
          .select(`order_id,stage,attempt_number,status${options.includeCreatedAt ? ',created_at' : ''}`)
          .in('order_id', ids.slice(index, index + CHUNK))
          .range(0, 999)
        if (error) throw error
        rows.push(...((data || []) as unknown as QualityReviewAttemptSummary[]))
      }
      return { data: rows, error: null }
    } catch (error: unknown) {
      return { data: [], error: getErrorMessage(error, 'تعذّر تحميل مراجعات الجودة') }
    }
  },

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
        .select(REVIEW_SELECT)
        .eq('order_id', orderId)
        .eq('stage', stage)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return { data: data ? normalizeReview(data) : null, error: null }
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
          previous_alterations_applied: input.previousAlterationsApplied ?? null,
          reviewed_alterations: input.reviewedAlterations || [],
          discrepancy_text: input.discrepancyText?.trim() || null,
          voice_notes: input.voiceNotes || [],
        })
        .select(REVIEW_SELECT)
        .single()

      if (error) throw error
      return { data: normalizeReview(data), error: null }
    } catch (error: unknown) {
      return {
        data: null,
        error: getErrorMessage(error, 'تعذّر حفظ المراجعة'),
      }
    }
  },
}
