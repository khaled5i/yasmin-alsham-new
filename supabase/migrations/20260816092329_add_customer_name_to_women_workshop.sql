-- Preserve the customer name on the women-workshop ledger so accountants can
-- see it without being granted broader access to the orders table.

ALTER TABLE public.women_workshop_transactions
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

COMMENT ON COLUMN public.women_workshop_transactions.customer_name IS
  'اسم العميل عند توفره، ويُنسخ من الطلب للعمليات القادمة من صفحة الطلبات الحديثة.';

UPDATE public.women_workshop_transactions AS transaction
SET customer_name = NULLIF(btrim(orders.client_name), '')
FROM public.orders AS orders
WHERE transaction.order_id = orders.id
  AND transaction.customer_name IS NULL
  AND NULLIF(btrim(orders.client_name), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION private.sync_women_workshop_measurement_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.has_measurements IS TRUE
    AND NEW.measurement_source = 'yasmin_alsham'
    AND NEW.measurement_payment_method = 'card'
  THEN
    INSERT INTO public.women_workshop_transactions (
      source,
      operation_type,
      operation_name,
      customer_name,
      amount,
      payment_method,
      order_id,
      created_by,
      occurred_at,
      alostaz_customer_id,
      alostaz_invoice_id,
      alostaz_invoice_code,
      alostaz_sync_status,
      alostaz_sync_token,
      alostaz_sync_error,
      alostaz_synced_at,
      updated_at
    )
    VALUES (
      'order_measurement',
      'order_measurement',
      'أخذ مقاس',
      NULLIF(btrim(NEW.client_name), ''),
      85,
      'card',
      NEW.id,
      auth.uid(),
      COALESCE(NEW.alostaz_measurement_synced_at, now()),
      NEW.alostaz_customer_id,
      NEW.alostaz_measurement_invoice_id,
      NEW.alostaz_measurement_invoice_code,
      COALESCE(NEW.alostaz_measurement_sync_status, 'pending'),
      NEW.alostaz_measurement_sync_token,
      NEW.alostaz_measurement_sync_error,
      NEW.alostaz_measurement_synced_at,
      now()
    )
    ON CONFLICT (source, order_id)
    DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      alostaz_customer_id = EXCLUDED.alostaz_customer_id,
      alostaz_invoice_id = EXCLUDED.alostaz_invoice_id,
      alostaz_invoice_code = EXCLUDED.alostaz_invoice_code,
      alostaz_sync_status = EXCLUDED.alostaz_sync_status,
      alostaz_sync_token = EXCLUDED.alostaz_sync_token,
      alostaz_sync_error = EXCLUDED.alostaz_sync_error,
      alostaz_synced_at = EXCLUDED.alostaz_synced_at,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_women_workshop_measurement_transaction() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_women_workshop_measurement_transaction ON public.orders;
CREATE TRIGGER sync_women_workshop_measurement_transaction
  AFTER INSERT OR UPDATE OF
    client_name,
    has_measurements,
    measurement_source,
    measurement_payment_method,
    alostaz_customer_id,
    alostaz_measurement_invoice_id,
    alostaz_measurement_invoice_code,
    alostaz_measurement_sync_status,
    alostaz_measurement_sync_token,
    alostaz_measurement_sync_error,
    alostaz_measurement_synced_at
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_women_workshop_measurement_transaction();
