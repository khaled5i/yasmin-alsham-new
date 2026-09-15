-- Record which fitting accessories the client brought with the dress (heel / bra / corset).
-- The workshop slip prints both halves of the answer, so an empty array is a real
-- statement ("nothing was brought"), not missing data.

ALTER TABLE public.alterations
  ADD COLUMN IF NOT EXISTS brought_accessories TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.alterations
  DROP CONSTRAINT IF EXISTS alterations_brought_accessories_check;

ALTER TABLE public.alterations
  ADD CONSTRAINT alterations_brought_accessories_check
  CHECK (brought_accessories <@ ARRAY['heel', 'bra', 'corset']::TEXT[]);

COMMENT ON COLUMN public.alterations.brought_accessories IS
  'Fitting accessories the client brought in: subset of heel, bra, corset. Anything absent from the array counts as not brought.';
