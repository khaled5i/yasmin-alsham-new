-- Migration 63: Print Jobs Queue (طابور الطباعة عن بُعد)
-- ============================================================================
-- يتيح إرسال طلب طباعة فاتورة من الجوال ليطبعها جهاز الكاشير تلقائياً.
-- التدفّق: الجوال يُدرج سطراً هنا (status='pending') → محطة الطباعة على الكاشير
-- تستمع عبر Supabase Realtime، تطالب بالطلب ذرياً (pending→printing)، تطبعه على
-- طابعة CityPOS الموصولة USB، ثم تعلّمه 'done'. الطابعة نفسها لا تحتاج إنترنت —
-- جهاز الكاشير هو الجسر.
-- ============================================================================

CREATE TABLE IF NOT EXISTS print_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch TEXT NOT NULL DEFAULT 'fabrics',          -- الفرع/المحطة المعنية بالطباعة
  job_type TEXT NOT NULL DEFAULT 'fabric_sale_receipt', -- نوع الإيصال (قابل للتوسّع مستقبلاً)
  income_id UUID,                                   -- مرجع سجل البيع (للتتبّع فقط)
  payload JSONB NOT NULL,                           -- نسخة كاملة من بيانات الإيصال وقت الإرسال
  status TEXT NOT NULL DEFAULT 'pending',           -- 'pending' | 'printing' | 'done' | 'error'
  error_message TEXT,                               -- رسالة الخطأ إن فشلت الطباعة
  printed_at TIMESTAMPTZ,                           -- وقت اكتمال الطباعة
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس لجلب الطلبات المعلّقة بسرعة لكل فرع (استعلام المحطة المتكرّر)
CREATE INDEX IF NOT EXISTS idx_print_jobs_branch_status_created
  ON print_jobs(branch, status, created_at);

-- تفعيل Realtime حتى تستقبل محطة الطباعة الطلبات الجديدة لحظياً
ALTER PUBLICATION supabase_realtime ADD TABLE print_jobs;

-- ============================================================================
-- RLS: المستخدمون المسجّلون فقط (لا زوّار) يتعاملون مع طابور الطباعة
-- ============================================================================
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;

-- إرسال طلب طباعة (من صفحة المبيعات على الجوال)
CREATE POLICY "Authenticated can insert print_jobs"
  ON print_jobs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- قراءة الطلبات (محطة الطباعة على الكاشير)
CREATE POLICY "Authenticated can read print_jobs"
  ON print_jobs FOR SELECT
  USING (auth.role() = 'authenticated');

-- تحديث حالة الطلب (المطالبة الذرية + الإنهاء) — الشرط الذري في UPDATE يمنع الطباعة المزدوجة
CREATE POLICY "Authenticated can update print_jobs"
  ON print_jobs FOR UPDATE
  USING (auth.role() = 'authenticated');
