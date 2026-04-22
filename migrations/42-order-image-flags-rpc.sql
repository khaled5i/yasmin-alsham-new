-- Migration 42: دالة RPC خفيفة لمعرفة وجود صور الكرتون والعمل المكتمل
-- تُستخدم في CartoonGridModal لإظهار شارات بجانب الطلبات في قائمة البحث
-- بدون جلب بيانات ثقيلة (measurements JSONB كاملة أو completed_images)

CREATE OR REPLACE FUNCTION get_order_image_flags(order_ids uuid[])
RETURNS TABLE(
  id           uuid,
  has_cartoon  boolean,
  has_completed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.id,
    (
      (o.measurements->>'cartoon_image') IS NOT NULL
      AND (o.measurements->>'cartoon_image') <> ''
    ) AS has_cartoon,
    (
      o.completed_images IS NOT NULL
      AND array_length(o.completed_images, 1) > 0
    ) AS has_completed
  FROM orders o
  WHERE o.id = ANY(order_ids);
$$;

-- منح الصلاحية للمستخدمين المصادق عليهم
GRANT EXECUTE ON FUNCTION get_order_image_flags(uuid[]) TO authenticated;
