-- المصروفات الشخصية (قسم التفصيل)
-- سجل مستقل عن جدول expenses حتى لا تدخل في أرباح القسم أو رصيد الصندوق.

CREATE TABLE IF NOT EXISTS public.personal_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'network')),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.personal_expenses IS
  'المصروفات الشخصية للمدير — لا تؤثر على الصندوق ولا على صافي ربح قسم التفصيل.';
COMMENT ON COLUMN public.personal_expenses.payment_method IS
  'cash للكاش أو network للشبكة.';

CREATE INDEX IF NOT EXISTS idx_personal_expenses_date
  ON public.personal_expenses (date DESC);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_created_by
  ON public.personal_expenses (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_expenses_admin_all ON public.personal_expenses;
CREATE POLICY personal_expenses_admin_all
  ON public.personal_expenses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
        AND users.role = 'admin'
    )
  );
