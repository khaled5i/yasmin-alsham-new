-- إضافة حقل "عربي بأحرف إنجليزية" للفئات المحاسبية
-- Arabic name written in Latin letters (transliteration), optional.

ALTER TABLE public.accounting_categories
  ADD COLUMN IF NOT EXISTS label_ar_latin VARCHAR(200);

COMMENT ON COLUMN public.accounting_categories.label_ar_latin IS
  'اسم الفئة بالعربية مكتوباً بأحرف إنجليزية (مثال: Aqmisha) - اختياري.';
