-- ============================================================================
-- Yasmin Al-Sham - إضافة حقل النصوص المحولة من التسجيلات الصوتية
-- Add voice transcriptions field to orders table
-- ============================================================================

-- إضافة حقل voice_transcriptions إلى جدول orders
-- هذا الحقل سيخزن النصوص المحولة من التسجيلات الصوتية مع الترجمات
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS voice_transcriptions JSONB DEFAULT '[]';

-- إضافة تعليق توضيحي
COMMENT ON COLUMN orders.voice_transcriptions IS 'النصوص المحولة من التسجيلات الصوتية مع الترجمات - مصفوفة من الكائنات بصيغة JSON';

-- مثال على البيانات المخزنة:
-- [
--   {
--     "id": "vn-1",
--     "audioData": "data:audio/webm;base64,...",
--     "timestamp": 1234567890,
--     "duration": 30,
--     "transcription": "النص المحول من الصوت",
--     "translatedText": "Translated text",
--     "translationLanguage": "en"
--   }
-- ]

-- إنشاء index للبحث في النصوص المحولة (اختياري)
CREATE INDEX IF NOT EXISTS idx_orders_voice_transcriptions 
ON orders USING GIN (voice_transcriptions);

-- ============================================================================
-- تحديث الـ Trigger لتحديث updated_at
-- ============================================================================

-- التأكد من أن trigger تحديث updated_at يعمل مع الحقل الجديد
-- (الـ trigger موجود مسبقاً من migrations سابقة)

-- ============================================================================
-- ملاحظات
-- ============================================================================

-- 1. الحقل voice_transcriptions يخزن مصفوفة من الكائنات JSON
-- 2. كل كائن يحتوي على:
--    - id: معرف فريد للتسجيل الصوتي
--    - audioData: البيانات الصوتية بصيغة base64
--    - timestamp: وقت التسجيل
--    - duration: مدة التسجيل بالثواني
--    - transcription: النص المحول من الصوت (اختياري)
--    - translatedText: النص المترجم (اختياري)
--    - translationLanguage: اللغة المترجم إليها (اختياري)
-- 3. يمكن البحث في النصوص المحولة باستخدام GIN index
-- 4. الحقل الحالي voice_notes (TEXT[]) سيبقى للتوافق مع الكود القديم

