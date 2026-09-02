-- Add locally stored expenses to the women workshop financial ledger.

ALTER TABLE public.women_workshop_transactions
  ADD COLUMN IF NOT EXISTS transaction_kind TEXT NOT NULL DEFAULT 'income',
  ADD COLUMN IF NOT EXISTS expense_category TEXT;

ALTER TABLE public.women_workshop_transactions
  DROP CONSTRAINT IF EXISTS women_workshop_transactions_source_check;

ALTER TABLE public.women_workshop_transactions
  ADD CONSTRAINT women_workshop_transactions_source_check
  CHECK (source IN ('manual_invoice', 'order_measurement', 'manual_expense'));

ALTER TABLE public.women_workshop_transactions
  DROP CONSTRAINT IF EXISTS women_workshop_transactions_transaction_kind_check,
  DROP CONSTRAINT IF EXISTS women_workshop_transactions_expense_category_check,
  DROP CONSTRAINT IF EXISTS women_workshop_transactions_expense_integrity_check;

ALTER TABLE public.women_workshop_transactions
  ADD CONSTRAINT women_workshop_transactions_transaction_kind_check
    CHECK (transaction_kind IN ('income', 'expense')),
  ADD CONSTRAINT women_workshop_transactions_expense_category_check
    CHECK (
      expense_category IS NULL
      OR expense_category IN ('salaries', 'workshop_supplies', 'other')
    ),
  ADD CONSTRAINT women_workshop_transactions_expense_integrity_check
    CHECK (
      (
        transaction_kind = 'income'
        AND source IN ('manual_invoice', 'order_measurement')
        AND expense_category IS NULL
      )
      OR
      (
        transaction_kind = 'expense'
        AND source = 'manual_expense'
        AND expense_category IS NOT NULL
        AND operation_type = 'other'
        AND order_id IS NULL
        AND customer_name IS NULL
        AND alostaz_customer_id IS NULL
        AND alostaz_invoice_id IS NULL
        AND alostaz_invoice_code IS NULL
        AND alostaz_sync_status = 'not_required'
        AND alostaz_sync_token IS NULL
        AND alostaz_sync_error IS NULL
        AND alostaz_synced_at IS NULL
      )
    );

CREATE INDEX IF NOT EXISTS idx_women_workshop_expenses_occurred_at
  ON public.women_workshop_transactions (occurred_at DESC, expense_category)
  WHERE transaction_kind = 'expense';

COMMENT ON COLUMN public.women_workshop_transactions.transaction_kind IS
  'income للمبيعات والإيرادات، أو expense لمصروفات المشغل المحفوظة محلياً.';

COMMENT ON COLUMN public.women_workshop_transactions.expense_category IS
  'تصنيف مصروف المشغل: salaries أو workshop_supplies أو other. يكون فارغاً للإيرادات.';
