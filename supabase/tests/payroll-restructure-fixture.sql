-- Disposable PGlite fixtures only. Never run this file against the application database.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE TABLE public.users(id uuid PRIMARY KEY, full_name text, role text, is_active boolean DEFAULT true);
CREATE TABLE public.workers(id uuid PRIMARY KEY, user_id uuid, worker_type text);
CREATE TABLE public.orders(id uuid PRIMARY KEY, worker_id uuid, worker_price numeric, worker_bonus numeric, worker_completed_at timestamptz, status text);
CREATE TABLE public.worker_payroll_period_locks(
  id uuid DEFAULT gen_random_uuid(), branch varchar, payroll_year integer, payroll_month integer,
  is_locked boolean DEFAULT false, lock_reason text, locked_at timestamptz, locked_by uuid,
  UNIQUE(branch,payroll_year,payroll_month)
);
CREATE TABLE public.worker_payroll_months(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch varchar, worker_id text, worker_name text,
  payroll_year integer, payroll_month integer, salary_type varchar DEFAULT 'fixed',
  basic_salary numeric DEFAULT 0, fixed_salary_value numeric DEFAULT 0, works_total numeric DEFAULT 0,
  piece_count numeric DEFAULT 0, piece_rate numeric DEFAULT 0, piece_total numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0, overtime_rate numeric DEFAULT 1, overtime_total numeric DEFAULT 0,
  allowances_total numeric DEFAULT 0, deductions_total numeric DEFAULT 0, advances_total numeric DEFAULT 0,
  total_paid numeric DEFAULT 0, net_due numeric DEFAULT 0, remaining_due numeric DEFAULT 0,
  salary_status text DEFAULT 'zero', is_locked boolean DEFAULT false, locked_at timestamptz, locked_by uuid,
  created_by uuid, updated_by uuid, updated_at timestamptz,
  UNIQUE(branch,worker_id,payroll_year,payroll_month)
);
CREATE TABLE public.worker_payroll_operations(id uuid DEFAULT gen_random_uuid(),branch varchar,operation_type text);
CREATE TABLE public.worker_payroll_suspensions(branch varchar,worker_id uuid,payroll_year integer,payroll_month integer);
CREATE TABLE public.worker_payroll_persistent_suspensions(branch varchar,worker_id uuid,start_year integer,start_month integer);
CREATE FUNCTION public.worker_payroll_status(p_net numeric,p_paid numeric) RETURNS text LANGUAGE sql AS $$
 SELECT CASE WHEN p_net<0 THEN 'negative' WHEN p_net=0 THEN 'zero' WHEN p_paid>=p_net THEN 'paid' WHEN p_paid>0 THEN 'partial' ELSE 'unpaid' END
$$;
