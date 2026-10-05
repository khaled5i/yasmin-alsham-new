# حالة إصلاحات تقرير التدقيق (AUDIT-REPORT.md، 30 سبتمبر 2026)

آخر تحديث: 3 أكتوبر 2026 — بعد الدفعة B. (الدفعة A: لم يُطبَّق شيء على الحي — طلبت المالكة التطبيق فرُفض نداء أداة الهجرة في نافذة الإذن؛ تبقى بيد المالكة من SQL Editor.)

الحالات: **مُصلحة محلياً** (كود/هجرة + اختبار فشل قبل ونجح بعد) · **تنتظر التطبيق** (هجرة بيد المالكة) · **مطبّقة** (على الحي واختبارها PASS) · **مرفوضة** (مع السبب) · **لم تبدأ**.

| # | الدفعة | ثبتت؟ | الحالة | الملفات |
|---|---|---|---|---|
| AUD-01 | A | نعم (+ TRUNCATE لـauthenticated، تسلسل الفواتير لـanon، realtime، `generate_recurring_expenses`) | مُصلحة محلياً · **تنتظر التطبيق** | `supabase/migrations/20261001120000_restrict_income_expenses_rls.sql` · `supabase/tests/finance_rls.sql` · `fixes/FIX-A-rollback.sql` · `scripts/db-local/verify-finance-rls.cjs` · `fixes/FIX-01-…md` |
| §6 الرواتب | A | نعم (13 دالة + مساعدتان، لا 3) | مُصلحة محلياً · **تنتظر التطبيق** (موافقة المالكة «أصلحها» 1 أكتوبر) | `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` · `supabase/tests/payroll_rpc_access.sql` · `fixes/FIX-A-payroll-rollback.sql` · `scripts/db-local/verify-payroll-rpc.cjs` · `fixes/PAYROLL-ANON-CHECK.md` |
| AUD-02 | B | نعم | مُصلحة محلياً · **تنتظر التطبيق** (بعد A) | `supabase/migrations/20261003120000_fabric_store_hold_at_payment.sql` · `supabase/tests/fabric_store_hold_at_payment.sql` · `fixes/FIX-B-rollback.sql` · 6 ملفات في `src/` · `fixes/FIX-02-stock-hold-at-payment.md` |
| AUD-06 | C | — | لم تبدأ | |
| AUD-05 | C | — | لم تبدأ | |
| AUD-04 | C | — | لم تبدأ | |
| AUD-03 | C | — | لم تبدأ | |
| AUD-08 | C | — | لم تبدأ | |
| AUD-12 | C | — | لم تبدأ | |
| AUD-07 | D | — | لم تبدأ | |
| AUD-10 | D | — | لم تبدأ | |
| AUD-09 | D | — | لم تبدأ | |
| AUD-13 | D | — | لم تبدأ | |
| AUD-14 | D | — | لم تبدأ | |
| AUD-11 | D | — | لم تبدأ | |

## ملاحظات خارج الجدول
- `src/app/api/worker-payroll/operations/[id]/route.ts` (DELETE بلا تحقق هوية، بلا مستهلك): تُرفضه القاعدة بعد هجرة الرواتب؛ يبقى في الكود بقرار المالكة.
- `scripts/db-local/rollback-cycle.cjs`: خلل ترتيب `string_agg(… order by 1)` أُصلح (أداة اختبار فقط؛ FIX-01 §5).
- المحاسب يرى قسم الأقمشة في الواجهة فارغاً بعد AUD-01 (قرار المالكة على البيانات)؛ إخفاؤه من الواجهة اختياري.
- المسار `api/worker-payroll/operations/[id]`: قالت المالكة (1 أكتوبر) **لا تحذفه** — يبقى، والقاعدة ترفضه بعد هجرة الرواتب.
- بعد تطبيق B على الحي **لا تُشغَّل** `fabric_store_checkout.sql` ولا `fabric_store_order_admin.sql` (تؤكدان الحجز عند الإنشاء؛ FIX-02 §4.1).
