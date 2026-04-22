-- Migration 41: تعليق رواتب العمال
-- يضيف جدول لتتبع العمال المعلقين لكل فترة راتب (مسافر / لا يعمل)
-- التعليق يُخرج العامل من إجماليات الرواتب دون حذف بياناته

CREATE TABLE IF NOT EXISTS worker_payroll_suspensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch        TEXT NOT NULL,
  worker_id     UUID NOT NULL,
  worker_name   TEXT NOT NULL,
  payroll_year  INTEGER NOT NULL,
  payroll_month INTEGER NOT NULL,
  reason        TEXT,
  suspended_by  UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (branch, worker_id, payroll_year, payroll_month)
);

-- فهرس للجلب السريع بالشهر
CREATE INDEX IF NOT EXISTS idx_worker_payroll_suspensions_period
  ON worker_payroll_suspensions (branch, payroll_year, payroll_month);

COMMENT ON TABLE worker_payroll_suspensions IS
  'العمال المعلقون لكل فترة راتب — رواتبهم مستثناة من الإجماليات';

-- RLS
ALTER TABLE worker_payroll_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_suspensions"
  ON worker_payroll_suspensions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- القراءة للجميع المصادق عليهم
CREATE POLICY "authenticated_read_suspensions"
  ON worker_payroll_suspensions
  FOR SELECT
  TO authenticated
  USING (true);
