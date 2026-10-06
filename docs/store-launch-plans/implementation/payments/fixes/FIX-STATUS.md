# حالة إصلاحات تقرير التدقيق (AUDIT-REPORT.md، 30 سبتمبر 2026)

آخر تحديث: 5 أكتوبر 2026 — **الدفعة C مطبّقة على الحي** (5 أكتوبر، المالكة؛ تحقق قراءة فقط: `refund_record_external` موجودة، التوقيعان الجديدان وحدهما، والأعمدة الثلاثة). **6 أكتوبر — تصحيح بعد المراجعة المستقلة (`fixes/REVIEW-CD.md`):** هجرة D **مطبّقة على الحي منذ 5 أكتوبر** (المالكة طبّقتها قبل نشر الكود؛ المراجع طابق بصماتها) — **والإنتاج ما زال على النشر القديم** (`select('*')` على `fabrics`) فقراءة الأقمشة للزائر مرفوضة حتى يُنشر الكود. سجل الترحيلات: A وB مسجّلتان بأرقام أخرى (`20261003101953`، `20261003102028`، `20261003102058`). الدفعة E (تصحيحات المراجعة) منجزة محلياً (`fixes/FIX-05-review-corrections.md`). **الدفعتان A وB مطبّقتان على الحي** (طبّقتهما المالكة من SQL Editor وشغّلت اختباراتهما: PASS حسب قولها؛ وتحققتُ بقراءة فقط: `income`/`expenses` ترفض anon بـ42501، دوال الرواتب الـ13 صارت `*_unchecked`، ووصف `fabric_store_create_checkout`/`fabric_store_begin_payment` على الحي يطابق هجرة B حرفياً). كود B منشور على Vercel. 

الحالات: **مُصلحة محلياً** (كود/هجرة + اختبار فشل قبل ونجح بعد) · **تنتظر التطبيق** (هجرة بيد المالكة) · **مطبّقة** (على الحي واختبارها PASS) · **مرفوضة** (مع السبب) · **لم تبدأ**.

| # | الدفعة | ثبتت؟ | الحالة | الملفات |
|---|---|---|---|---|
| AUD-01 | A | نعم (+ TRUNCATE لـauthenticated، تسلسل الفواتير لـanon، realtime، `generate_recurring_expenses`) | **مطبّقة** (5 أكتوبر) | `supabase/migrations/20261001120000_restrict_income_expenses_rls.sql` · `supabase/tests/finance_rls.sql` · `fixes/FIX-A-rollback.sql` · `scripts/db-local/verify-finance-rls.cjs` · `fixes/FIX-01-…md` |
| §6 الرواتب | A | نعم (13 دالة + مساعدتان، لا 3) | **مطبّقة** (5 أكتوبر؛ موافقة المالكة «أصلحها» 1 أكتوبر) | `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` · `supabase/tests/payroll_rpc_access.sql` · `fixes/FIX-A-payroll-rollback.sql` · `scripts/db-local/verify-payroll-rpc.cjs` · `fixes/PAYROLL-ANON-CHECK.md` |
| AUD-02 | B | نعم | **مطبّقة ومنشورة** (5 أكتوبر؛ أول حجز على الحي عند «ادفعي»: FS-100269) | `supabase/migrations/20261003120000_fabric_store_hold_at_payment.sql` · `supabase/tests/fabric_store_hold_at_payment.sql` · `fixes/FIX-B-rollback.sql` · 6 ملفات في `src/` · `fixes/FIX-02-stock-hold-at-payment.md` |
| AUD-06 | C | نعم (audit-proofs: دفعة test ⇒ تجهيز ← جاهز ← تسليم كلها ok) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-05 | C | نعم (فاتورة ثانية بجانب الفاشلة؛ إلغاء وصفحة الدفع مفتوحة: ok) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-04 | C | نعم (230 ريالاً لطلب 115؛ بعد حسم مدير الأقمشة صفر تنبيهات) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-03 | C | نعم (استرداد جزئي من اللوحة: already_paid وصفر تنبيهات، ثم mismatch للأبد) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-08 | C | نعم (من الكود كما في التقرير؛ الطفرة التي تعيد السلوك القديم يكشفها الاختباران) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-12 | C | نعم (الدالتان لا تقرآن public.users) | **مطبّقة** (5 أكتوبر؛ المالكة، الاختبار PASS) | `supabase/migrations/20261005120000_fabric_store_money_guards.sql` · `supabase/tests/fabric_store_money_guards.sql` · `fixes/FIX-C-rollback.sql` · `fixes/FIX-03-money-and-refunds.md` |
| AUD-07 | D | نعم (الكود: الرمز في `?t=`، لا محو، GA على كل الصفحات) | مُصلحة محلياً · **الكود ينتظر النشر** | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |
| AUD-10 | D | نعم (لا ترويسات، العنوان لا يُمحى، السياسة لا تذكر GA والاستضافة) | **الهجرة مطبّقة (5 أكتوبر) · الكود ينتظر النشر** | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |
| AUD-09 | D | نعم (التنبيهات 404 بإطفاء المطابقة؛ المدفوع 30 يوماً فقط) | **الهجرة مطبّقة (5 أكتوبر) · الكود ينتظر النشر** | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |
| AUD-13 | D | نعم (الكود) | مُصلحة محلياً · **الكود ينتظر النشر** | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |
| AUD-14 | D | نعم (التقرير؛ القيم اليوم أصفار) | **الهجرة مطبّقة (5 أكتوبر) · الكود ينتظر النشر** | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |
| AUD-11 | D | نعم | الوثائق صُحّحت · اقتراح التسجيل **مسحوب** (R-CD-08) — القاعدة: لا `db push` | `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql` · `supabase/tests/fabric_store_privacy_ops.sql` · `fixes/FIX-D-rollback.sql` · `scripts/db-local/verify-privacy-ts.cjs` · `fixes/FIX-04-privacy-and-operations.md` |

## ملاحظات خارج الجدول
- `src/app/api/worker-payroll/operations/[id]/route.ts` (DELETE بلا تحقق هوية، بلا مستهلك): تُرفضه القاعدة بعد هجرة الرواتب؛ يبقى في الكود بقرار المالكة.
- `scripts/db-local/rollback-cycle.cjs`: خلل ترتيب `string_agg(… order by 1)` أُصلح (أداة اختبار فقط؛ FIX-01 §5).
- المحاسب يرى قسم الأقمشة في الواجهة فارغاً بعد AUD-01 (قرار المالكة على البيانات)؛ إخفاؤه من الواجهة اختياري.
- المسار `api/worker-payroll/operations/[id]`: قالت المالكة (1 أكتوبر) **لا تحذفه** — يبقى، والقاعدة ترفضه بعد هجرة الرواتب.
- بعد تطبيق B على الحي **لا تُشغَّل** `fabric_store_checkout.sql` ولا `fabric_store_order_admin.sql` (تؤكدان الحجز عند الإنشاء؛ FIX-02 §4.1).

## الدفعة E — تصحيحات المراجعة المستقلة (REVIEW-CD.md، 6 أكتوبر 2026)

| # | الملاحظة | الحالة | الملفات |
|---|---|---|---|
| R-CD-01 | المتجر لا يقرأ الأقمشة (هجرة D قبل كودها) | **ينتظر نشر الكود** (لا هجرة) | — |
| R-CD-02 | رابط `?t=` القديم يحمل رمز الوصول | مُصلحة محلياً (كود) · تنتظر النشر | `track/route.ts`، `fabrics/order/page.tsx` |
| R-CD-03 | مرجع دعم ميسر لرد الدفعة الإضافية | مُصلحة محلياً (كود) · تنتظر النشر | `staff/orders/[id]/route.ts`، `online-orders/page.tsx` |
| R-CD-04 | أداة الطفرات تعدّ الانهيار كشفاً | مُصلحة (أداة) | `scripts/db-local/mutate.cjs` |
| R-CD-05 | المهلة لا تقطع الحلقة | مُصلحة محلياً (كود) · تنتظر النشر | `payments.ts`، `refunds.ts`، `confirm.ts`، `jobs/run/route.ts` |
| R-CD-06 | محو العنوان بمدة أقل من 90 يوماً | مُصلحة محلياً · **هجرة `20261006120000` تنتظر التطبيق** | `supabase/migrations/20261006120000_…`، `supabase/tests/fabric_store_purge_retention_floor.sql`، `fixes/FIX-E-rollback.sql` |
| R-CD-07 | GA أثناء التنقّل الداخلي | مُصلحة محلياً (كود) · تنتظر النشر · **وإعداد GA يدوي** | `analytics-privacy.ts`، `AnalyticsPrivacyGuard.tsx`، `layout.tsx` |
| R-CD-08 | اقتراح تسجيل الهجرات | **مسحوب** | `fixes/FIX-D-register-migrations.sql` |
| منخفضة | مفتاح «الاطلاع» يتغير مع المطابقة؛ «مراجعة» تُعلن بلا كتابة | مُصلحة محلياً (كود) | `store-alerts.ts`، `alostaz-fabric-invoice.ts` |
