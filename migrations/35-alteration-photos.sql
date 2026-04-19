-- ============================================================================
-- Migration 35: إضافة عمود صور التعديل
-- Add alteration_photos column to alterations table
-- ============================================================================

ALTER TABLE alterations
  ADD COLUMN IF NOT EXISTS alteration_photos TEXT[] DEFAULT '{}';

COMMENT ON COLUMN alterations.alteration_photos IS 'صور التعديل المُلتقطة من الكاميرا أو المرفوعة في قسم وصف التعديل';

-- ============================================================================
-- تحديث قيد error_type لإضافة نوع "خطأ الاستقبال"
-- ============================================================================

ALTER TABLE alterations DROP CONSTRAINT IF EXISTS alterations_error_type_check;

ALTER TABLE alterations
  ADD CONSTRAINT alterations_error_type_check
  CHECK (error_type IN (
    'tailor_error',
    'cutter_error',
    'measurement_error',
    'customer_error',
    'reception_error',
    'other_error'
  ));
