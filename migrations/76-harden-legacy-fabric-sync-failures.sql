-- Legacy failures predate outcome classification. Treat them as ambiguous so
-- they cannot be retried into duplicate invoices without first being reviewed.
UPDATE public.income
SET alostaz_sync_status = 'review_required',
    alostaz_sync_error = COALESCE(
      alostaz_sync_error,
      'Legacy failed dispatch requires review before retrying.'
    )
WHERE branch = 'fabrics'
  AND alostaz_sync_status = 'failed'
  AND alostaz_invoice_id IS NULL
  AND alostaz_sync_token IS NULL;
