-- ============================================================================
-- من أخذ التعديل + من أخذ المقاس (19 نوفمبر 2026)
-- ============================================================================
-- 1) alterations.taken_by: سؤال إجباري ثالث عند حفظ طلب تعديل
--    «مين أخذ التعديل؟» (هبة / منال / ندى).
-- 2) orders.measurement_taken_by: اختيار إجباري في نافذة المقاسات
--    «مين أخذ المقاس؟» من نفس الأسماء.
--
-- العمودان نصّيان بلا قيد CHECK، فإضافة اسم جديد تكون من الكود فقط
-- (src/lib/reception-staff.ts). السجلات القديمة تبقى NULL.
--
-- يجب تطبيقها قبل نشر الكود.
--
-- التراجع:
--   ALTER TABLE public.alterations DROP COLUMN IF EXISTS taken_by;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS measurement_taken_by;
-- ============================================================================

ALTER TABLE public.alterations
  ADD COLUMN IF NOT EXISTS taken_by VARCHAR(100) NULL;

COMMENT ON COLUMN public.alterations.taken_by IS 'من أخذ طلب التعديل من الزبونة (هبة / منال / ندى)';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS measurement_taken_by VARCHAR(100) NULL;

COMMENT ON COLUMN public.orders.measurement_taken_by IS 'من أخذ مقاس الزبونة (هبة / منال / ندى)';
