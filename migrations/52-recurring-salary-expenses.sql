-- Migration 52: Recurring Salary Expenses (Monthly)
-- Extends generate_recurring_expenses to also generate monthly salary entries,
-- not just fixed expenses. The salaries page (type='salary') can now mark a
-- salary as recurring monthly and have it auto-generated like fixed expenses.

BEGIN;

CREATE OR REPLACE FUNCTION generate_recurring_expenses(
  p_branch VARCHAR DEFAULT NULL,
  p_until DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_day INTEGER;
  v_month DATE;
  v_start_month DATE;
  v_end_month DATE;
  v_due_date DATE;
  v_last_day INTEGER;
  v_inserted INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  IF p_until IS NULL THEN
    p_until := CURRENT_DATE;
  END IF;

  FOR v_template IN
    SELECT *
    FROM expenses
    WHERE type IN ('fixed', 'salary')
      AND recurrence_type = 'monthly'
      AND recurring_source_id IS NULL
      AND (p_branch IS NULL OR branch = p_branch)
  LOOP
    v_day := COALESCE(v_template.recurring_day_of_month, EXTRACT(DAY FROM v_template.date)::INT);
    v_day := GREATEST(1, LEAST(31, v_day));

    v_start_month := (date_trunc('month', v_template.date)::DATE + INTERVAL '1 month')::DATE;
    v_end_month := date_trunc('month', p_until)::DATE;
    v_month := v_start_month;

    WHILE v_month <= v_end_month LOOP
      v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_month)::DATE + INTERVAL '1 month - 1 day'))::INT;
      v_due_date := make_date(
        EXTRACT(YEAR FROM v_month)::INT,
        EXTRACT(MONTH FROM v_month)::INT,
        LEAST(v_day, v_last_day)
      );

      IF v_due_date <= p_until THEN
        INSERT INTO expenses (
          branch,
          type,
          category,
          description,
          amount,
          date,
          notes,
          created_by,
          recurrence_type,
          recurring_day_of_month,
          recurring_source_id,
          recurring_month,
          is_auto_generated
        )
        VALUES (
          v_template.branch,
          v_template.type,
          v_template.category,
          v_template.description,
          v_template.amount,
          v_due_date,
          v_template.notes,
          v_template.created_by,
          'monthly',
          v_day,
          v_template.id,
          v_month,
          true
        )
        ON CONFLICT (recurring_source_id, recurring_month) DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;

      v_month := (v_month + INTERVAL '1 month')::DATE;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION generate_recurring_expenses(VARCHAR, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_recurring_expenses(VARCHAR, DATE) TO authenticated;

COMMENT ON FUNCTION generate_recurring_expenses(VARCHAR, DATE)
  IS 'Generates missing monthly recurring rows for fixed-expense and salary templates.';

COMMIT;
