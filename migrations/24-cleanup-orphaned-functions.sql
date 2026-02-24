-- ============================================================================
-- Migration 24: تنظيف الدوال المهجورة وإصلاح الدالة المكررة
-- Cleanup Orphaned Functions & Fix Duplicate Function
-- التاريخ: 2026-02-22
-- ============================================================================
--
-- ما يفعله هذا الـ Migration:
--
-- 1. حذف 3 دوال تشير لجداول محذوفة (favorites, cart_items):
--    - cleanup_old_carts()
--    - merge_session_to_user(text, uuid)
--    - update_cart_last_activity()  [trigger function]
--
-- 2. حذف النسخة القديمة (13 معامل) من دالة مكررة:
--    - upsert_worker_payroll_month_snapshot(varchar,text,text,int,int,numeric x5,date,text,text)
--    والإبقاء على النسخة الجديدة (19 معامل) التي تدعم أنواع الرواتب المتعددة
--
-- السبب:
--    - جداول favorites و cart_items تم حذفها - ميزة المفضلة/السلة أُلغيت
--    - الدوال الثلاث الأولى ستُعطي خطأ لو استُدعيت (جداولها غير موجودة)
--    - الدالة المكررة تسبب غموضاً في الاستدعاء وتُشوش قاعدة البيانات
-- ============================================================================

-- ============================================================================
-- 1. حذف الدوال المهجورة (تشير لجداول favorites و cart_items المحذوفة)
-- ============================================================================

DROP FUNCTION IF EXISTS public.cleanup_old_carts();

DROP FUNCTION IF EXISTS public.merge_session_to_user(text, uuid);

DROP FUNCTION IF EXISTS public.update_cart_last_activity();

-- ============================================================================
-- 2. حذف النسخة القديمة (13 معامل) من upsert_worker_payroll_month_snapshot
--    والإبقاء على النسخة الجديدة (19 معامل) التي تدعم:
--    p_salary_type, p_fixed_salary_value, p_piece_count, p_piece_rate,
--    p_overtime_hours, p_overtime_rate
-- ============================================================================

DROP FUNCTION IF EXISTS public.upsert_worker_payroll_month_snapshot(
  character varying,  -- p_branch
  text,               -- p_worker_id
  text,               -- p_worker_name
  integer,            -- p_year
  integer,            -- p_month
  numeric,            -- p_basic_salary
  numeric,            -- p_works_total
  numeric,            -- p_allowances_total
  numeric,            -- p_deductions_total
  numeric,            -- p_advances_total
  date,               -- p_operation_date
  text,               -- p_reference
  text                -- p_note
);

-- ============================================================================
-- التحقق من نجاح العملية
-- ============================================================================
-- يمكن تشغيل هذا الاستعلام للتأكد من حذف الدوال بنجاح:
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN (
--   'cleanup_old_carts', 'merge_session_to_user', 'update_cart_last_activity'
-- );
-- -- يجب أن يُرجع نتيجة فارغة ✅
--
-- SELECT specific_name,
--   (SELECT COUNT(*) FROM information_schema.parameters p
--    WHERE p.specific_name = r.specific_name) AS param_count
-- FROM information_schema.routines r
-- WHERE r.routine_schema = 'public'
-- AND r.routine_name = 'upsert_worker_payroll_month_snapshot';
-- -- يجب أن يُرجع صف واحد فقط بـ param_count = 19 ✅

