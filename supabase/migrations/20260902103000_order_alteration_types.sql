-- Classify linked alterations by proof stage and keep order-card counters in sync.

ALTER TABLE public.alterations
  ADD COLUMN IF NOT EXISTS alteration_type TEXT NOT NULL DEFAULT 'after_delivery';

ALTER TABLE public.alterations
  DROP CONSTRAINT IF EXISTS alterations_alteration_type_check;

ALTER TABLE public.alterations
  ADD CONSTRAINT alterations_alteration_type_check
  CHECK (alteration_type IN ('first_proof', 'second_proof', 'after_delivery'));

COMMENT ON COLUMN public.alterations.alteration_type IS
  'Alteration stage: first_proof, second_proof, or after_delivery. Historical rows default to after_delivery.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS second_proof_alteration_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.alteration_count IS
  'Number of non-cancelled after-delivery alterations linked to the order.';

COMMENT ON COLUMN public.orders.has_alterations IS
  'True when the order has at least one non-cancelled alteration of any type.';

COMMENT ON COLUMN public.orders.second_proof_alteration_count IS
  'Number of non-cancelled second-proof alterations linked to the order.';

CREATE INDEX IF NOT EXISTS idx_alterations_order_type_active
  ON public.alterations (original_order_id, alteration_type)
  WHERE status <> 'cancelled';

-- Allow a user to read linked alteration summaries whenever existing orders RLS
-- already allows that user to read the parent order. Existing admin/worker
-- policies remain untouched and still cover external or directly assigned work.
DROP POLICY IF EXISTS "Order viewers can view linked alterations" ON public.alterations;
CREATE POLICY "Order viewers can view linked alterations"
ON public.alterations
FOR SELECT
TO authenticated
USING (
  original_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders
    WHERE orders.id = alterations.original_order_id
  )
);

CREATE OR REPLACE FUNCTION public.sync_order_alteration_summary_from_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_order_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.original_order_id;
  ELSE
    target_order_id := NEW.original_order_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.original_order_id IS DISTINCT FROM NEW.original_order_id
     AND OLD.original_order_id IS NOT NULL THEN
    UPDATE public.orders AS target
    SET
      alteration_count = summary.after_delivery_count,
      second_proof_alteration_count = summary.second_proof_count,
      has_alterations = summary.active_count > 0,
      last_alteration_at = summary.latest_alteration_at
    FROM (
      SELECT
        COUNT(*) FILTER (WHERE alteration_type = 'after_delivery')::INTEGER AS after_delivery_count,
        COUNT(*) FILTER (WHERE alteration_type = 'second_proof')::INTEGER AS second_proof_count,
        COUNT(*)::INTEGER AS active_count,
        MAX(created_at) AS latest_alteration_at
      FROM public.alterations
      WHERE original_order_id = OLD.original_order_id
        AND status <> 'cancelled'
    ) AS summary
    WHERE target.id = OLD.original_order_id;
  END IF;

  IF target_order_id IS NOT NULL THEN
    UPDATE public.orders AS target
    SET
      alteration_count = summary.after_delivery_count,
      second_proof_alteration_count = summary.second_proof_count,
      has_alterations = summary.active_count > 0,
      last_alteration_at = summary.latest_alteration_at
    FROM (
      SELECT
        COUNT(*) FILTER (WHERE alteration_type = 'after_delivery')::INTEGER AS after_delivery_count,
        COUNT(*) FILTER (WHERE alteration_type = 'second_proof')::INTEGER AS second_proof_count,
        COUNT(*)::INTEGER AS active_count,
        MAX(created_at) AS latest_alteration_at
      FROM public.alterations
      WHERE original_order_id = target_order_id
        AND status <> 'cancelled'
    ) AS summary
    WHERE target.id = target_order_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_order_alteration_summary ON public.alterations;
CREATE TRIGGER trigger_sync_order_alteration_summary
AFTER INSERT OR DELETE OR UPDATE OF original_order_id, alteration_type, status
ON public.alterations
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_alteration_summary_from_row();

REVOKE ALL ON FUNCTION public.sync_order_alteration_summary_from_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_order_alteration_summary_from_row() FROM anon, authenticated;

-- Rebuild all summaries. Existing unclassified records are intentionally treated
-- as post-delivery alterations by the column default above.
UPDATE public.orders AS target
SET
  alteration_count = summary.after_delivery_count,
  second_proof_alteration_count = summary.second_proof_count,
  has_alterations = summary.active_count > 0,
  last_alteration_at = summary.latest_alteration_at
FROM (
  SELECT
    orders.id AS order_id,
    COUNT(alterations.id) FILTER (
      WHERE alterations.alteration_type = 'after_delivery'
        AND alterations.status <> 'cancelled'
    )::INTEGER AS after_delivery_count,
    COUNT(alterations.id) FILTER (
      WHERE alterations.alteration_type = 'second_proof'
        AND alterations.status <> 'cancelled'
    )::INTEGER AS second_proof_count,
    COUNT(alterations.id) FILTER (
      WHERE alterations.status <> 'cancelled'
    )::INTEGER AS active_count,
    MAX(alterations.created_at) FILTER (
      WHERE alterations.status <> 'cancelled'
    ) AS latest_alteration_at
  FROM public.orders
  LEFT JOIN public.alterations ON alterations.original_order_id = orders.id
  GROUP BY orders.id
) AS summary
WHERE target.id = summary.order_id;
