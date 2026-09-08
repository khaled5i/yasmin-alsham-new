-- Allow admins to attach a free-text note to women-workshop expenses.

ALTER TABLE public.women_workshop_transactions
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.women_workshop_transactions
  DROP CONSTRAINT IF EXISTS women_workshop_transactions_notes_length_check;

ALTER TABLE public.women_workshop_transactions
  ADD CONSTRAINT women_workshop_transactions_notes_length_check
  CHECK (notes IS NULL OR char_length(notes) <= 500);

COMMENT ON COLUMN public.women_workshop_transactions.notes IS
  'ملاحظات اختيارية يكتبها المستخدم عند تسجيل مصروف المشغل النسائي (500 حرف كحد أقصى).';
