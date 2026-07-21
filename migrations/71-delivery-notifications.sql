-- Migration 71: مركز إشعارات المدير — إشعارات الطلبات المُسلَّمة
--
-- يبدأ الإشعار عند انتقال الطلب فعلياً إلى status = 'delivered'.
-- لا تُعاد إظهار الطلبات المُسلَّمة القديمة، لأن القيم الجديدة تبدأ بـ FALSE
-- ويقوم orderService بتفعيلها فقط لحظة الانتقال إلى حالة التسليم.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_notified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_dismissed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orders.delivery_notified IS
  'انتقل الطلب إلى حالة "تم التسليم" وظهر في قسم الطلبات المُسلَّمة داخل مركز إشعارات المدير.';
COMMENT ON COLUMN orders.delivery_notified_at IS
  'توقيت الانتقال الفعلي إلى حالة "تم التسليم"؛ يُستخدم لترتيب إشعارات التسليم.';
COMMENT ON COLUMN orders.delivery_whatsapp_sent IS
  'فتح المدير رسالة واتساب الخاصة بتأكيد التسليم وطلب التقييم من مركز الإشعارات.';
COMMENT ON COLUMN orders.delivery_dismissed IS
  'أخفى المدير إشعار التسليم يدوياً بزر العين بعد الانتهاء منه.';

-- فهرس جزئي يطابق استعلام مركز الإشعارات: المُسلَّم حديثاً وغير المُخفى.
CREATE INDEX IF NOT EXISTS idx_orders_delivery_notifications
  ON orders(delivery_notified_at DESC)
  WHERE status = 'delivered'
    AND delivery_notified = TRUE
    AND delivery_dismissed = FALSE;
