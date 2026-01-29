-- ============================================================================
-- Yasmin Al-Sham - Worker Translations Table
-- جدول الترجمات الخاصة بالعمال
-- ============================================================================
-- 
-- الغرض: حفظ الترجمات الخاصة بكل عامل للملاحظات الصوتية
-- عندما يقوم العامل بترجمة ملاحظة صوتية، يتم حفظ الترجمة هنا
-- وعند فتح الطلب مرة أخرى، تظهر الترجمة المحفوظة تلقائياً
-- ============================================================================

-- ============================================================================
-- 1. إنشاء جدول worker_translations
-- ============================================================================

CREATE TABLE IF NOT EXISTS worker_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- ربط بالطلب
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- ربط بالعامل
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  
  -- معرف الملاحظة الصوتية (من voice_transcriptions)
  voice_note_id TEXT NOT NULL,
  
  -- النص الأصلي (من Whisper API)
  original_text TEXT,
  
  -- النص المترجم
  translated_text TEXT NOT NULL,
  
  -- اللغة المترجم إليها
  target_language TEXT NOT NULL DEFAULT 'en',
  
  -- التوقيتات
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. الفهارس (Indexes) لتحسين الأداء
-- ============================================================================

-- فهرس مركب للبحث السريع عن ترجمات عامل معين لطلب معين
CREATE INDEX IF NOT EXISTS idx_worker_translations_worker_order 
ON worker_translations(worker_id, order_id);

-- فهرس للبحث عن ترجمة ملاحظة صوتية معينة
CREATE INDEX IF NOT EXISTS idx_worker_translations_voice_note 
ON worker_translations(order_id, voice_note_id);

-- فهرس للبحث عن جميع ترجمات عامل معين
CREATE INDEX IF NOT EXISTS idx_worker_translations_worker 
ON worker_translations(worker_id);

-- ============================================================================
-- 3. القيود (Constraints)
-- ============================================================================

-- التأكد من عدم تكرار الترجمة لنفس الملاحظة من نفس العامل
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_translations_unique 
ON worker_translations(worker_id, order_id, voice_note_id);

-- ============================================================================
-- 4. Trigger لتحديث updated_at تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION update_worker_translations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_worker_translations_updated_at
  BEFORE UPDATE ON worker_translations
  FOR EACH ROW
  EXECUTE FUNCTION update_worker_translations_updated_at();

-- ============================================================================
-- 5. Row Level Security (RLS)
-- ============================================================================

-- تفعيل RLS
ALTER TABLE worker_translations ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: العامل يمكنه قراءة ترجماته فقط، والمدير يمكنه قراءة كل الترجمات
CREATE POLICY "Workers can view their own translations"
  ON worker_translations
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM workers WHERE id = worker_id
    )
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- سياسة الإدراج: العامل يمكنه إضافة ترجماته فقط
CREATE POLICY "Workers can insert their own translations"
  ON worker_translations
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM workers WHERE id = worker_id
    )
  );

-- سياسة التحديث: العامل يمكنه تحديث ترجماته فقط
CREATE POLICY "Workers can update their own translations"
  ON worker_translations
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM workers WHERE id = worker_id
    )
  );

-- سياسة الحذف: العامل يمكنه حذف ترجماته فقط، والمدير يمكنه حذف كل الترجمات
CREATE POLICY "Workers can delete their own translations"
  ON worker_translations
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM workers WHERE id = worker_id
    )
    OR
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
  );

-- ============================================================================
-- 6. التعليقات التوضيحية
-- ============================================================================

COMMENT ON TABLE worker_translations IS 'جدول الترجمات الخاصة بالعمال - يحفظ ترجمات الملاحظات الصوتية لكل عامل';
COMMENT ON COLUMN worker_translations.order_id IS 'معرف الطلب';
COMMENT ON COLUMN worker_translations.worker_id IS 'معرف العامل';
COMMENT ON COLUMN worker_translations.voice_note_id IS 'معرف الملاحظة الصوتية من voice_transcriptions';
COMMENT ON COLUMN worker_translations.original_text IS 'النص الأصلي المحول من الصوت';
COMMENT ON COLUMN worker_translations.translated_text IS 'النص المترجم';
COMMENT ON COLUMN worker_translations.target_language IS 'اللغة المترجم إليها (en, ar, etc.)';

