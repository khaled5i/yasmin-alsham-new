-- These local fabric invoices have matching historical drafts in Alostaz but
-- predate local remote-id persistence. Block resending until manually reviewed.
UPDATE public.income
SET alostaz_sync_status = 'review_required',
    alostaz_sync_error =
      'A matching historical Alostaz draft exists; review before any retry.'
WHERE branch = 'fabrics'
  AND invoice_number IN (224, 227)
  AND alostaz_invoice_id IS NULL;
