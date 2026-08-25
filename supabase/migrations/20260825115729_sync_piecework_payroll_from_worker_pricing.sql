-- Keep tailoring piecework payroll sourced from the prices entered on completed orders.
-- Only the current open month is backfilled. Historical payroll rows remain untouched
-- unless an order in that same unlocked period is edited later.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.worker_piecework_pricing_total(
  p_worker_id TEXT,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
  SELECT ROUND(
    COALESCE(
      SUM(
        CASE
          WHEN COALESCE(o.worker_price, 0) > 0
            THEN COALESCE(o.worker_price, 0) + COALESCE(o.worker_bonus, 0)
          ELSE 0
        END
      ),
      0
    ),
    2
  )
  FROM public.orders AS o
  WHERE o.worker_id::TEXT = p_worker_id
    AND o.worker_completed_at IS NOT NULL
    AND o.status IN ('completed', 'delivered')
    AND o.worker_completed_at >= MAKE_TIMESTAMPTZ(p_year, p_month, 1, 0, 0, 0, 'UTC')
    AND o.worker_completed_at < MAKE_TIMESTAMPTZ(
      CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
      CASE WHEN p_month = 12 THEN 1 ELSE p_month + 1 END,
      1,
      0,
      0,
      0,
      'UTC'
    );
$$;

CREATE OR REPLACE FUNCTION private.enforce_piecework_payroll_pricing_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pricing_total NUMERIC(14,2);
BEGIN
  IF NEW.branch <> 'tailoring'
     OR NEW.salary_type <> 'piecework'
     OR NEW.is_locked
     OR EXISTS (
       SELECT 1
       FROM public.worker_payroll_period_locks AS period_lock
       WHERE period_lock.branch = NEW.branch
         AND period_lock.payroll_year = NEW.payroll_year
         AND period_lock.payroll_month = NEW.payroll_month
         AND period_lock.is_locked
     ) THEN
    RETURN NEW;
  END IF;

  v_pricing_total := private.worker_piecework_pricing_total(
    NEW.worker_id,
    NEW.payroll_year,
    NEW.payroll_month
  );

  -- Piece prices vary per order, so the payroll snapshot stores the source total as total x 1.
  -- Keeping the rate at 1 also represents a genuine zero as 0 x 1 instead of an empty value.
  NEW.basic_salary := 0;
  NEW.fixed_salary_value := 0;
  NEW.piece_count := v_pricing_total;
  NEW.piece_rate := 1;
  NEW.piece_total := v_pricing_total;
  NEW.works_total := ROUND(v_pricing_total + COALESCE(NEW.overtime_total, 0), 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_piecework_payroll_pricing_source
  ON public.worker_payroll_months;
CREATE TRIGGER trg_enforce_piecework_payroll_pricing_source
BEFORE INSERT OR UPDATE OF
  salary_type,
  basic_salary,
  works_total,
  fixed_salary_value,
  piece_count,
  piece_rate,
  piece_total,
  overtime_hours,
  overtime_rate,
  overtime_total
ON public.worker_payroll_months
FOR EACH ROW
EXECUTE FUNCTION private.enforce_piecework_payroll_pricing_source();

CREATE OR REPLACE FUNCTION private.refresh_worker_piecework_payroll_month(
  p_worker_id TEXT,
  p_completed_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year INTEGER;
  v_month INTEGER;
  v_salary_type VARCHAR(20);
  v_worker_name TEXT;
  v_pricing_total NUMERIC(14,2);
  v_actor UUID := auth.uid();
BEGIN
  IF p_worker_id IS NULL OR p_completed_at IS NULL THEN
    RETURN;
  END IF;

  v_year := EXTRACT(YEAR FROM p_completed_at AT TIME ZONE 'UTC')::INTEGER;
  v_month := EXTRACT(MONTH FROM p_completed_at AT TIME ZONE 'UTC')::INTEGER;

  IF EXISTS (
    SELECT 1
    FROM public.worker_payroll_period_locks AS period_lock
    WHERE period_lock.branch = 'tailoring'
      AND period_lock.payroll_year = v_year
      AND period_lock.payroll_month = v_month
      AND period_lock.is_locked
  ) THEN
    RETURN;
  END IF;

  SELECT m.salary_type, m.worker_name
  INTO v_salary_type, v_worker_name
  FROM public.worker_payroll_months AS m
  WHERE m.branch = 'tailoring'
    AND m.worker_id = p_worker_id
    AND (
      m.payroll_year < v_year
      OR (m.payroll_year = v_year AND m.payroll_month <= v_month)
    )
  ORDER BY m.payroll_year DESC, m.payroll_month DESC
  LIMIT 1;

  IF v_salary_type IS DISTINCT FROM 'piecework' THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.full_name), ''), v_worker_name, p_worker_id)
  INTO v_worker_name
  FROM public.workers AS w
  LEFT JOIN public.users AS u ON u.id = w.user_id
  WHERE w.id::TEXT = p_worker_id
  LIMIT 1;

  v_worker_name := COALESCE(NULLIF(BTRIM(v_worker_name), ''), p_worker_id);
  v_pricing_total := private.worker_piecework_pricing_total(
    p_worker_id,
    v_year,
    v_month
  );

  INSERT INTO public.worker_payroll_months (
    branch,
    worker_id,
    worker_name,
    payroll_year,
    payroll_month,
    basic_salary,
    works_total,
    salary_type,
    fixed_salary_value,
    piece_count,
    piece_rate,
    piece_total,
    created_by,
    updated_by
  ) VALUES (
    'tailoring',
    p_worker_id,
    v_worker_name,
    v_year,
    v_month,
    0,
    v_pricing_total,
    'piecework',
    0,
    v_pricing_total,
    1,
    v_pricing_total,
    v_actor,
    v_actor
  )
  ON CONFLICT (branch, worker_id, payroll_year, payroll_month)
  DO UPDATE SET
    worker_name = EXCLUDED.worker_name,
    basic_salary = 0,
    fixed_salary_value = 0,
    piece_count = EXCLUDED.piece_count,
    piece_rate = 1,
    piece_total = EXCLUDED.piece_total,
    works_total = ROUND(EXCLUDED.piece_total + public.worker_payroll_months.overtime_total, 2),
    updated_by = v_actor
  WHERE public.worker_payroll_months.salary_type = 'piecework'
    AND public.worker_payroll_months.is_locked = FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_piecework_payroll_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_period TEXT;
  v_new_period TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.worker_id IS NOT DISTINCT FROM NEW.worker_id
     AND OLD.worker_completed_at IS NOT DISTINCT FROM NEW.worker_completed_at
     AND OLD.worker_price IS NOT DISTINCT FROM NEW.worker_price
     AND OLD.worker_bonus IS NOT DISTINCT FROM NEW.worker_bonus
     AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.worker_id IS NOT NULL
     AND OLD.worker_completed_at IS NOT NULL THEN
    v_old_period := TO_CHAR(OLD.worker_completed_at AT TIME ZONE 'UTC', 'YYYY-MM');
    PERFORM private.refresh_worker_piecework_payroll_month(
      OLD.worker_id::TEXT,
      OLD.worker_completed_at
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.worker_id IS NOT NULL
     AND NEW.worker_completed_at IS NOT NULL THEN
    v_new_period := TO_CHAR(NEW.worker_completed_at AT TIME ZONE 'UTC', 'YYYY-MM');

    IF TG_OP <> 'UPDATE'
       OR OLD.worker_id IS DISTINCT FROM NEW.worker_id
       OR v_old_period IS DISTINCT FROM v_new_period THEN
      PERFORM private.refresh_worker_piecework_payroll_month(
        NEW.worker_id::TEXT,
        NEW.worker_completed_at
      );
    ELSIF OLD.worker_price IS DISTINCT FROM NEW.worker_price
       OR OLD.worker_bonus IS DISTINCT FROM NEW.worker_bonus
       OR OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM private.refresh_worker_piecework_payroll_month(
        NEW.worker_id::TEXT,
        NEW.worker_completed_at
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_piecework_payroll_from_order ON public.orders;
CREATE TRIGGER trg_sync_piecework_payroll_from_order
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.sync_piecework_payroll_from_order();

-- Refresh only this open calendar month. Paid and historical months are intentionally not backfilled.
UPDATE public.worker_payroll_months
SET piece_count = piece_count
WHERE branch = 'tailoring'
  AND salary_type = 'piecework'
  AND payroll_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  AND payroll_month = EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
  AND is_locked = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM public.worker_payroll_period_locks AS period_lock
    WHERE period_lock.branch = public.worker_payroll_months.branch
      AND period_lock.payroll_year = public.worker_payroll_months.payroll_year
      AND period_lock.payroll_month = public.worker_payroll_months.payroll_month
      AND period_lock.is_locked
  );

WITH latest_worker_salary AS (
  SELECT DISTINCT ON (m.worker_id)
    m.worker_id,
    m.worker_name,
    m.salary_type
  FROM public.worker_payroll_months AS m
  WHERE m.branch = 'tailoring'
    AND (
      m.payroll_year < EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      OR (
        m.payroll_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
        AND m.payroll_month <= EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
      )
    )
  ORDER BY m.worker_id, m.payroll_year DESC, m.payroll_month DESC
)
INSERT INTO public.worker_payroll_months (
  branch,
  worker_id,
  worker_name,
  payroll_year,
  payroll_month,
  salary_type,
  basic_salary,
  fixed_salary_value,
  piece_count,
  piece_rate,
  piece_total,
  works_total
)
SELECT
  'tailoring',
  latest.worker_id,
  COALESCE(NULLIF(BTRIM(u.full_name), ''), latest.worker_name, latest.worker_id),
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
  'piecework',
  0,
  0,
  0,
  1,
  0,
  0
FROM latest_worker_salary AS latest
JOIN public.workers AS w ON w.id::TEXT = latest.worker_id
LEFT JOIN public.users AS u ON u.id = w.user_id
WHERE latest.salary_type = 'piecework'
  AND w.worker_type IN ('tailor', 'workshop_manager')
  AND COALESCE(u.is_active, TRUE)
  AND NOT EXISTS (
    SELECT 1
    FROM public.worker_payroll_months AS current_month
    WHERE current_month.branch = 'tailoring'
      AND current_month.worker_id = latest.worker_id
      AND current_month.payroll_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      AND current_month.payroll_month = EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
  )
ON CONFLICT (branch, worker_id, payroll_year, payroll_month) DO NOTHING;

REVOKE ALL ON FUNCTION private.worker_piecework_pricing_total(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_piecework_payroll_pricing_source() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.refresh_worker_piecework_payroll_month(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_piecework_payroll_from_order() FROM PUBLIC;

COMMIT;
