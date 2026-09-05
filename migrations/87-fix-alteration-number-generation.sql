-- ============================================================================
-- Migration 87: إصلاح توليد رقم التعديل (alteration_number)
-- ============================================================================
--
-- المشكلة:
--   كانت الدالة generate_alteration_number() تحسب الرقم التالي بـ COUNT(*) + 1
--   وهذا يعني أنه بعد حذف أي تعديلات قديمة ينخفض العدد فيعيد توليد رقم مستخدم
--   مسبقاً → خطأ: duplicate key value violates unique constraint
--   (alterations_alteration_number_key) ولا يُحفظ التعديل الجديد.
--
-- الحل:
--   1) استخدام أكبر رقم تسلسلي موجود فعلياً (MAX) بدل عدد الصفوف (COUNT).
--   2) حلقة أمان تتخطى أي رقم محجوز مسبقاً (لبيانات قديمة غير منتظمة).
--   3) قفل استشاري (advisory lock) لمنع تضارب الإدخالات المتزامنة.
--   4) SECURITY DEFINER حتى يرى الحساب كامل الأرقام رغم سياسات RLS.
--
-- تعليمات التطبيق: Supabase Dashboard → SQL Editor → لصق الملف → RUN
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_alteration_number()
RETURNS TEXT AS $$
DECLARE
  year_prefix TEXT;
  next_seq INTEGER;
  candidate TEXT;
BEGIN
  year_prefix := TO_CHAR(NOW(), 'YYYY');

  -- منع تضارب عمليتي إدخال متزامنتين على نفس السنة (يُحرَّر تلقائياً بنهاية المعاملة)
  PERFORM pg_advisory_xact_lock(hashtext('alteration_number_' || year_prefix));

  -- أكبر رقم تسلسلي مُستخدم فعلياً في هذه السنة (وليس عدد الصفوف)
  SELECT COALESCE(
           MAX((regexp_match(alteration_number, '^ALT-' || year_prefix || '-([0-9]+)$'))[1]::INTEGER),
           0
         ) + 1
    INTO next_seq
    FROM alterations
   WHERE alteration_number ~ ('^ALT-' || year_prefix || '-[0-9]+$');

  -- حلقة أمان: تخطَّ أي رقم محجوز مسبقاً بصيغة غير متوقعة
  LOOP
    candidate := 'ALT-' || year_prefix || '-' || LPAD(next_seq::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM alterations WHERE alteration_number = candidate
    );
    next_seq := next_seq + 1;
  END LOOP;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION generate_alteration_number() IS
  'يولّد رقم تعديل فريد بصيغة ALT-YYYY-NNNN اعتماداً على أكبر رقم مستخدم (MAX) لا على عدد الصفوف، فلا يتكرر الرقم بعد حذف تعديلات قديمة';

-- إعادة تثبيت الـ trigger (لا يتغير سلوكه، فقط للتأكد من وجوده)
CREATE OR REPLACE FUNCTION set_alteration_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alteration_number IS NULL OR TRIM(NEW.alteration_number) = '' THEN
    NEW.alteration_number := generate_alteration_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_alteration_number ON alterations;

CREATE TRIGGER trigger_set_alteration_number
BEFORE INSERT ON alterations
FOR EACH ROW
EXECUTE FUNCTION set_alteration_number();

-- ============================================================================
-- تحقق سريع (اختياري): الرقم التالي المقترح
-- SELECT generate_alteration_number();
-- ============================================================================
