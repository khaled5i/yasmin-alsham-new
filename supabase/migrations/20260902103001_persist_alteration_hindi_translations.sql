-- Persist one shared Hindi translation per alteration/source text.
-- Keeping translations in a dedicated table avoids granting order viewers
-- permission to update the core alteration record.

CREATE TABLE IF NOT EXISTS public.alteration_translations (
  alteration_id UUID NOT NULL
    REFERENCES public.alterations(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL DEFAULT 'hi'
    CHECK (target_language = 'hi'),
  source_text TEXT NOT NULL
    CHECK (length(btrim(source_text)) > 0),
  translated_text TEXT NOT NULL
    CHECK (length(btrim(translated_text)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alteration_id, target_language)
);

COMMENT ON TABLE public.alteration_translations IS
  'Shared cached translations for alteration text. Access follows the linked alteration RLS.';

COMMENT ON COLUMN public.alteration_translations.source_text IS
  'Exact source text used for the translation; a mismatch invalidates the cached value.';

ALTER TABLE public.alteration_translations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.alteration_translations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.alteration_translations TO authenticated;

CREATE POLICY "Order viewers can view alteration translations"
ON public.alteration_translations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.alterations
    WHERE alterations.id = alteration_translations.alteration_id
  )
);

CREATE POLICY "Order viewers can create alteration translations"
ON public.alteration_translations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.alterations
    WHERE alterations.id = alteration_translations.alteration_id
  )
);

CREATE POLICY "Order viewers can refresh alteration translations"
ON public.alteration_translations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.alterations
    WHERE alterations.id = alteration_translations.alteration_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.alterations
    WHERE alterations.id = alteration_translations.alteration_id
  )
);
