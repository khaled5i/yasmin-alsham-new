-- Migration 68: مركز إشعارات المدير — إشعارات اكتمال الطلب (اشعار الاكتمال)
--
-- الفكرة: عند تحديد أن أحد الطلبات "مكتمل" (status = 'completed') لأول مرة، يُفعَّل
-- إشعار اكتمال يظهر في "مركز إشعارات المدير" تحت قسم "اكتمال الطلب". للمدير زر لإخفاء
-- الإشعار يدوياً، ويُخفى الإشعار تلقائياً عند إرسال رسالة "الطلب جاهز للاستلام" عبر واتساب
-- (لأن إرسالها يضبط admin_confirmed = true).
--
-- مهم: يظهر فقط للطلبات التي تُحدَّد "مكتملة" بعد تطبيق هذا الترحيل (لا تظهر الطلبات
-- المكتملة القديمة) لأن completion_notified يبدأ بقيمة FALSE، ولا يُفعَّل إلا عند
-- الانتقال الفعلي إلى الحالة "مكتمل" داخل orderService.update.
--
-- الأعمدة:
--   • completion_notified      : الطلب انتقل إلى "مكتمل" فظهر كإشعار اكتمال.
--   • completion_notified_at   : توقيت الانتقال إلى "مكتمل" (للترتيب والتصنيف بحسب التاريخ).
--   • completion_dismissed     : المدير أخفى إشعار الاكتمال يدوياً بعد الانتهاء منه.
--
-- الإخفاء التلقائي عند إرسال واتساب يعتمد على admin_confirmed الموجود مسبقاً (يُضبط عند
-- إرسال رسالة "جاهز للاستلام")، لذا لا نحتاج عموداً إضافياً له.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS completion_notified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completion_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_dismissed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orders.completion_notified IS
  'انتقل الطلب إلى "مكتمل" فظهر كإشعار اكتمال في مركز إشعارات المدير (يُفعَّل عند الانتقال فقط، لا للطلبات المكتملة القديمة).';
COMMENT ON COLUMN orders.completion_notified_at IS
  'توقيت انتقال الطلب إلى "مكتمل" — يُستخدم لترتيب إشعارات الاكتمال (الأحدث أولاً).';
COMMENT ON COLUMN orders.completion_dismissed IS
  'المدير أخفى إشعار الاكتمال يدوياً بعد الانتهاء منه — لا يظهر بعدها كإشعار اكتمال.';

-- فهرس لتسريع جلب إشعارات الاكتمال النشطة (مُفعَّلة، غير مُرسَلة، غير مُخفاة) مرتبة بالأحدث
CREATE INDEX IF NOT EXISTS idx_orders_completion_notifications
  ON orders(completion_notified_at DESC)
  WHERE status = 'completed'
    AND completion_notified = TRUE
    AND completion_dismissed = FALSE
    AND admin_confirmed = FALSE;
