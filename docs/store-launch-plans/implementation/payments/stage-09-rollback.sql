-- ============================================================================
-- تراجع المرحلة 9 (20260930135919_fabric_store_reconciliation.sql) — من SQL Editor
-- ============================================================================
-- أطفئي FABRIC_STORE_RECONCILE_ENABLED أولاً (المهمة المجدولة وقسم التنبيهات يتوقفان).
--
-- ما يُحذف: دوال المطابقة والتنبيهات الثلاث. لا بيانات: التنبيهات تُحسب ولا تُخزَّن.
-- ما يبقى عمداً: أعمدة حجز المطابقة وfabric_store_payment_attempts.reconciled_at (توقيت آخر مطابقة ناجحة،
-- لا يقرؤه غير المرحلة 9)، وأحداث الدفع التي سجّلتها المطابقة (source = 'poll') —
-- أدلة دفعات حقيقية طُبّقت بالمسار نفسه للـwebhook.
-- لا شيء في المراحل الأخرى يستدعي هاتين الدالتين، فلا ترتيب مفروض مع تراجع 8.
-- ============================================================================

begin;

set local lock_timeout = '5s';

drop function public.fabric_store_due_reconciliation(text, integer);
drop function public.fabric_store_complete_reconciliation(uuid, uuid);
drop function public.fabric_store_staff_alerts();

commit;
