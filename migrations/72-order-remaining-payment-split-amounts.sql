-- ============================================================================
-- تسجيل توزيع الدفعة المتبقية بين الكاش والشبكة عند تسليم الطلب
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS remaining_cash_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS remaining_network_amount DECIMAL(12, 2);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_remaining_cash_amount_nonnegative,
  ADD CONSTRAINT orders_remaining_cash_amount_nonnegative
    CHECK (remaining_cash_amount IS NULL OR remaining_cash_amount >= 0),
  DROP CONSTRAINT IF EXISTS orders_remaining_network_amount_nonnegative,
  ADD CONSTRAINT orders_remaining_network_amount_nonnegative
    CHECK (remaining_network_amount IS NULL OR remaining_network_amount >= 0),
  DROP CONSTRAINT IF EXISTS orders_remaining_payment_amounts_complete,
  ADD CONSTRAINT orders_remaining_payment_amounts_complete
    CHECK (
      (remaining_cash_amount IS NULL AND remaining_network_amount IS NULL)
      OR
      (remaining_cash_amount IS NOT NULL AND remaining_network_amount IS NOT NULL)
    ),
  DROP CONSTRAINT IF EXISTS orders_remaining_split_method_values,
  ADD CONSTRAINT orders_remaining_split_method_values
    CHECK (
      remaining_cash_amount IS NULL
      OR remaining_payment_method NOT IN ('cash', 'card', 'split')
      OR (remaining_payment_method = 'cash'
          AND remaining_cash_amount > 0
          AND remaining_network_amount = 0)
      OR (remaining_payment_method = 'card'
          AND remaining_cash_amount = 0
          AND remaining_network_amount > 0)
      OR (remaining_payment_method = 'split'
          AND remaining_cash_amount > 0
          AND remaining_network_amount > 0)
    ),
  DROP CONSTRAINT IF EXISTS orders_remaining_payment_amounts_match_paid,
  ADD CONSTRAINT orders_remaining_payment_amounts_match_paid
    CHECK (
      remaining_cash_amount IS NULL
      OR remaining_cash_amount + remaining_network_amount
        = GREATEST(COALESCE(paid_amount, 0) - COALESCE(deposit_amount, 0), 0)
    );

COMMENT ON COLUMN orders.remaining_cash_amount
  IS 'قيمة الكاش من الدفعة المتبقية التي تم تحصيلها عند التسليم';

COMMENT ON COLUMN orders.remaining_network_amount
  IS 'قيمة الشبكة من الدفعة المتبقية التي تم تحصيلها عند التسليم';

COMMENT ON COLUMN orders.remaining_payment_method
  IS 'طريقة دفع المتبقي عند التسليم: cash أو card أو split عند الجمع بين الكاش والشبكة';
