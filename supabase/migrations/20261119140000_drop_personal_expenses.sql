-- حذف قسم «مصروفات شخصية» بالكامل (2026-11-19 بطلب المالك).
-- ينقض الهجرة 20260916130000_personal_expenses.sql.
-- تنبيه: يحذف كل السجلات المحفوظة في الجدول نهائياً — صدّرها أولاً إن كانت مطلوبة.
-- الجدول مستقل: لا يؤثر على الصندوق ولا الأرباح ولا تشير إليه أي جداول أخرى.

DROP POLICY IF EXISTS personal_expenses_admin_all ON public.personal_expenses;
DROP TABLE IF EXISTS public.personal_expenses;
