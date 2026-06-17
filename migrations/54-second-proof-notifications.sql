-- Migration 54: مركز إشعارات المدير — إشعارات البروفا الثانية
--
-- الفكرة: عندما يحتوي الطلب على بروفا ثانية (has_second_proof = true)، يظهر للعامل
-- زر "البروفا الثانية جاهزة" في صفحة طلباته. عند الضغط عليه يُسجَّل أن البروفا الثانية
-- جاهزة + تاريخ التسجيل، فيظهر الطلب في "مركز إشعارات المدير" تحت قسم البروفا الثانية،
-- مرتباً من الأحدث إلى الأقدم بحسب تاريخ الإنجاز.
--
-- الأعمدة:
--   • second_proof_completed       : العامل أبلغ أن البروفا الثانية جاهزة.
--   • second_proof_completed_at    : توقيت الإبلاغ (للترتيب والتصنيف بحسب التاريخ).
--   • second_proof_whatsapp_sent   : المدير أرسل رسالة "البروفا الثانية جاهزة" للزبونة
--                                     → يتحول زر الواتساب لعلامة صح (مستقل عن whatsapp_sent
--                                     الخاص برسالة تأكيد الطلب).
--   • second_proof_dismissed       : المدير أخفى الإشعار يدوياً بعد الانتهاء منه نهائياً
--                                     (يبقى محفوظاً في DB لكن لا يظهر كإشعار).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS second_proof_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS second_proof_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_proof_whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS second_proof_dismissed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orders.second_proof_completed IS
  'العامل أبلغ أن البروفا الثانية جاهزة للاستلام (يظهر في مركز إشعارات المدير).';
COMMENT ON COLUMN orders.second_proof_completed_at IS
  'توقيت إبلاغ العامل بجهوزية البروفا الثانية — يُستخدم لترتيب الإشعارات (الأحدث أولاً).';
COMMENT ON COLUMN orders.second_proof_whatsapp_sent IS
  'المدير أرسل رسالة جهوزية البروفا الثانية للزبونة عبر واتساب (علامة الصح في مركز الإشعارات).';
COMMENT ON COLUMN orders.second_proof_dismissed IS
  'المدير أخفى إشعار البروفا الثانية يدوياً بعد الانتهاء منه — لا يظهر بعدها كإشعار.';

-- فهرس لتسريع جلب الإشعارات النشطة (مُبلَّغ عنها وغير مُخفاة) مرتبة بالأحدث
CREATE INDEX IF NOT EXISTS idx_orders_second_proof_notifications
  ON orders(second_proof_completed_at DESC)
  WHERE second_proof_completed = TRUE AND second_proof_dismissed = FALSE;
