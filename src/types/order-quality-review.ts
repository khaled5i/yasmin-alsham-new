import type { DesignSummaryNote } from '@/types/design-comments'

export type OrderQualityReviewStage = 'first_proof' | 'second_proof' | 'final_dress'

export type OrderQualityReviewStatus = 'pending' | 'passed' | 'failed'

export interface OrderQualityMeasurementCheck {
  key: string
  label_ar: string
  label_en: string
  expected_value: string
  matched: boolean
}

export type OrderQualityReviewVoiceNote = DesignSummaryNote

export interface OrderQualityReview {
  id: string
  order_id: string
  stage: OrderQualityReviewStage
  attempt_number: number
  status: Exclude<OrderQualityReviewStatus, 'pending'>
  measurement_checks: OrderQualityMeasurementCheck[]
  design_matches: boolean
  discrepancy_text: string | null
  voice_notes: OrderQualityReviewVoiceNote[]
  reviewed_by: string
  created_at: string
}

export interface SubmitOrderQualityReviewInput {
  orderId: string
  stage: OrderQualityReviewStage
  measurementChecks: OrderQualityMeasurementCheck[]
  designMatches: boolean
  discrepancyText?: string
  voiceNotes?: OrderQualityReviewVoiceNote[]
}
