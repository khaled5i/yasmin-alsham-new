import type { DesignSummaryNote } from '@/types/design-comments'

export type OrderQualityReviewStage = 'first_proof' | 'second_proof' | 'final_dress' | 'post_delivery'

export type OrderQualityReviewStatus = 'pending' | 'passed' | 'failed'

export interface OrderQualityMeasurementCheck {
  key: string
  label_ar: string
  label_en: string
  expected_value: string
  matched: boolean
}

export type OrderQualityReviewVoiceNote = DesignSummaryNote

/** لقطة عن تعديل عُرض داخل الاختبار للتأكد من تطبيقه، تُحفظ مع المحاولة. */
export interface OrderQualityReviewedAlteration {
  id: string
  alteration_number: string
  alteration_type: 'first_proof' | 'second_proof' | 'after_delivery'
  text: string
}

export interface OrderQualityReview {
  id: string
  order_id: string
  stage: OrderQualityReviewStage
  attempt_number: number
  status: Exclude<OrderQualityReviewStatus, 'pending'>
  measurement_checks: OrderQualityMeasurementCheck[]
  design_matches: boolean
  /** null عندما لا توجد تعديلات سابقة يجب التأكد من تطبيقها في هذه المرحلة. */
  previous_alterations_applied: boolean | null
  reviewed_alterations: OrderQualityReviewedAlteration[]
  discrepancy_text: string | null
  voice_notes: OrderQualityReviewVoiceNote[]
  reviewed_by: string
  reviewer?: {
    full_name: string | null
  } | null
  created_at: string
}

export interface SubmitOrderQualityReviewInput {
  orderId: string
  stage: OrderQualityReviewStage
  measurementChecks: OrderQualityMeasurementCheck[]
  designMatches: boolean
  previousAlterationsApplied?: boolean | null
  reviewedAlterations?: OrderQualityReviewedAlteration[]
  discrepancyText?: string
  voiceNotes?: OrderQualityReviewVoiceNote[]
}
