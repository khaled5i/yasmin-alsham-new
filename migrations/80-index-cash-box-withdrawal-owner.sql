-- فهرس يغطي المفتاح الخارجي لمنشئ عملية السحب.
CREATE INDEX IF NOT EXISTS idx_cash_box_withdrawals_created_by
  ON public.cash_box_withdrawals (created_by);
