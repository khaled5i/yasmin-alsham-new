-- Prevent fabric-store managers from changing network sales after those sales
-- have been sent to Alostaz. Admins, accountants, and general managers keep
-- their existing permissions, and cash sales remain editable/deletable.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.prevent_fabric_manager_sent_sale_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.branch = 'fabrics'
     AND OLD.payment_method = 'network'
     AND (
       OLD.alostaz_invoice_id IS NOT NULL
       OR NULLIF(BTRIM(COALESCE(OLD.alostaz_invoice_code, '')), '') IS NOT NULL
       OR OLD.alostaz_sync_status = 'sent'
     )
     AND EXISTS (
       SELECT 1
       FROM public.users AS u
       JOIN public.workers AS w ON w.user_id = u.id
       WHERE u.id = (SELECT auth.uid())
         AND u.is_active = TRUE
         AND u.role = 'worker'
         AND w.worker_type = 'fabric_store_manager'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Fabric-store managers cannot update or delete a network sale sent to accounting.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_fabric_manager_sent_sale_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.prevent_fabric_manager_sent_sale_changes() FROM anon;
REVOKE ALL ON FUNCTION private.prevent_fabric_manager_sent_sale_changes() FROM authenticated;

DROP TRIGGER IF EXISTS protect_sent_fabric_sales_from_fabric_managers ON public.income;
CREATE TRIGGER protect_sent_fabric_sales_from_fabric_managers
BEFORE UPDATE OR DELETE ON public.income
FOR EACH ROW
EXECUTE FUNCTION private.prevent_fabric_manager_sent_sale_changes();

