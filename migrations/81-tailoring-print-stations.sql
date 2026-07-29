-- ============================================================================
-- Migration 81: reliable Active/Standby print stations for tailoring receipts
-- ============================================================================
-- This migration intentionally leaves the fabrics print-station workflow intact.
-- Tailoring stations use authenticated RPCs only; device secrets are never stored
-- in plaintext and private tables are not exposed through the Data API.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.print_station_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch TEXT NOT NULL DEFAULT 'tailoring',
  name TEXT NOT NULL,
  priority SMALLINT NOT NULL,
  secret_hash BYTEA NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  leadership_blocked_until TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  app_version TEXT,
  printer_ip TEXT,
  printer_reachable BOOLEAN,
  last_error TEXT,
  CONSTRAINT print_station_devices_branch_check
    CHECK (branch = 'tailoring'),
  CONSTRAINT print_station_devices_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT print_station_devices_priority_check
    CHECK (priority BETWEEN 1 AND 1000),
  CONSTRAINT print_station_devices_secret_hash_unique
    UNIQUE (secret_hash)
);

CREATE INDEX IF NOT EXISTS idx_print_station_devices_branch_priority
  ON private.print_station_devices (branch, enabled, priority, id);

CREATE INDEX IF NOT EXISTS idx_print_station_devices_created_by
  ON private.print_station_devices (created_by)
  WHERE created_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.print_station_leases (
  branch TEXT PRIMARY KEY,
  station_id UUID REFERENCES private.print_station_devices(id) ON DELETE SET NULL,
  generation BIGINT NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity'::TIMESTAMPTZ,
  acquired_at TIMESTAMPTZ,
  renewed_at TIMESTAMPTZ,
  CONSTRAINT print_station_leases_branch_check
    CHECK (branch = 'tailoring'),
  CONSTRAINT print_station_leases_generation_check
    CHECK (generation >= 0)
);

CREATE INDEX IF NOT EXISTS idx_print_station_leases_station_id
  ON private.print_station_leases (station_id)
  WHERE station_id IS NOT NULL;

ALTER TABLE private.print_station_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.print_station_leases ENABLE ROW LEVEL SECURITY;

ALTER TABLE private.print_station_devices
  ADD COLUMN IF NOT EXISTS leadership_blocked_until TIMESTAMPTZ;

REVOKE ALL ON TABLE private.print_station_devices
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.print_station_leases
  FROM PUBLIC, anon, authenticated;

INSERT INTO private.print_station_leases (branch)
VALUES ('tailoring')
ON CONFLICT (branch) DO NOTHING;

-- Additive queue metadata. Existing fabrics and tailoring rows remain valid.
ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS payload_hash BYTEA,
  ADD COLUMN IF NOT EXISTS open_cash_drawer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reprint_of UUID,
  ADD COLUMN IF NOT EXISTS requested_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS claimed_by_station_id UUID,
  ADD COLUMN IF NOT EXISTS claim_generation BIGINT,
  ADD COLUMN IF NOT EXISTS job_token UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS job_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bytes_sent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_reprint_of_fkey'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_reprint_of_fkey
      FOREIGN KEY (reprint_of)
      REFERENCES public.print_jobs(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_requested_by_fkey'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_requested_by_fkey
      FOREIGN KEY (requested_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_claimed_by_station_id_fkey'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_claimed_by_station_id_fkey
      FOREIGN KEY (claimed_by_station_id)
      REFERENCES private.print_station_devices(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_attempt_count_check'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_attempt_count_check
      CHECK (attempt_count >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_max_attempts_check'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_max_attempts_check
      CHECK (max_attempts BETWEEN 1 AND 100) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_jobs_bytes_sent_check'
      AND conrelid = 'public.print_jobs'::regclass
  ) THEN
    ALTER TABLE public.print_jobs
      ADD CONSTRAINT print_jobs_bytes_sent_check
      CHECK (bytes_sent >= 0) NOT VALID;
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_print_jobs_branch_idempotency
  ON public.print_jobs (branch, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_jobs_tailoring_claimable
  ON public.print_jobs (next_attempt_at, created_at, id)
  WHERE branch = 'tailoring' AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_print_jobs_tailoring_expired
  ON public.print_jobs (job_lease_expires_at, id)
  WHERE branch = 'tailoring'
    AND status = 'printing'
    AND job_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_jobs_reprint_of
  ON public.print_jobs (reprint_of)
  WHERE reprint_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_jobs_claimed_station
  ON public.print_jobs (claimed_by_station_id)
  WHERE claimed_by_station_id IS NOT NULL;

-- Legacy tailoring claims have no fencing/job token, so their outcome cannot
-- be inferred safely. Surface them for explicit admin review, never auto-retry.
UPDATE public.print_jobs AS legacy
SET status = 'unknown',
    error_message = 'Legacy printing outcome is unknown; review before retrying',
    last_error_code = 'legacy_printing_outcome_unknown',
    job_lease_expires_at = NULL,
    updated_at = clock_timestamp()
WHERE legacy.branch = 'tailoring'
  AND legacy.status = 'printing'
  AND legacy.job_token IS NULL;

-- Existing authenticated policies exposed every branch to every signed-in user,
-- including anonymous Auth users. Keep legacy fabrics access but isolate tailoring.
DROP POLICY IF EXISTS "Authenticated can insert print_jobs"
  ON public.print_jobs;
DROP POLICY IF EXISTS "Authenticated can read print_jobs"
  ON public.print_jobs;
DROP POLICY IF EXISTS "Authenticated can update print_jobs"
  ON public.print_jobs;
DROP POLICY IF EXISTS print_jobs_insert_active_staff_fabrics
  ON public.print_jobs;
DROP POLICY IF EXISTS print_jobs_select_active_staff
  ON public.print_jobs;
DROP POLICY IF EXISTS print_jobs_update_active_staff_fabrics
  ON public.print_jobs;

CREATE POLICY print_jobs_insert_active_staff_fabrics
  ON public.print_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    branch = 'fabrics'
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND u.role IN ('admin', 'worker')
    )
  );

CREATE POLICY print_jobs_select_active_staff
  ON public.print_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND u.role IN ('admin', 'worker')
        AND (branch = 'fabrics' OR u.role = 'admin')
    )
  );

CREATE POLICY print_jobs_update_active_staff_fabrics
  ON public.print_jobs
  FOR UPDATE
  TO authenticated
  USING (
    branch = 'fabrics'
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND u.role IN ('admin', 'worker')
    )
  )
  WITH CHECK (
    branch = 'fabrics'
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND u.role IN ('admin', 'worker')
    )
  );

REVOKE ALL ON TABLE public.print_jobs FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.print_jobs FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_jobs TO authenticated;
GRANT ALL ON TABLE public.print_jobs TO service_role;

-- --------------------------------------------------------------------------
-- Private helpers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.hash_print_station_secret(p_secret TEXT)
RETURNS BYTEA
LANGUAGE SQL
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT extensions.digest(
    pg_catalog.convert_to(p_secret, 'UTF8'),
    'sha256'
  );
$function$;

CREATE OR REPLACE FUNCTION private.require_active_admin()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.id = v_user_id
      AND u.is_active = TRUE
      AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active_admin_required';
  END IF;

  RETURN v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.require_tailoring_print_station(
  p_station_id UUID,
  p_station_secret TEXT
)
RETURNS private.print_station_devices
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_station private.print_station_devices%ROWTYPE;
BEGIN
  IF p_station_id IS NULL
     OR p_station_secret IS NULL
     OR char_length(p_station_secret) NOT BETWEEN 32 AND 256 THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'invalid_station_credentials';
  END IF;

  SELECT d.*
  INTO v_station
  FROM private.print_station_devices AS d
  WHERE d.id = p_station_id
    AND d.branch = 'tailoring'
    AND d.secret_hash = private.hash_print_station_secret(p_station_secret);

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'invalid_station_credentials';
  END IF;

  RETURN v_station;
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_retry_delay(p_attempt_count INTEGER)
RETURNS INTERVAL
LANGUAGE SQL
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_attempt_count <= 1 THEN INTERVAL '1 second'
    WHEN p_attempt_count = 2 THEN INTERVAL '2 seconds'
    WHEN p_attempt_count = 3 THEN INTERVAL '4 seconds'
    WHEN p_attempt_count = 4 THEN INTERVAL '8 seconds'
    WHEN p_attempt_count = 5 THEN INTERVAL '15 seconds'
    ELSE INTERVAL '30 seconds'
  END;
$function$;

CREATE OR REPLACE FUNCTION private.recover_tailoring_station_jobs(
  p_station_id UUID,
  p_generation BIGINT,
  p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_recovered INTEGER := 0;
  v_reason TEXT := left(
    COALESCE(NULLIF(btrim(p_reason), ''), 'station_lease_released'),
    80
  );
BEGIN
  UPDATE public.print_jobs AS j
  SET status = CASE
        WHEN j.send_started_at IS NULL THEN 'pending'
        ELSE 'unknown'
      END,
      next_attempt_at = CASE
        WHEN j.send_started_at IS NULL THEN v_now
        ELSE j.next_attempt_at
      END,
      attempt_count = CASE
        WHEN j.send_started_at IS NULL
          THEN GREATEST(j.attempt_count - 1, 0)
        ELSE j.attempt_count
      END,
      error_message = CASE
        WHEN j.send_started_at IS NULL
          THEN 'Station claim released before sending bytes'
        ELSE 'Print outcome unknown after station leadership ended'
      END,
      last_error_code = v_reason || CASE
        WHEN j.send_started_at IS NULL THEN '_before_begin'
        ELSE '_after_begin'
      END,
      job_lease_expires_at = NULL,
      send_started_at = CASE
        WHEN j.send_started_at IS NULL THEN NULL
        ELSE j.send_started_at
      END,
      updated_at = v_now
  WHERE j.branch = 'tailoring'
    AND j.status = 'printing'
    AND j.job_token IS NOT NULL
    AND j.claimed_by_station_id = p_station_id
    AND (
      p_generation IS NULL
      OR j.claim_generation = p_generation
    );

  GET DIAGNOSTICS v_recovered = ROW_COUNT;
  RETURN v_recovered;
END;
$function$;

REVOKE ALL ON FUNCTION private.hash_print_station_secret(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_active_admin()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.require_tailoring_print_station(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_retry_delay(INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.recover_tailoring_station_jobs(UUID, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- Admin station management
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.create_tailoring_print_station_impl(
  p_name TEXT,
  p_priority INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id UUID;
  v_station private.print_station_devices%ROWTYPE;
  v_secret TEXT;
BEGIN
  v_admin_id := private.require_active_admin();

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'station_name_must_be_between_1_and_80_characters';
  END IF;

  IF p_priority IS NULL OR p_priority NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'station_priority_must_be_between_1_and_1000';
  END IF;

  v_secret := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO private.print_station_devices (
    branch,
    name,
    priority,
    secret_hash,
    enabled,
    created_by
  )
  VALUES (
    'tailoring',
    btrim(p_name),
    p_priority::SMALLINT,
    private.hash_print_station_secret(v_secret),
    TRUE,
    v_admin_id
  )
  RETURNING *
  INTO v_station;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'station', jsonb_build_object(
      'id', v_station.id,
      'name', v_station.name,
      'priority', v_station.priority,
      'enabled', v_station.enabled
    ),
    'pairing_code', v_station.id::TEXT || '.' || v_secret
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.rotate_tailoring_print_station_secret_impl(
  p_station_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_station private.print_station_devices%ROWTYPE;
  v_secret TEXT;
  v_generation BIGINT;
  v_is_holder BOOLEAN := FALSE;
BEGIN
  PERFORM private.require_active_admin();

  v_secret := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE private.print_station_devices AS d
  SET secret_hash = private.hash_print_station_secret(v_secret),
      leadership_blocked_until = NULL,
      updated_at = clock_timestamp()
  WHERE d.id = p_station_id
    AND d.branch = 'tailoring'
  RETURNING *
  INTO v_station;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'tailoring_print_station_not_found';
  END IF;

  SELECT l.generation, l.station_id = p_station_id
  INTO v_generation, v_is_holder
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  IF v_is_holder THEN
    PERFORM private.recover_tailoring_station_jobs(
      p_station_id,
      v_generation,
      'station_secret_rotated'
    );

    UPDATE private.print_station_leases AS l
    SET lease_expires_at = LEAST(l.lease_expires_at, clock_timestamp()),
        renewed_at = clock_timestamp()
    WHERE l.branch = 'tailoring';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'station', jsonb_build_object(
      'id', v_station.id,
      'name', v_station.name,
      'priority', v_station.priority,
      'enabled', v_station.enabled
    ),
    'pairing_code', v_station.id::TEXT || '.' || v_secret
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.set_tailoring_print_station_enabled_impl(
  p_station_id UUID,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_station private.print_station_devices%ROWTYPE;
  v_generation BIGINT;
  v_is_holder BOOLEAN := FALSE;
BEGIN
  PERFORM private.require_active_admin();

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'enabled_value_is_required';
  END IF;

  UPDATE private.print_station_devices AS d
  SET enabled = p_enabled,
      leadership_blocked_until = CASE
        WHEN p_enabled THEN NULL
        ELSE d.leadership_blocked_until
      END,
      updated_at = clock_timestamp()
  WHERE d.id = p_station_id
    AND d.branch = 'tailoring'
  RETURNING *
  INTO v_station;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'tailoring_print_station_not_found';
  END IF;

  IF NOT p_enabled THEN
    SELECT l.generation, l.station_id = p_station_id
    INTO v_generation, v_is_holder
    FROM private.print_station_leases AS l
    WHERE l.branch = 'tailoring'
    FOR UPDATE;

    IF v_is_holder THEN
      PERFORM private.recover_tailoring_station_jobs(
        p_station_id,
        v_generation,
        'station_disabled'
      );

      UPDATE private.print_station_leases AS l
      SET lease_expires_at = LEAST(l.lease_expires_at, clock_timestamp()),
          renewed_at = clock_timestamp()
      WHERE l.branch = 'tailoring';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'station', jsonb_build_object(
      'id', v_station.id,
      'name', v_station.name,
      'priority', v_station.priority,
      'enabled', v_station.enabled
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.release_tailoring_print_station_lease_impl(
  p_station_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_generation BIGINT;
  v_released BOOLEAN := FALSE;
BEGIN
  PERFORM private.require_active_admin();

  UPDATE private.print_station_devices AS d
  SET leadership_blocked_until = clock_timestamp() + INTERVAL '30 seconds',
      updated_at = clock_timestamp()
  WHERE d.id = p_station_id
    AND d.branch = 'tailoring';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'tailoring_print_station_not_found';
  END IF;

  SELECT l.generation
  INTO v_generation
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  UPDATE private.print_station_leases AS l
  SET lease_expires_at = LEAST(l.lease_expires_at, clock_timestamp()),
      renewed_at = clock_timestamp()
  WHERE l.branch = 'tailoring'
    AND l.station_id = p_station_id;

  v_released := FOUND;

  IF v_released THEN
    PERFORM private.recover_tailoring_station_jobs(
      p_station_id,
      v_generation,
      'leadership_released_by_admin'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'released', v_released,
    'generation', COALESCE(v_generation, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.list_tailoring_print_stations_impl()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_stations JSONB;
  v_lease JSONB;
BEGIN
  PERFORM private.require_active_admin();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'priority', d.priority,
        'enabled', d.enabled,
        'leadership_blocked_until', d.leadership_blocked_until,
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        'first_seen_at', d.first_seen_at,
        'last_seen_at', d.last_seen_at,
        'app_version', d.app_version,
        'printer_ip', d.printer_ip,
        'printer_reachable', d.printer_reachable,
        'last_error', d.last_error
      )
      ORDER BY d.priority, d.id
    ),
    '[]'::JSONB
  )
  INTO v_stations
  FROM private.print_station_devices AS d
  WHERE d.branch = 'tailoring';

  SELECT jsonb_build_object(
    'station_id', l.station_id,
    'generation', l.generation,
    'lease_expires_at', l.lease_expires_at,
    'acquired_at', l.acquired_at,
    'renewed_at', l.renewed_at
  )
  INTO v_lease
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
    AND l.station_id IS NOT NULL
    AND l.lease_expires_at > v_now;

  RETURN jsonb_build_object(
    'stations', v_stations,
    'lease', v_lease
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tailoring_print_station(
  p_name TEXT,
  p_priority INTEGER
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.create_tailoring_print_station_impl(p_name, p_priority);
$function$;

CREATE OR REPLACE FUNCTION public.rotate_tailoring_print_station_secret(
  p_station_id UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.rotate_tailoring_print_station_secret_impl(p_station_id);
$function$;

CREATE OR REPLACE FUNCTION public.set_tailoring_print_station_enabled(
  p_station_id UUID,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.set_tailoring_print_station_enabled_impl(
    p_station_id,
    p_enabled
  );
$function$;

CREATE OR REPLACE FUNCTION public.release_tailoring_print_station_lease(
  p_station_id UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.release_tailoring_print_station_lease_impl(p_station_id);
$function$;

CREATE OR REPLACE FUNCTION public.list_tailoring_print_stations()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.list_tailoring_print_stations_impl();
$function$;

REVOKE ALL ON FUNCTION private.create_tailoring_print_station_impl(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.rotate_tailoring_print_station_secret_impl(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.set_tailoring_print_station_enabled_impl(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.release_tailoring_print_station_lease_impl(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.list_tailoring_print_stations_impl()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_tailoring_print_station(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_tailoring_print_station_secret(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_tailoring_print_station_enabled(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tailoring_print_station_lease(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_tailoring_print_stations()
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_tailoring_print_station_impl(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.rotate_tailoring_print_station_secret_impl(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.set_tailoring_print_station_enabled_impl(UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.release_tailoring_print_station_lease_impl(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.list_tailoring_print_stations_impl()
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_tailoring_print_station(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_tailoring_print_station_secret(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tailoring_print_station_enabled(UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_tailoring_print_station_lease(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tailoring_print_stations()
  TO authenticated;

-- --------------------------------------------------------------------------
-- Authenticated web queue RPCs
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enqueue_tailoring_print_job_impl(
  p_job_type TEXT,
  p_income_id UUID,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_open_cash_drawer BOOLEAN,
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
  v_open_cash_drawer BOOLEAN :=
    p_job_type = 'tailoring_cash_drawer_open'
    OR COALESCE(p_open_cash_drawer, FALSE);
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
       'tailoring_order_receipt',
       'tailoring_test_receipt',
       'tailoring_cash_drawer_open'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unsupported_tailoring_print_job_type';
  END IF;

  IF p_job_type = 'tailoring_order_receipt' AND p_income_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'income_id_is_required_for_tailoring_order_receipt';
  END IF;

  IF p_job_type = 'tailoring_cash_drawer_open' THEN
    IF p_income_id IS NULL OR p_open_cash_drawer IS NOT TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'cash_drawer_job_requires_income_id_and_open_cash_drawer';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = v_user_id
        AND u.is_active = TRUE
        AND u.role = 'admin'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'active_admin_required_for_cash_drawer';
    END IF;
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
      AND original.branch = 'tailoring'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'reprint_source_job_not_found';
  END IF;

  v_payload_hash := extensions.digest(
    pg_catalog.convert_to(
      p_job_type
      || E'\n'
      || COALESCE(p_income_id::TEXT, '')
      || E'\n'
      || p_payload::TEXT
      || E'\n'
      || v_open_cash_drawer::TEXT
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
    'tailoring',
    p_job_type,
    p_income_id,
    p_payload,
    'pending',
    NULL,
    v_key,
    v_payload_hash,
    v_open_cash_drawer,
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
    WHERE j.branch = 'tailoring'
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

CREATE OR REPLACE FUNCTION private.retry_tailoring_print_job_impl(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id UUID;
  v_previous_status TEXT;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  v_admin_id := private.require_active_admin();

  SELECT j.status
  INTO v_previous_status
  FROM public.print_jobs AS j
  WHERE j.id = p_job_id
    AND j.branch = 'tailoring'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'tailoring_print_job_not_found';
  END IF;

  IF v_previous_status NOT IN ('error', 'unknown') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'accepted', FALSE,
      'reason', 'job_is_not_retryable',
      'status', v_previous_status
    );
  END IF;

  UPDATE public.print_jobs AS j
  SET status = 'pending',
      error_message = NULL,
      last_error_code = NULL,
      next_attempt_at = clock_timestamp(),
      attempt_count = 0,
      claimed_by_station_id = NULL,
      claim_generation = NULL,
      job_token = NULL,
      claimed_at = NULL,
      job_lease_expires_at = NULL,
      send_started_at = NULL,
      bytes_sent = 0,
      updated_at = clock_timestamp(),
      cancelled_at = NULL,
      cancelled_by = NULL
  WHERE j.id = p_job_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'accepted', TRUE,
    'job_id', v_job.id,
    'previous_status', v_previous_status,
    'status', v_job.status,
    'queued_at', v_job.next_attempt_at,
    'retried_by', v_admin_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.cancel_tailoring_print_job_impl(
  p_job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_admin_id UUID;
  v_previous_status TEXT;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  v_admin_id := private.require_active_admin();

  SELECT j.status
  INTO v_previous_status
  FROM public.print_jobs AS j
  WHERE j.id = p_job_id
    AND j.branch = 'tailoring'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'tailoring_print_job_not_found';
  END IF;

  IF v_previous_status NOT IN ('pending', 'error', 'unknown') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'accepted', FALSE,
      'reason', 'job_cannot_be_cancelled_in_current_state',
      'status', v_previous_status
    );
  END IF;

  UPDATE public.print_jobs AS j
  SET status = 'cancelled',
      claimed_by_station_id = NULL,
      claim_generation = NULL,
      job_token = NULL,
      claimed_at = NULL,
      job_lease_expires_at = NULL,
      send_started_at = NULL,
      updated_at = clock_timestamp(),
      cancelled_at = clock_timestamp(),
      cancelled_by = v_admin_id
  WHERE j.id = p_job_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'accepted', TRUE,
    'job_id', v_job.id,
    'previous_status', v_previous_status,
    'status', v_job.status,
    'cancelled_at', v_job.cancelled_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_tailoring_print_job(
  p_job_type TEXT,
  p_income_id UUID,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_open_cash_drawer BOOLEAN,
  p_reprint_of UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.enqueue_tailoring_print_job_impl(
    p_job_type,
    p_income_id,
    p_payload,
    p_idempotency_key,
    p_open_cash_drawer,
    p_reprint_of
  );
$function$;

CREATE OR REPLACE FUNCTION public.retry_tailoring_print_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.retry_tailoring_print_job_impl(p_job_id);
$function$;

CREATE OR REPLACE FUNCTION public.cancel_tailoring_print_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.cancel_tailoring_print_job_impl(p_job_id);
$function$;

REVOKE ALL ON FUNCTION private.enqueue_tailoring_print_job_impl(
  TEXT, UUID, JSONB, TEXT, BOOLEAN, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.retry_tailoring_print_job_impl(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cancel_tailoring_print_job_impl(UUID)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enqueue_tailoring_print_job(
  TEXT, UUID, JSONB, TEXT, BOOLEAN, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_tailoring_print_job(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_tailoring_print_job(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.enqueue_tailoring_print_job_impl(
  TEXT, UUID, JSONB, TEXT, BOOLEAN, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.retry_tailoring_print_job_impl(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.cancel_tailoring_print_job_impl(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_tailoring_print_job(
  TEXT, UUID, JSONB, TEXT, BOOLEAN, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_tailoring_print_job(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tailoring_print_job(UUID)
  TO authenticated;

-- --------------------------------------------------------------------------
-- Android station runtime RPCs
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.tailoring_station_heartbeat_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_app_version TEXT,
  p_printer_ip TEXT,
  p_printer_reachable BOOLEAN,
  p_last_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_lease private.print_station_leases%ROWTYPE;
  v_role TEXT := 'standby';
  v_higher_priority_ready BOOLEAN := FALSE;
  v_pending_count BIGINT := 0;
  v_unknown_count BIGINT := 0;
  v_active_station_id UUID;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  UPDATE private.print_station_devices AS d
  SET first_seen_at = COALESCE(d.first_seen_at, v_now),
      last_seen_at = v_now,
      updated_at = v_now,
      app_version = left(NULLIF(btrim(p_app_version), ''), 80),
      printer_ip = left(NULLIF(btrim(p_printer_ip), ''), 64),
      printer_reachable = COALESCE(p_printer_reachable, FALSE),
      last_error = left(NULLIF(btrim(p_last_error), ''), 500)
  WHERE d.id = p_station_id
  RETURNING *
  INTO v_station;

  INSERT INTO private.print_station_leases (branch)
  VALUES ('tailoring')
  ON CONFLICT (branch) DO NOTHING;

  SELECT l.*
  INTO v_lease
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  IF NOT v_station.enabled
     OR v_station.leadership_blocked_until > v_now THEN
    IF v_lease.station_id = p_station_id THEN
      UPDATE private.print_station_leases AS l
      SET lease_expires_at = LEAST(l.lease_expires_at, v_now),
          renewed_at = v_now
      WHERE l.branch = 'tailoring'
      RETURNING *
      INTO v_lease;
    END IF;
  ELSIF v_lease.station_id = p_station_id
        AND v_lease.lease_expires_at > v_now
        AND COALESCE(p_printer_reachable, FALSE) THEN
    -- Do not shorten the 45-second safety lease granted by begin_send.
    UPDATE private.print_station_leases AS l
    SET lease_expires_at = GREATEST(
          l.lease_expires_at,
          v_now + INTERVAL '20 seconds'
        ),
        renewed_at = v_now
    WHERE l.branch = 'tailoring'
    RETURNING *
    INTO v_lease;
    v_role := 'active';
  ELSIF v_lease.station_id = p_station_id
        AND NOT COALESCE(p_printer_reachable, FALSE) THEN
    -- A holder that cannot reach the printer must yield immediately.
    UPDATE private.print_station_leases AS l
    SET lease_expires_at = LEAST(l.lease_expires_at, v_now),
        renewed_at = v_now
    WHERE l.branch = 'tailoring'
    RETURNING *
    INTO v_lease;
  ELSIF v_lease.lease_expires_at <= v_now
        AND COALESCE(p_printer_reachable, FALSE) THEN
    -- Smaller priority wins after cold start. A standby waits ten seconds for
    -- an unseen preferred station, and twenty seconds for a recently healthy one.
    SELECT EXISTS (
      SELECT 1
      FROM private.print_station_devices AS preferred
      WHERE preferred.branch = 'tailoring'
        AND preferred.enabled = TRUE
        AND (
          preferred.leadership_blocked_until IS NULL
          OR preferred.leadership_blocked_until <= v_now
        )
        AND preferred.priority < v_station.priority
        AND (
          (
            preferred.printer_reachable IS TRUE
            AND preferred.last_seen_at > v_now - INTERVAL '20 seconds'
          )
          OR (
            preferred.last_seen_at IS NULL
            AND v_station.first_seen_at > v_now - INTERVAL '10 seconds'
          )
        )
    )
    INTO v_higher_priority_ready;

    IF NOT v_higher_priority_ready THEN
      UPDATE private.print_station_leases AS l
      SET station_id = p_station_id,
          generation = l.generation + 1,
          lease_expires_at = v_now + INTERVAL '20 seconds',
          acquired_at = v_now,
          renewed_at = v_now
      WHERE l.branch = 'tailoring'
      RETURNING *
      INTO v_lease;
      v_role := 'active';
    END IF;
  END IF;

  IF v_lease.station_id IS NOT NULL
     AND v_lease.lease_expires_at > v_now THEN
    v_active_station_id := v_lease.station_id;
  END IF;

  SELECT count(*)
  INTO v_pending_count
  FROM public.print_jobs AS j
  WHERE j.branch = 'tailoring'
    AND j.status = 'pending'
    AND j.next_attempt_at <= v_now;

  SELECT count(*)
  INTO v_unknown_count
  FROM public.print_jobs AS j
  WHERE j.branch = 'tailoring'
    AND j.status = 'unknown';

  RETURN jsonb_build_object(
    'ok', TRUE,
    'role', v_role,
    'reason', CASE
      WHEN NOT v_station.enabled THEN 'station_disabled'
      WHEN v_station.leadership_blocked_until > v_now
        THEN 'leadership_temporarily_blocked'
      WHEN NOT COALESCE(p_printer_reachable, FALSE) THEN 'printer_unreachable'
      ELSE NULL
    END,
    'generation', v_lease.generation,
    'lease_expires_at', CASE
      WHEN v_active_station_id IS NULL THEN NULL
      ELSE v_lease.lease_expires_at
    END,
    'active_station_id', v_active_station_id,
    'pending_count', v_pending_count,
    'unknown_count', v_unknown_count,
    'server_time', v_now,
    'poll_after_ms', CASE WHEN v_role = 'active' THEN 2000 ELSE 5000 END,
    'heartbeat_interval_ms', 5000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_station_claim_job_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_lease private.print_station_leases%ROWTYPE;
  v_job public.print_jobs%ROWTYPE;
  v_job_id UUID;
  v_job_token UUID;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  SELECT l.*
  INTO v_lease
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  IF NOT v_station.enabled
     OR v_station.leadership_blocked_until > v_now
     OR v_station.printer_reachable IS NOT TRUE
     OR v_station.last_seen_at IS NULL
     OR v_station.last_seen_at <= v_now - INTERVAL '20 seconds'
     OR v_lease.station_id IS DISTINCT FROM p_station_id
     OR v_lease.generation IS DISTINCT FROM p_generation
     OR v_lease.lease_expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'role', 'standby',
      'generation', COALESCE(v_lease.generation, 0),
      'job', NULL,
      'reason', 'active_lease_required'
    );
  END IF;

  UPDATE private.print_station_leases AS l
  SET lease_expires_at = GREATEST(
        l.lease_expires_at,
        v_now + INTERVAL '20 seconds'
      ),
      renewed_at = v_now
  WHERE l.branch = 'tailoring'
  RETURNING *
  INTO v_lease;

  -- Idempotent claim: if the HTTP response was lost, return the same unstarted
  -- job instead of reserving a second one for this station.
  SELECT existing.*
  INTO v_job
  FROM public.print_jobs AS existing
  WHERE existing.branch = 'tailoring'
    AND existing.status = 'printing'
    AND existing.claimed_by_station_id = p_station_id
    AND existing.claim_generation = p_generation
    AND existing.job_token IS NOT NULL
    AND existing.send_started_at IS NULL
    AND existing.job_lease_expires_at > v_now
  ORDER BY existing.claimed_at, existing.id
  LIMIT 1
  FOR UPDATE;

  IF v_job.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'role', 'active',
      'generation', v_lease.generation,
      'job', jsonb_build_object(
        'id', v_job.id,
        'job_token', v_job.job_token,
        'income_id', v_job.income_id,
        'job_type', v_job.job_type,
        'payload', v_job.payload,
        'open_cash_drawer', v_job.open_cash_drawer,
        'attempt_count', v_job.attempt_count,
        'lease_expires_at', v_job.job_lease_expires_at
      )
    );
  END IF;

  -- Recover only jobs claimed by this new protocol. Legacy printing rows have
  -- no job token and remain untouched because their print outcome is unknowable.
  UPDATE public.print_jobs AS expired
  SET status = CASE
        WHEN expired.send_started_at IS NOT NULL THEN 'unknown'
        ELSE 'pending'
      END,
      next_attempt_at = CASE
        WHEN expired.send_started_at IS NULL THEN v_now
        ELSE expired.next_attempt_at
      END,
      attempt_count = CASE
        WHEN expired.send_started_at IS NULL
          THEN GREATEST(expired.attempt_count - 1, 0)
        ELSE expired.attempt_count
      END,
      error_message = CASE
        WHEN expired.send_started_at IS NOT NULL
          THEN 'Print outcome unknown after station generation was fenced'
        ELSE 'Station claim was fenced before sending bytes'
      END,
      last_error_code = CASE
        WHEN expired.send_started_at IS NOT NULL
          THEN 'station_generation_fenced_after_begin'
        ELSE 'station_generation_fenced_before_begin'
      END,
      job_lease_expires_at = NULL,
      updated_at = v_now
  WHERE expired.branch = 'tailoring'
    AND expired.status = 'printing'
    AND expired.job_token IS NOT NULL
    AND (
      expired.job_lease_expires_at IS NULL
      OR expired.job_lease_expires_at <= v_now
      OR expired.claimed_by_station_id IS DISTINCT FROM p_station_id
      OR expired.claim_generation IS DISTINCT FROM p_generation
    );

  SELECT queued.id
  INTO v_job_id
  FROM public.print_jobs AS queued
  WHERE queued.branch = 'tailoring'
    AND queued.status = 'pending'
    AND queued.next_attempt_at <= v_now
    AND queued.attempt_count < queued.max_attempts
  ORDER BY queued.next_attempt_at, queued.created_at, queued.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'role', 'active',
      'generation', v_lease.generation,
      'job', NULL
    );
  END IF;

  v_job_token := extensions.gen_random_uuid();

  UPDATE public.print_jobs AS claimed
  SET status = 'printing',
      claimed_by_station_id = p_station_id,
      claim_generation = p_generation,
      job_token = v_job_token,
      claimed_at = v_now,
      job_lease_expires_at = v_now + INTERVAL '120 seconds',
      send_started_at = NULL,
      bytes_sent = 0,
      attempt_count = claimed.attempt_count + 1,
      error_message = NULL,
      last_error_code = NULL,
      updated_at = v_now
  WHERE claimed.id = v_job_id
    AND claimed.status = 'pending'
  RETURNING *
  INTO v_job;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'role', 'active',
      'generation', v_lease.generation,
      'job', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'role', 'active',
    'generation', v_lease.generation,
    'job', jsonb_build_object(
      'id', v_job.id,
      'job_token', v_job.job_token,
      'income_id', v_job.income_id,
      'job_type', v_job.job_type,
      'payload', v_job.payload,
      'open_cash_drawer', v_job.open_cash_drawer,
      'attempt_count', v_job.attempt_count,
      'lease_expires_at', v_job.job_lease_expires_at
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_station_begin_send_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT,
  p_job_id UUID,
  p_job_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_lease private.print_station_leases%ROWTYPE;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  SELECT l.*
  INTO v_lease
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  IF NOT v_station.enabled
     OR v_station.leadership_blocked_until > v_now
     OR v_station.printer_reachable IS NOT TRUE
     OR v_lease.station_id IS DISTINCT FROM p_station_id
     OR v_lease.generation IS DISTINCT FROM p_generation
     OR v_lease.lease_expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'stale_station_generation'
    );
  END IF;

  SELECT j.*
  INTO v_job
  FROM public.print_jobs AS j
  WHERE j.id = p_job_id
    AND j.branch = 'tailoring'
  FOR UPDATE;

  IF v_job.id IS NULL
     OR v_job.status <> 'printing'
     OR v_job.claimed_by_station_id IS DISTINCT FROM p_station_id
     OR v_job.claim_generation IS DISTINCT FROM p_generation
     OR v_job.job_token IS DISTINCT FROM p_job_token
     OR v_job.job_lease_expires_at <= v_now THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'stale_or_invalid_job_claim'
    );
  END IF;

  UPDATE private.print_station_leases AS l
  SET lease_expires_at = GREATEST(
        l.lease_expires_at,
        v_now + INTERVAL '45 seconds'
      ),
      renewed_at = v_now
  WHERE l.branch = 'tailoring';

  UPDATE public.print_jobs AS j
  SET send_started_at = COALESCE(j.send_started_at, v_now),
      job_lease_expires_at = GREATEST(
        j.job_lease_expires_at,
        v_now + INTERVAL '120 seconds'
      ),
      updated_at = v_now
  WHERE j.id = p_job_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'accepted', TRUE,
    'reason', CASE
      WHEN v_job.send_started_at < v_now THEN 'already_started'
      ELSE 'send_started'
    END,
    'lease_expires_at', v_job.job_lease_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_station_complete_job_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_job_id UUID,
  p_job_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  SELECT j.*
  INTO v_job
  FROM public.print_jobs AS j
  WHERE j.id = p_job_id
    AND j.branch = 'tailoring'
  FOR UPDATE;

  IF v_job.id IS NULL
     OR v_job.claimed_by_station_id IS DISTINCT FROM p_station_id
     OR v_job.job_token IS DISTINCT FROM p_job_token THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'stale_or_invalid_job_token'
    );
  END IF;

  IF v_job.status = 'done' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', TRUE,
      'reason', 'already_completed',
      'status', v_job.status,
      'printed_at', v_job.printed_at
    );
  END IF;

  IF v_job.status NOT IN ('printing', 'unknown')
     OR v_job.send_started_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'job_was_not_in_send_phase',
      'status', v_job.status
    );
  END IF;

  UPDATE public.print_jobs AS j
  SET status = 'done',
      printed_at = COALESCE(j.printed_at, v_now),
      error_message = NULL,
      last_error_code = NULL,
      job_lease_expires_at = NULL,
      updated_at = v_now
  WHERE j.id = p_job_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'accepted', TRUE,
    'reason', 'completed',
    'status', v_job.status,
    'printed_at', v_job.printed_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_station_fail_job_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_job_id UUID,
  p_job_token UUID,
  p_bytes_sent INTEGER,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_job public.print_jobs%ROWTYPE;
  v_bytes_sent INTEGER := GREATEST(COALESCE(p_bytes_sent, 0), 0);
  v_error_code TEXT := left(NULLIF(btrim(p_error_code), ''), 100);
  v_error_message TEXT := left(NULLIF(btrim(p_error_message), ''), 500);
  v_status TEXT;
  v_retry_at TIMESTAMPTZ;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  SELECT j.*
  INTO v_job
  FROM public.print_jobs AS j
  WHERE j.id = p_job_id
    AND j.branch = 'tailoring'
  FOR UPDATE;

  IF v_job.id IS NULL
     OR v_job.claimed_by_station_id IS DISTINCT FROM p_station_id
     OR v_job.job_token IS DISTINCT FROM p_job_token THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'stale_or_invalid_job_token'
    );
  END IF;

  IF v_job.status IN ('pending', 'error', 'unknown') THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', TRUE,
      'reason', 'failure_already_recorded',
      'status', v_job.status,
      'retry_at', CASE
        WHEN v_job.status = 'pending' THEN v_job.next_attempt_at
        ELSE NULL
      END,
      'next_attempt_at', CASE
        WHEN v_job.status = 'pending' THEN v_job.next_attempt_at
        ELSE NULL
      END
    );
  END IF;

  IF v_job.status <> 'printing' THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'accepted', FALSE,
      'reason', 'job_is_not_printing',
      'status', v_job.status
    );
  END IF;

  IF v_bytes_sent > 0
     OR v_error_code = 'station_restarted_after_begin' THEN
    -- Partial/raw TCP delivery can never be retried automatically without a
    -- real printer acknowledgement because that could print a duplicate.
    v_status := 'unknown';
    v_retry_at := NULL;
  ELSIF v_job.attempt_count >= v_job.max_attempts THEN
    v_status := 'error';
    v_retry_at := NULL;
  ELSE
    v_status := 'pending';
    v_retry_at := v_now
      + private.tailoring_retry_delay(v_job.attempt_count);
  END IF;

  UPDATE public.print_jobs AS j
  SET status = v_status,
      bytes_sent = GREATEST(j.bytes_sent, v_bytes_sent),
      error_message = COALESCE(v_error_message, v_error_code, 'print_failed'),
      last_error_code = COALESCE(v_error_code, 'print_failed'),
      next_attempt_at = COALESCE(v_retry_at, j.next_attempt_at),
      job_lease_expires_at = NULL,
      send_started_at = CASE
        WHEN v_status = 'unknown' THEN j.send_started_at
        ELSE NULL
      END,
      updated_at = v_now
  WHERE j.id = p_job_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'accepted', TRUE,
    'reason', CASE
      WHEN v_status = 'unknown' THEN 'print_outcome_unknown'
      WHEN v_status = 'error' THEN 'maximum_attempts_reached'
      ELSE 'retry_scheduled'
    END,
    'status', v_job.status,
    'retry_at', v_retry_at,
    'next_attempt_at', v_retry_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.tailoring_station_release_impl(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_station private.print_station_devices%ROWTYPE;
  v_lease private.print_station_leases%ROWTYPE;
  v_released BOOLEAN := FALSE;
BEGIN
  v_station := private.require_tailoring_print_station(
    p_station_id,
    p_station_secret
  );

  UPDATE private.print_station_devices AS d
  SET printer_reachable = FALSE,
      last_seen_at = v_now,
      updated_at = v_now
  WHERE d.id = p_station_id;

  SELECT l.*
  INTO v_lease
  FROM private.print_station_leases AS l
  WHERE l.branch = 'tailoring'
  FOR UPDATE;

  IF v_lease.station_id = p_station_id
     AND v_lease.generation = p_generation THEN
    PERFORM private.recover_tailoring_station_jobs(
      p_station_id,
      p_generation,
      'station_released'
    );

    UPDATE private.print_station_leases AS l
    SET lease_expires_at = LEAST(l.lease_expires_at, v_now),
        renewed_at = v_now
    WHERE l.branch = 'tailoring'
    RETURNING *
    INTO v_lease;
    v_released := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'released', v_released,
    'generation', v_lease.generation
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_heartbeat(
  p_station_id UUID,
  p_station_secret TEXT,
  p_app_version TEXT,
  p_printer_ip TEXT,
  p_printer_reachable BOOLEAN,
  p_last_error TEXT
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_heartbeat_impl(
    p_station_id,
    p_station_secret,
    p_app_version,
    p_printer_ip,
    p_printer_reachable,
    p_last_error
  );
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_claim_job(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_claim_job_impl(
    p_station_id,
    p_station_secret,
    p_generation
  );
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_begin_send(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT,
  p_job_id UUID,
  p_job_token UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_begin_send_impl(
    p_station_id,
    p_station_secret,
    p_generation,
    p_job_id,
    p_job_token
  );
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_complete_job(
  p_station_id UUID,
  p_station_secret TEXT,
  p_job_id UUID,
  p_job_token UUID
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_complete_job_impl(
    p_station_id,
    p_station_secret,
    p_job_id,
    p_job_token
  );
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_fail_job(
  p_station_id UUID,
  p_station_secret TEXT,
  p_job_id UUID,
  p_job_token UUID,
  p_bytes_sent INTEGER,
  p_error_code TEXT,
  p_error_message TEXT
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_fail_job_impl(
    p_station_id,
    p_station_secret,
    p_job_id,
    p_job_token,
    p_bytes_sent,
    p_error_code,
    p_error_message
  );
$function$;

CREATE OR REPLACE FUNCTION public.tailoring_station_release(
  p_station_id UUID,
  p_station_secret TEXT,
  p_generation BIGINT
)
RETURNS JSONB
LANGUAGE SQL
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.tailoring_station_release_impl(
    p_station_id,
    p_station_secret,
    p_generation
  );
$function$;

REVOKE ALL ON FUNCTION private.tailoring_station_heartbeat_impl(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_station_claim_job_impl(
  UUID, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_station_begin_send_impl(
  UUID, TEXT, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_station_complete_job_impl(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_station_fail_job_impl(
  UUID, TEXT, UUID, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tailoring_station_release_impl(
  UUID, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.tailoring_station_heartbeat(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tailoring_station_claim_job(
  UUID, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tailoring_station_begin_send(
  UUID, TEXT, BIGINT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tailoring_station_complete_job(
  UUID, TEXT, UUID, UUID
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tailoring_station_fail_job(
  UUID, TEXT, UUID, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tailoring_station_release(
  UUID, TEXT, BIGINT
) FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO anon;

GRANT EXECUTE ON FUNCTION private.tailoring_station_heartbeat_impl(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION private.tailoring_station_claim_job_impl(
  UUID, TEXT, BIGINT
) TO anon;
GRANT EXECUTE ON FUNCTION private.tailoring_station_begin_send_impl(
  UUID, TEXT, BIGINT, UUID, UUID
) TO anon;
GRANT EXECUTE ON FUNCTION private.tailoring_station_complete_job_impl(
  UUID, TEXT, UUID, UUID
) TO anon;
GRANT EXECUTE ON FUNCTION private.tailoring_station_fail_job_impl(
  UUID, TEXT, UUID, UUID, INTEGER, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION private.tailoring_station_release_impl(
  UUID, TEXT, BIGINT
) TO anon;

GRANT EXECUTE ON FUNCTION public.tailoring_station_heartbeat(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.tailoring_station_claim_job(
  UUID, TEXT, BIGINT
) TO anon;
GRANT EXECUTE ON FUNCTION public.tailoring_station_begin_send(
  UUID, TEXT, BIGINT, UUID, UUID
) TO anon;
GRANT EXECUTE ON FUNCTION public.tailoring_station_complete_job(
  UUID, TEXT, UUID, UUID
) TO anon;
GRANT EXECUTE ON FUNCTION public.tailoring_station_fail_job(
  UUID, TEXT, UUID, UUID, INTEGER, TEXT, TEXT
) TO anon;
GRANT EXECUTE ON FUNCTION public.tailoring_station_release(
  UUID, TEXT, BIGINT
) TO anon;

-- Make the newly created RPC surface visible after explicit grants.
NOTIFY pgrst, 'reload schema';
