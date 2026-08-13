-- Track orders delivered through the explicit silent/outstanding-balance action.
-- The payment fields remain untouched; this flag is only an audit/UI marker.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_with_outstanding_balance BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders.delivered_with_outstanding_balance IS
  'تم تسليم الطلب بصمت عبر زر تجاهل الدفعة المتبقية، مع إبقاء الدفعة دون تغيير.';
