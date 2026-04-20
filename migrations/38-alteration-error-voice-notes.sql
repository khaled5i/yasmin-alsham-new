-- ============================================================================
-- Migration 38: إضافة تسجيلات صوتية لقسم ملاحظات الخطأ في طلبات التعديل
-- ============================================================================

ALTER TABLE alterations
  ADD COLUMN IF NOT EXISTS error_voice_transcriptions JSONB DEFAULT '[]';

COMMENT ON COLUMN alterations.error_voice_transcriptions IS 'تسجيلات صوتية مرتبطة بملاحظات الخطأ';
