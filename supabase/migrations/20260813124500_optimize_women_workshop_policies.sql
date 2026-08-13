-- Optimize women workshop transaction policies and foreign-key lookups.

CREATE INDEX IF NOT EXISTS idx_women_workshop_order_id
  ON public.women_workshop_transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_women_workshop_created_by
  ON public.women_workshop_transactions (created_by)
  WHERE created_by IS NOT NULL;

DROP POLICY IF EXISTS "women_workshop_admin_manage" ON public.women_workshop_transactions;

CREATE POLICY "women_workshop_admin_insert"
  ON public.women_workshop_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  );

CREATE POLICY "women_workshop_admin_update"
  ON public.women_workshop_transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  );

CREATE POLICY "women_workshop_admin_delete"
  ON public.women_workshop_transactions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND (
          users.role = 'admin'
          OR (
            users.role = 'worker'
            AND EXISTS (
              SELECT 1
              FROM public.workers
              WHERE workers.user_id = auth.uid()
                AND workers.worker_type = 'general_manager'
            )
          )
        )
    )
  );

