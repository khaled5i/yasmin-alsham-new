-- Migration 47: التعليق الدائم للعمال عبر الشهور
-- يضيف جدولاً للتعليق المستمر (يسري على جميع الشهور المستقبلية تلقائياً)
-- بدلاً من التعليق الشهري المؤقت، يبقى التعليق فعّالاً حتى إلغاؤه صراحةً
-- عند التعليق: لا يُحسب راتب الشهر، والديون المتراكمة لا تتناقص

CREATE TABLE IF NOT EXISTS worker_payroll_persistent_suspensions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  branch       TEXT    NOT NULL,
  worker_id    TEXT    NOT NULL,
  worker_name  TEXT    NOT NULL,
  start_year   INTEGER NOT NULL,
  start_month  INTEGER NOT NULL,
  reason       TEXT,
  suspended_by UUID    REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- عامل واحد يمكنه أن يكون معلقاً تعليقاً دائماً واحداً فقط لكل فرع
  UNIQUE (branch, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_payroll_persistent_suspensions_branch
  ON worker_payroll_persistent_suspensions (branch);

COMMENT ON TABLE worker_payroll_persistent_suspensions IS
  'تعليق دائم للعامل — يسري من start_year/start_month وما بعده حتى الحذف';

-- RLS
ALTER TABLE worker_payroll_persistent_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_persistent_suspensions"
  ON worker_payroll_persistent_suspensions
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

CREATE POLICY "authenticated_read_persistent_suspensions"
  ON worker_payroll_persistent_suspensions
  FOR SELECT
  TO authenticated
  USING (true);
