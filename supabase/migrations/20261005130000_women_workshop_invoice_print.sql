-- ============================================================================
-- Women's-section (المشغل النسائي) invoices on the workshop printer
-- ============================================================================
-- Every sale recorded in the women's section prints an invoice on the
-- alterations print station (the workshop printer):
--   * network: a copy of its Alostaz invoice (branch «ياسمين الشام 2») with the
--     signed ZATCA QR Alostaz issued;
--   * cash: the same layout without an invoice number and without a QR (cash is
--     never sent to Alostaz).
--
-- Only private.enqueue_alterations_print_job_impl changes, and only to admit
-- one new job type, 'women_workshop_receipt':
--   * admin only (the women's-section invoice route itself is admin only);
--   * p_alteration_id carries the women_workshop_transactions id, and that row
--     must be an income row: cash, or network that already has its Alostaz
--     invoice (so the paper always carries the right QR).
-- Everything else in the function is copied verbatim from
-- 20260902120000_alteration_print_stations.sql. Claim/complete/fail RPCs are
-- job-type agnostic and need no change. The station app must be v1.1.0+ to
-- render this job type; older apps fail the job safely (unsupported type).
--
-- Rollback: re-run the original function definition from
-- 20260902120000_alteration_print_stations.sql (lines 625-785).

CREATE OR REPLACE FUNCTION private.enqueue_alterations_print_job_impl(
  p_job_type TEXT,
  p_alteration_id UUID,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_reprint_of UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_key TEXT := btrim(p_idempotency_key);
  v_payload_hash BYTEA;
  v_job_id UUID;
  v_existing_hash BYTEA;
  v_existing_status TEXT;
  v_created BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.id = v_user_id
      AND u.is_active = TRUE
      AND u.role IN ('admin', 'worker')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active_staff_required';
  END IF;

  IF p_job_type IS NULL
     OR p_job_type NOT IN (
       'alteration_slip',
       'alteration_test_slip',
       'women_workshop_receipt'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unsupported_alteration_print_job_type';
  END IF;

  IF p_job_type = 'women_workshop_receipt' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = v_user_id
        AND u.is_active = TRUE
        AND u.role = 'admin'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'active_admin_required_for_women_workshop_receipt';
    END IF;

    -- Cash sales print too (no invoice number, no QR); a network sale prints
    -- only once Alostaz has issued its invoice so the paper carries its QR.
    IF p_alteration_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.women_workshop_transactions AS t
      WHERE t.id = p_alteration_id
        AND t.transaction_kind = 'income'
        AND (
          t.payment_method = 'cash'
          OR (t.payment_method = 'card' AND t.alostaz_invoice_id IS NOT NULL)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'women_workshop_receipt_requires_a_sale_cash_or_invoiced_network';
    END IF;
  END IF;

  IF p_job_type = 'alteration_slip' AND p_alteration_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'alteration_id_is_required_for_alteration_slip';
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(pg_catalog.convert_to(p_payload::TEXT, 'UTF8')) > 524288 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'payload_must_be_a_json_object_not_larger_than_512kb';
  END IF;

  IF v_key IS NULL OR char_length(v_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'idempotency_key_must_be_between_1_and_200_characters';
  END IF;

  IF p_reprint_of IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.print_jobs AS original
    WHERE original.id = p_reprint_of
      AND original.branch = 'alterations'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'reprint_source_job_not_found';
  END IF;

  v_payload_hash := extensions.digest(
    pg_catalog.convert_to(
      p_job_type
      || E'\n'
      || COALESCE(p_alteration_id::TEXT, '')
      || E'\n'
      || p_payload::TEXT
      || E'\n'
      || COALESCE(p_reprint_of::TEXT, ''),
      'UTF8'
    ),
    'sha256'
  );

  INSERT INTO public.print_jobs (
    branch,
    job_type,
    income_id,
    payload,
    status,
    error_message,
    idempotency_key,
    payload_hash,
    open_cash_drawer,
    reprint_of,
    requested_by,
    updated_at,
    next_attempt_at,
    attempt_count,
    max_attempts
  )
  VALUES (
    'alterations',
    p_job_type,
    p_alteration_id,
    p_payload,
    'pending',
    NULL,
    v_key,
    v_payload_hash,
    FALSE,
    p_reprint_of,
    v_user_id,
    clock_timestamp(),
    clock_timestamp(),
    0,
    8
  )
  ON CONFLICT (branch, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id
  INTO v_job_id;

  IF v_job_id IS NOT NULL THEN
    v_created := TRUE;
    v_existing_status := 'pending';
  ELSE
    SELECT j.id, j.payload_hash, j.status
    INTO v_job_id, v_existing_hash, v_existing_status
    FROM public.print_jobs AS j
    WHERE j.branch = 'alterations'
      AND j.idempotency_key = v_key;

    IF v_job_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'idempotent_enqueue_conflict_retry';
    END IF;

    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'idempotency_key_reused_with_different_payload';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'created', v_created,
    'deduplicated', NOT v_created,
    'job_id', v_job_id,
    'status', v_existing_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.enqueue_alterations_print_job_impl(
  TEXT, UUID, JSONB, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enqueue_alterations_print_job_impl(
  TEXT, UUID, JSONB, TEXT, UUID
) TO authenticated;
