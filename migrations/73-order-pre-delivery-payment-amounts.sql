-- ============================================================================
-- فصل إجمالي المدفوع قبل التسليم بين الكاش والشبكة
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pre_delivery_cash_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS pre_delivery_network_amount DECIMAL(12, 2);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_pre_delivery_cash_nonnegative,
  ADD CONSTRAINT orders_pre_delivery_cash_nonnegative
    CHECK (pre_delivery_cash_amount IS NULL OR pre_delivery_cash_amount >= 0),
  DROP CONSTRAINT IF EXISTS orders_pre_delivery_network_nonnegative,
  ADD CONSTRAINT orders_pre_delivery_network_nonnegative
    CHECK (pre_delivery_network_amount IS NULL OR pre_delivery_network_amount >= 0),
  DROP CONSTRAINT IF EXISTS orders_pre_delivery_amounts_complete,
  ADD CONSTRAINT orders_pre_delivery_amounts_complete
    CHECK (
      (pre_delivery_cash_amount IS NULL AND pre_delivery_network_amount IS NULL)
      OR
      (pre_delivery_cash_amount IS NOT NULL AND pre_delivery_network_amount IS NOT NULL)
    ),
  DROP CONSTRAINT IF EXISTS orders_pre_delivery_amounts_not_overpaid,
  ADD CONSTRAINT orders_pre_delivery_amounts_not_overpaid
    CHECK (
      pre_delivery_cash_amount IS NULL
      OR pre_delivery_cash_amount + pre_delivery_network_amount <= COALESCE(paid_amount, 0)
    );

COMMENT ON COLUMN orders.pre_delivery_cash_amount
  IS 'إجمالي الدفعات النقدية المحصلة قبل تسليم الطلب';

COMMENT ON COLUMN orders.pre_delivery_network_amount
  IS 'إجمالي دفعات الشبكة المحصلة قبل تسليم الطلب';
