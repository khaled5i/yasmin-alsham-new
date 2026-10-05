# FIX-01 — الدفعة A: سياسات `income`/`expenses` (AUD-01) ودوال الرواتب المفتوحة للزائر (§6)

**موجّه إلى:** مراجع آلي مستقل. **التاريخ:** 1 أكتوبر 2026. **الحالة:** مُصلحة ومختبرة محلياً، **تنتظر تطبيق المالكة**. لم يُكتب شيء على القاعدة الحية (قراءة الكتالوج وعدّ مجمّع فقط)، ولم يُستدعَ ميسر ولا الأستاذ، ولا إيداع.

| البند | ثبت؟ | الهجرة | الاختبار الآمن على الحي | الأداة المحلية | الطفرات |
|---|---|---|---|---|---|
| AUD-01 | **نعم**، وأوسع (TRUNCATE، تسلسل الفواتير، realtime، مولّد المصروفات) | `20261001120000_restrict_income_expenses_rls.sql` | `supabase/tests/finance_rls.sql` | `verify-finance-rls.cjs` (+ `verify-stages`) | `mutate.cjs A`: **20/20** |
| §6 الرواتب | **نعم**، وأوسع (13 دالة لا 3، منها فتح شهر مقفل) | `20261001120100_payroll_rpc_role_checks.sql` | `supabase/tests/payroll_rpc_access.sql` | `verify-payroll-rpc.cjs` | `mutate.cjs P`: **13/13** |

---

## 1. AUD-01 — التحقق

### 1.1 الدليل على الحي (قراءة فقط، 1 أكتوبر 2026)
- `pg_policies`: على `income` و`expenses` أربع سياسات لكل جدول (`*_select_policy` … `*_delete_policy`)، `roles = {public}`، `qual`/`with_check` = `true`. **مطابق للتقرير.**
- `role_table_grants`: anon وauthenticated وservice_role يملكون `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` على الجدولين.
- `begin; set local role anon; select count(*), count(buyer_phone) from public.income; rollback;` ⇒ **500 | 36** (التقرير قال 492 قبل يوم؛ الفرق مبيعات اليوم).
- محلياً: `audit/audit-proofs.cjs AUD-01` أعاد إنتاج الخلل كاملاً قبل أي تعديل.

### 1.2 ما وجدته زيادة على التقرير
1. **`TRUNCATE` لـauthenticated:** أي حساب مسجّل (خياط) يستطيع `truncate public.income` — والـTRUNCATE **لا يمر بـRLS**. سُحب.
2. **تسلسل الفواتير `fabrics_invoice_number_seq`:** anon يملك `USAGE` و`UPDATE`. سُحب منه (الموظف يحتاج USAGE لأن `set_income_invoice_number` security invoker — بقي له).
3. **`income` في منشور `supabase_realtime`:** كان الزائر يستطيع الاشتراك في تغييرات الواردات لحظياً (realtime يطبّق سياسة SELECT). السياسة الجديدة تغلقه دون تغيير المنشور؛ اشتراك شاشة واردات الأقمشة (`fabrics/income/page.tsx:446`) يستمر لمدير الأقمشة والمدير.
4. **`generate_recurring_expenses(varchar, date)`:** `security definer`، لـanon، بلا فحص دور، يُدرج في `expenses`. خطره محدود (`ON CONFLICT DO NOTHING`، من القوالب القائمة فقط)؛ سُحب من anon ومن `public`، وبقي لـauthenticated.

### 1.3 تصحيحات على التقرير
- التقرير قال إن `src/lib/services/simple-accounting-service.ts` يعمل بمفتاح الخدمة. **غير صحيح:** يستورد `supabase` من `@/lib/supabase` (عميل المتصفح بجلسة الموظف). لذلك كل شاشات الواردات والمصروفات تمر بالسياسات مباشرة، ومصفوفة الأدوار تقرر ما يعمل فيها.
- `EditOrderModal.tsx` لا يقرأ `income` ولا يكتبه: يستدعي RPC `record_order_additional_payment` (جدول `order_additional_payments`). خارج أثر هذا الإصلاح.

---

## 2. AUD-01 — الإصلاح

### 2.1 مصفوفة الأدوار (قرار المالكة، 1 أكتوبر 2026، بأسئلة محددة الخيارات)
| الفرع (`branch`) | المدير | مدير متجر الأقمشة | المحاسب | المدير العام | مدير الورشة / الخياط / الشكّاك | الزائر |
|---|---|---|---|---|---|---|
| `fabrics` | كل شيء | كل شيء | **لا** (قرار صريح) | لا | لا | لا |
| `tailoring` | كل شيء | لا | كل شيء | لا | لا | لا |
| `ready_designs` | كل شيء | لا | كل شيء | لا | لا | لا |

«كل شيء» = قراءة وإضافة وتعديل وحذف كما تسمح الشاشات اليوم. الحساب الموقوف (`is_active = false`) لا شيء. جلسة JWT بلا `sub` لا شيء. `service_role` يتجاوز RLS كما اليوم.

### 2.2 الهجرة `supabase/migrations/20261001120000_restrict_income_expenses_rls.sql`
0. **فحص الانحراف قبل أي تغيير:** ترفض (`FINANCE_RLS_DRIFT`) إن وجدت على الجدولين سياسة غير الثماني الحية أو الثماني الجديدة أو الثماني الاحتياطية للتراجع؛ وترفض (`FABRIC_STORE_PROTECT_ONLINE_SALE_DRIFT`) إن لم تكن بصمة `private.fabric_store_protect_online_sale` على الحي `622e10db…` (نسخة المرحلة 8، قرأتها اليوم من الحي = الملف) أو بصمة هذه الهجرة `8fd8694f…` (إعادة التطبيق).
1. `private.can_access_finance_branch(p_branch text)`: `security definer`، `search_path=''`، `stable`؛ تقرأ `users`/`workers` لـ`auth.uid()`؛ EXECUTE لـauthenticated وحده.
2. الصلاحيات: `revoke all … from anon` على الجدولين؛ `revoke truncate, references, trigger … from authenticated`؛ `revoke all on sequence fabrics_invoice_number_seq from anon`؛ `generate_recurring_expenses` لـauthenticated وservice_role فقط.
3. السياسات: تُحذف الثماني المفتوحة، وتُنشأ ثمانٍ `to authenticated` كلها عبر `private.can_access_finance_branch(branch)`؛ سياسة UPDATE لها `using` **و**`with check` (لا يُنقل صف إلى فرع لا يملكه الفاعل).
4. **حارس مبيعة المتجر** (`create or replace`، نسخة المرحلة 8 حرفياً + فحص واحد): لصف مرتبط بطلب، إن كان `current_setting('role')` هو `anon` أو `authenticated`، فلا يتغير إلا `notes` و`fabric_images` (و`fabric_inventory_tracked` الذي يثبّته trigger آخر). أي تغيير في `alostaz_*` من المتصفح ⇒ `FABRIC_STORE_ONLINE_SALE_LOCKED|حالة فاتورة الأستاذ … يحدّثها الخادم وحده`. `current_setting('role')` يبقى دور الجلسة داخل `security definer` (HANDOFF §5). الخادم `service_role`، وSQL Editor `postgres`: لا يتأثران.
5. فحص ذاتي للترميز (`FINANCE_RLS_ENCODING`) على جسم الحارس.

`lock_timeout = 5s`. لا يمس صفاً. إعادة التطبيق آمنة (مُختبرة).

### 2.3 حصر المستهلكين والأثر على المحل
| المستهلك | الهوية | قبل | بعد |
|---|---|---|---|
| `accounting/fabrics/income` (تسجيل/تعديل/حذف مبيعة المحل، 140/شهر) | مدير الأقمشة، المدير | يعمل | **يعمل** (مُختبر: مبيعة بخصم مخزون، تعديل، حذف بإعادة مخزون، رفض الجزء المحجوز للمتجر) |
| نفس الشاشة | المحاسب | يعمل (`canAccessAccounting`) | **فارغة** لفرع الأقمشة — قرار المالكة. لا خطأ عند الفتح؛ الإضافة تُرفض بـ`42501` |
| `fabrics/{fixed-expenses,purchases,salaries}`، `fabrics/page.tsx` (ملخص، `getFinancialSummary`) | مدير الأقمشة، المدير | يعمل | يعمل |
| `tailoring/*`، `ready-designs/*` (واردات، مصروفات، مواد، صندوق) | المدير، المحاسب | يعمل | يعمل |
| `reports/page.tsx` | المدير فقط | يعمل | يعمل |
| رصيد الصندوق (`private.calculate_cash_box_balance`، `get_cash_box_transactions`) | دوال `security definer` | يعمل | لا تتأثر (تتجاوز RLS) |
| `api/tailoring/invoices`، `api/alostaz/send-*`، `lib/server/alostaz-fabric-invoice.ts`، `api/fabric-store/staff/orders/[id]` | service_role | يعمل | لا يتأثر (مُختبر: حجز الإرسال `null/failed → sending` ثم `sent` على مبيعة المتجر) |
| `fabric_store_confirm_order`، `fabric_store_refund_finish` (إدراج المبيعة/المرتجع) | `security definer` من service_role | يعمل | لا يتأثر (كل اختبارات المراحل 6–9 فوق الإصلاح: PASS) |
| أي صفحة عامة | anon | — | لا مستهلك (بحث: `src/app` خارج `dashboard` لا يلمس الجدولين) |

**مدير الورشة والخياط والشكّاك:** لا شاشة لهم على هذين الجدولين (`canAccessAccounting = false`)؛ لا تغيير ملموس. **المدير العام:** لا حساب بهذا الدور على الحي اليوم.

**الأقفال:** `create/drop policy` و`revoke` تأخذ قفلاً حصرياً لحظياً على `income` و`expenses` ⇒ تُطبَّق خارج ساعات المحل، و`lock_timeout = 5s` يمنع الانتظار الطويل خلف مبيعة.

### 2.4 الاختبارات (فشلت قبل الإصلاح، تنجح بعده)
- **`supabase/tests/finance_rls.sql` (آمن على الحي):** داخل `begin … rollback`؛ لا إدراج في `income` (اختبارات الكتابة على `expenses`، مفتاحها uuid بلا تسلسل)؛ لا جداول مؤقتة؛ يتحقق في آخره أن عدد صفوف `income` و`(last_value, is_called)` للتسلسل لم يتغيرا. الحالات: صلاحيات anon وauthenticated والتسلسل والمولّد؛ السياسات الثماني بالاسم والأمر والدور، لا `true`، كلها عبر الدالة، UPDATE بـwith check؛ anon يُرفض قراءةً وكتابة؛ المصفوفة بحسابات حقيقية (مدير، مدير أقمشة، محاسب، خياط، مدير ورشة، مدير عام إن وُجد، مدير موقوف، JWT بلا sub) بعدّ مجمّع؛ نقل صف إلى فرع آخر يُرفض؛ حالة الأستاذ لمبيعة متجر (تُتخطى على الحي إذ لا مبيعة متجر بعد؛ تعمل محلياً).
  - **قبل الإصلاح (محلياً على السياسات الحية):** `FAILED -> TEST FAILED: anon SELECT on income: expected false but got true`. **بعده:** PASS.
- **`scripts/db-local/verify-finance-rls.cjs`** (Postgres محلي بالسياسات الحية + الهجرات 2 → 9 + مبيعة متجر حقيقية بدفعة live مُعتمدة): الاختبار الآمن قبل/بعد؛ خطوات AUD-01 التسع بدور anon كلها `42501`؛ رؤية كل هوية (8 هويات) بالفرع؛ مصفوفة إدراج 32 حالة؛ حدود التعديل والحذف؛ مبيعة المحل عبر حارس المخزون؛ حالة الأستاذ للمتصفح (مدير ومدير أقمشة) تُرفض، والملاحظات تُقبل، والمبلغ يبقى مقفلاً، وحجز الإرسال الخادمي يعمل؛ ترميز مشوّه يُرفض بلا أثر؛ سياسة مجهولة ⇒ `FINANCE_RLS_DRIFT`؛ حارس ببصمة أخرى ⇒ رفض؛ التطبيق مرتين؛ التراجع ثم إعادة التطبيق. **96 ✔، 0 ✘** (التشغيل النهائي على الملفات النهائية).
- **`audit/audit-proofs.cjs AUD-01`:** صار يطبّق الإصلاح فوق الهجرات ⇒ **يفشل** عند أول خطوة: `permission denied for table income`. (أزلتُ من السيناريو إعادة إنشائه للسياسات المفتوحة: صارت جزءاً من النسخة المحلية نفسها، وبقاؤها كان سيعيد فتح الثغرة فوق الإصلاح.)
- **`verify-stages.cjs`:** يطبّق الإصلاح بعد المرحلة 9، فتجري كل اختبارات المراحل 2 → 9 (الآمنة والمحلية) فوقه + اختباره: **43 ✔، 0 ✘**.
- **`rollback-cycle.cjs`:** **62 ✔، 0 ✘** — بعد إصلاح خلل قديم في الأداة نفسها (§5).

### 2.5 الطفرات (`mutate.cjs A`)
**20/20 كُشفت**، وكلٌّ بسببه المقصود:

| الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|
| anon keeps its table privileges | live-safe SQL test: FAILED -> TEST FAILED: anon SELECT on income: expected false but got true |
| signed-in users keep TRUNCATE | live-safe SQL test: FAILED -> TEST FAILED: authenticated TRUNCATE on income: expected false but got true |
| anon keeps the invoice sequence | live-safe SQL test: FAILED -> TEST FAILED: anon USAGE on the invoice sequence: expected false but got true |
| anon keeps the recurring generator | live-safe SQL test: FAILED -> TEST FAILED: anon EXECUTE generate_recurring_expenses: expected false but got true |
| the fabric manager reaches every branch | live-safe SQL test: FAILED -> TEST FAILED: fabric manager sees every fabrics sale: expected 2 but got 4 |
| the accountant reaches the fabrics branch | live-safe SQL test: FAILED -> TEST FAILED: accountant sees every tailoring/ready_designs sale: expected 2 but got 4 |
| the general manager is let in | live-safe SQL test: FAILED -> TEST FAILED: a non-finance account inserts an expense: expected 42501 but got NO_ERROR |
| an inactive account is let in | live-safe SQL test: FAILED -> TEST FAILED: an inactive admin sees income: expected 0 but got 4 |
| income is readable by any signed-in user | live-safe SQL test: FAILED -> TEST FAILED: a policy on income/expenses is still `true` |
| any signed-in user may add income | live-safe SQL test: FAILED -> TEST FAILED: a policy does not go through private.can_access_finance_branch |
| an expense may move to a branch the actor does not hold | live-safe SQL test: FAILED -> TEST FAILED: a policy on income/expenses is still `true` |
| any signed-in user may delete expenses | live-safe SQL test: FAILED -> TEST FAILED: a policy does not go through private.can_access_finance_branch |
| a browser may rewrite the alostaz state of an online sale | live-safe SQL test: FAILED -> TEST FAILED: admin (browser) changes only the alostaz sync status: expected FABRIC_STORE_ONLINE_SALE_LOCKED  |
| the alostaz state counts as staff-editable | live-safe SQL test: FAILED -> TEST FAILED: admin (browser) changes only the alostaz sync status: expected FABRIC_STORE_ONLINE_SALE_LOCKED  |
| the server is locked out of the alostaz state too | live-safe SQL test: FAILED -> TEST FAILED: the server writes the alostaz state: expected NO_ERROR but got FABRIC_STORE_ONLINE_SALE_LOCKED |
| staff can no longer edit online-sale notes | live-safe SQL test: FAILED -> TEST FAILED: admin (browser) edits the notes of an online sale: expected NO_ERROR but got FABRIC_STORE_ONLIN |
| unknown policies are replaced silently (no drift check) | fix A applied over an unknown policy |
| a guard we did not read is replaced (no fingerprint check) | fix A replaced a guard it did not read |
| re-applying refuses its own guard | run aborted: error: FABRIC_STORE_PROTECT_ONLINE_SALE_DRIFT: inspect the deployed function before replacing it |
| encoding self-check removed (fix A) | garbled fix A migration was APPLIED |

**طفرات كُشفت أولاً لسبب خاطئ — وأُصلح الاختبار:** في الجولة الأولى «كُشفت» طفرات الحارس الأربع لأن الأداة تطبّق الهجرة مرتين، والطفرة غيّرت بصمة الحارس فرفضت إعادة التطبيق نفسها **قبل** أي اختبار سلوكي. صارت الأداة تحدّث البصمة الذاتية للجسم المطفَّر (وتتركها حين لا يتغير الجسم، فتبقى طفرة «re-applying refuses its own guard» مكشوفة بإعادة التطبيق). وظهر بعدها أن طفرة «alostaz_sync_status وحده قابل للتعديل» كانت تمر من اختبار يغيّر عمودين معاً، وكُشفت فقط بـtrigger مدير الأقمشة القديم: أُضيف لكل عمود `alostaz_*` اختبار مستقل (في الأداة وفي الاختبار الآمن)، وصار التحقق بعد التراجع بهوية المدير لا مدير الأقمشة.

طفرات **مكافئة** تُركت عمداً (موثقة في `mutate.cjs`): حذف `auth.uid() is not null and` (المقارنة `u.id = auth.uid()` خاطئة أصلاً لـnull)؛ حذف `with check` من سياسة UPDATE (Postgres يطبّق عندها `using` على الصف الجديد)؛ `to authenticated` ← `to public` (anon بلا أي صلاحية جدول فلا يبلغ السياسة).

---

## 3. دوال الرواتب (تقرير §6)

### 3.1 التحقق
التفاصيل الكاملة: `fixes/PAYROLL-ANON-CHECK.md`. باختصار: 13 دالة `security definer` يملكها postgres، EXECUTE لـanon وauthenticated، بلا فحص دور (إلا فرع «خصم من الراتب» في `delete_worker_payroll_operation`)، ومعها مساعدتان (`create_worker_payroll_journal_entry`، `ensure_worker_payroll_month`). `unlock_worker_payroll_period` بلا فحص (ذاكرة المشروع «للمدير فقط» صحيحة للواجهة لا للقاعدة). `delete_worker_payroll_operation` يضبط `app.bypass_trigger` بنفسه فيحذف عمليات **معتمدة**. محلياً (قبل الإصلاح): زائر يفتح شهراً ⇒ OK.

إضافة: المسار `src/app/api/worker-payroll/operations/[id]/route.ts` (DELETE) **بلا أي تحقق من الهوية**، ويستدعي خدمة الرواتب بعميل المتصفح بلا جلسة (= anon). لا مستهلك له في الواجهة. بعد الإصلاح يرفضه القاعدة (`42501`). **أوصي بحذفه** — لم أحذفه (تعديل كود رواتب خارج نص الموافقة).

### 3.2 القرار
المالكة (1 أكتوبر، «نعم، هذا صحيح — أصلحها»): التفصيل = المدير؛ الأقمشة = المدير + مدير الأقمشة؛ غيرهما = المدير. على الحي كل بيانات الرواتب `tailoring` (277 شهراً، 570 عملية)، فعملياً: المدير وحده. والواجهة أصلاً تعطي التعديل للمدير وحده (`TailoringPayrollDashboard.tsx:55` و`admin={admin && !error}`)، فلا تتغير شاشة.

### 3.3 الإصلاح: `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` — بلا تعديل حرف من منطق الرواتب
1. `private.assert_payroll_branch_access(p_branch text)`: يرفع `42501 PAYROLL_FORBIDDEN|…` ما لم يكن الفاعل مديراً فعّالاً، أو مدير أقمشة فعّالاً والفرع `fabrics`. لا EXECUTE لأي دور API.
2. لكل دالة من الـ13: **فحص البصمة** (`md5(replace(prosrc, E'\r\n', E'\n'))` = ما قرأته من الحي اليوم، وإلا `PAYROLL_FUNCTION_DRIFT` ولا يتغير شيء) ثم `alter function … rename to <name>_unchecked` (الجسم كما هو)، وسحب EXECUTE منها من الجميع (بما فيه service_role).
3. غلاف بالاسم والتوقيع **والقيم الافتراضية** الأصلية (من `pg_get_function_arguments` على الحي)، `security definer`، `search_path=''`: أول جملة فحص الدور، ثم استدعاء الأصل **بالمعاملات المسماة**. للدالتين بمعرّف: الفرع من الصف (`worker_payroll_operations` / `worker_payroll_deduction_payments`)؛ صف مجهول ⇒ فرع null ⇒ المدير وحده. EXECUTE للغلاف: authenticated وservice_role.
4. الاستدعاءات الداخلية بالاسم (`delete_worker_deduction_payment` ← `delete_worker_payroll_operation`؛ `save_tailoring_salary_settings` ← `propagate…`/`upsert…snapshot`) تمر بالغلاف، و`auth.uid()` يبقى الفاعل الأصلي (مُختبر).
5. المساعدتان: سحب EXECUTE من public/anon/authenticated (تُستدعيان من دوال security definer فقط — حُصر على الحي).
6. فحص ترميز (`PAYROLL_ENCODING`).
7. **تحقق قراءة على الحي (1 أكتوبر):** التواقيع الـ13 (أنواع فقط) تُحلّ بـ`to_regprocedure`، والبصمات الـ13 **مطابقة**، ولا `_unchecked` موجودة بعد. الـ`pgrst_ddl_watch` مفعّل ⇒ PostgREST يعيد تحميل الأسماء بعد الالتزام.

لماذا غلاف لا تعديل الأجسام: الأجسام حتى 7,174 حرفاً بنهايات CRLF؛ نسخها يدوياً لإضافة سطر يفتح باب خطأ صامت في منطق مالي. الغلاف يترك الأصل بايتاً ببايت ويُختبر تمرير معاملاته آلياً.

### 3.4 الاختبارات
- **`supabase/tests/payroll_rpc_access.sql` (آمن على الحي):** الامتيازات (13 غلافاً: لا anon، نعم authenticated، security definer بـ`search_path=""`، الفحص أول جملة، يستدعي الأصل؛ 13 أصلاً: لا anon ولا authenticated ولا service_role؛ المساعدتان مغلقتان؛ لا دالة رواتب security definer مفتوحة لـanon). ثم بحسابات حقيقية: `unlock_worker_payroll_period(<فرع>, 2000, 1)` (فترة فارغة) و`delete_worker_payroll_operation(<uuid عشوائي>)` («غير موجودة» على الحي). كله داخل `begin … rollback`.
  - **قبل:** `FAILED -> … anon EXECUTE: expected false but got true`. **بعد:** PASS.
- **`scripts/db-local/verify-payroll-rpc.cjs`:** النسخة المحلية بلا جداول رواتب، فـ`replica-payroll.sql` يوفّر بدائل **بالتواقيع والقيم الافتراضية الحية** تسجّل المستدعي والمعاملات. الأداة توجّه البصمات في **نسخة** الهجرة إلى البدائل (الملف لا يُمس). يفحص: الثغرة قبل؛ الاختبار الآمن قبل/بعد؛ لكل غلاف: الأصل استُدعي مرة، بهوية المدير، وكل معاملة وصلت كما أُرسلت؛ القيم الافتراضية تصل (`cash`، `fixed`، `12.5` …)؛ مصفوفة 8 هويات × 13 دالة × الفروع؛ الزائر يُرفض على 13 غلافاً و2 مساعدتين و13 أصلاً؛ خياط مسجّل يُرفض على الأصول مباشرة؛ الاستدعاء المتداخل بهوية مدير الأقمشة؛ الترميز المشوّه والانحراف يُرفضان بلا إعادة تسمية؛ التطبيق مرتين؛ التراجع ثم إعادة التطبيق. **132 ✔، 0 ✘.**
- **حدود هذا الاختبار:** المنطق الحقيقي داخل الأصول لم يُشغَّل محلياً (لا جداول)؛ لكنه لم يتغير بايتاً (البصمة)، والاختبار الآمن على الحي يشغّل غلافين فوق الأصل الحقيقي.

### 3.5 الطفرات (`mutate.cjs P`)
**13/13 كُشفت**، كلٌّ بسببه:

| الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|
| a visitor may still call a wrapper | live-safe SQL test: FAILED -> TEST FAILED: unlock_worker_payroll_period: anon EXECUTE: expected false but got true |
| the fabric manager edits every branch | live-safe SQL test: FAILED -> TEST FAILED: fabric manager unlocks a tailoring month: expected 42501:PAYROLL_FORBIDDEN but got NO_ERROR |
| an inactive admin passes | inactive admin → create_worker_payroll_adjustment_request: expected {"tailoring":"42501:PAYROLL_FORBIDDEN","fabrics":"42501:PAYROLL_FORBID |
| one wrapper skips the role check | live-safe SQL test: FAILED -> TEST FAILED: register_worker_payroll_payment: the role check is not the first statement |
| an operation is checked against the wrong branch | live-safe SQL test: FAILED -> TEST FAILED: fabric manager deletes an operation of no known branch: expected 42501:PAYROLL_FORBIDDEN but go |
| a wrapper swaps two arguments | admin → register_worker_payroll_payment: result, original called once as the admin, all arguments through: expected OK 1 true true, got OK |
| a wrapper changes a default | defaults reach the original (payment account, salary type, rates): expected ["cash",null,"fixed",0,12.5,null], got ["bank",null,"fixed",0, |
| an original stays callable by signed-in users | live-safe SQL test: FAILED -> TEST FAILED: unlock_worker_payroll_period_unchecked: authenticated EXECUTE: expected false but got true |
| a helper stays open to the browser | live-safe SQL test: FAILED -> TEST FAILED: anon EXECUTE ensure_worker_payroll_month: expected false but got true |
| a wrapper keeps the caller search_path | live-safe SQL test: FAILED -> TEST FAILED: create_worker_payroll_adjustment_request: wrapper is security definer with an empty search_path |
| a body we did not read is wrapped (no drift check) | payroll migration replaced a function it did not read |
| re-applying renames again | run aborted: error: function create_worker_payroll_adjustment_request_unchecked(character varying, text, text, integer, integer, text, tex |
| encoding self-check removed (payroll) | garbled payroll migration was APPLIED |

(«an inactive admin passes» يكشفه `verify-payroll-rpc` لا الاختبار الآمن: الاختبار الآمن لا يجد مديراً موقوفاً على الحي ليتقمصه.)

---

## 4. خطة التطبيق للمالكة

**متى:** بعد إغلاق المحل (لا مبيعة جارية)، والهجرتان في الجلسة نفسها أو منفصلتين.

1. Supabase ← SQL Editor ← الصق `supabase/migrations/20261001120000_restrict_income_expenses_rls.sql` كاملاً ← Run.
   - إن ظهر `FINANCE_RLS_DRIFT` أو `…_DRIFT` أو `…_ENCODING`: **توقفي** — لم يتغير شيء؛ أرسلي الرسالة.
2. الصق `supabase/tests/finance_rls.sql` ← Run ⇒ آخر سطر يبدأ بـ`PASS finance RLS`.
3. في المتصفح (قبل فتح المحل): مدير الأقمشة يفتح «واردات الأقمشة» ويرى المبيعات؛ يسجّل مبيعة تجريبية صغيرة ثم يحذفها (أو يسجّل أول مبيعة حقيقية صباحاً ويتأكد)؛ المدير يفتح التقارير؛ المحاسب يفتح واردات التفصيل.
4. الصق `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` ← Run. (`PAYROLL_FUNCTION_DRIFT` ⇒ توقفي وأرسلي.)
5. الصق `supabase/tests/payroll_rpc_access.sql` ← Run ⇒ `PASS payroll RPC access`.
6. المدير يفتح «رواتب التفصيل» ولوحة عامل واحد (عرض فقط يكفي).
7. تحقق الزائر (اختياري): `begin; set local role anon; select count(*) from public.income; rollback;` ⇒ يجب أن يرفض بـ`permission denied`.

**بعد التطبيق:** لا تسجيل في سجل الترحيلات (SQL Editor لا يسجّل) — يُعالج في AUD-11 (الدفعة D).

## 5. التراجع
- **`fixes/FIX-A-rollback.sql`** (AUD-01): إن أوقف الإصلاح شاشة يحتاجها المحل. يضع ثماني سياسات احتياطية **للموظفين فقط** عبر `private.can_manage_fabric_operations()` (المدير، المحاسب، المدير العام، مدير الأقمشة — كل الفروع)، ويحذف الدالة الجديدة. **لا** يعيد `true`، ولا أي صلاحية لـanon، ولا TRUNCATE، ولا نسخة الحارس القديمة. يرفض إن لم يكن الإصلاح مطبّقاً. مُختبر: بعده الزائر مرفوض، الخياط لا يرى، مدير الأقمشة يسجّل مبيعة، حالة الأستاذ تبقى للخادم، وإعادة الهجرة بعده تنجح.
- **`fixes/FIX-A-payroll-rollback.sql`**: يحذف الأغلفة ويعيد كل أصل إلى اسمه، ويحذف دالة الفحص. **لا** يعيد EXECUTE لـanon (يبقى «الحد الأدنى»: الموظفون المسجّلون فقط). مُختبر.
- **سكربتات تراجع قديمة تمس ما غيّرته:** `stage-08-rollback.sql` يُبقي نسخة الحارس الحالية (لا يعيد إنشاءها) ⇒ لا يُبطل الفحص الجديد. `stage-06` (التراجع الكامل للمرحلة 6، في تقريرها) **يحذف** الحارس كله — كان كذلك قبل الإصلاح، ويرفض ما دامت 7 مطبّقة؛ لا يعيد فتح الجدول للزائر لأن السياسات والصلاحيات خارجه.
- **خلل قديم أصلحته في أداة الاختبار:** `rollback-cycle.cjs:177` قارن `string_agg(… order by 1)` — داخل دالة تجميع `order by 1` يرتب بالثابت 1 لا بالعمود، فخرج الصفان بترتيب التخزين وفشل «rollback 8 runs again» مع أن الدالتين عادتا بايتاً ببايت (شُخّص بنسخة مؤقتة تطبع القيمتين، ثم حُذفت). الترتيب الآن بالتوقيع. لا يمس أي هجرة.

## 6. ما لم يُتحقق منه
- **المتصفح:** لم تُجرَّب الشاشات بعد الإصلاح (لا تطبيق على الحي). الخطوتان 3 و6 أعلاه.
- **Realtime:** إغلاق اشتراك الزائر استنتاج من أن realtime يطبّق سياسة SELECT؛ لم يُختبر محلياً (لا خادم realtime).
- **المحاسب وشاشات الأقمشة:** الواجهة ما زالت تفتحها له (`canAccessAccounting`) فيرى صفحات فارغة. لم أغيّر الواجهة (قرار المالكة على البيانات؛ إخفاء القسم له تعديل واجهة منفصل إن أرادته).
- **الأصول الحقيقية للرواتب** لم تُشغَّل محلياً (§3.4).
- **`api/worker-payroll/operations/[id]`:** يبقى في الكود (يُرفض في القاعدة)؛ حذفه ينتظر موافقة.

## 7. الملفات
| الملف | التغيير |
|---|---|
| `supabase/migrations/20261001120000_restrict_income_expenses_rls.sql` | جديد |
| `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` | جديد |
| `supabase/tests/finance_rls.sql`، `supabase/tests/payroll_rpc_access.sql` | جديدان (آمنان على الحي) |
| `docs/…/payments/fixes/FIX-A-rollback.sql`، `FIX-A-payroll-rollback.sql` | جديدان |
| `docs/…/payments/fixes/PAYROLL-ANON-CHECK.md`، `FIX-STATUS.md`، هذا الملف | جديدة |
| `scripts/db-local/verify-finance-rls.cjs`، `verify-payroll-rpc.cjs`، `replica-payroll.sql` | جديدة |
| `scripts/db-local/replica-base.sql` | جدول `expenses` + `generate_recurring_expenses` + trigger التحديث (حية) |
| `scripts/db-local/replica-wiring.sql` | سياسات `income`/`expenses` الحية بدل التقريب؛ 5 هويات جديدة |
| `scripts/db-local/lib.cjs` | `migrationA`، `testA`، `rollbackA` |
| `scripts/db-local/verify-stages.cjs` | يطبّق الإصلاح بعد 9 ويشغّل اختباره؛ `--mutateA` |
| `scripts/db-local/mutate.cjs` | مجموعتا `A` و`P` |
| `scripts/db-local/rollback-cycle.cjs` | ترتيب `string_agg` (§5) |
| `scripts/db-local/audit/audit-proofs.cjs` | يطبّق الإصلاح؛ لا يعيد إنشاء السياسات المفتوحة |
| `scripts/db-local/README.md` | قسم الدفعة A |

**لا تغيير في كود التطبيق (`src/`).** `tsc --noEmit` = 38 خطأ (خط الأساس). `eslint` على الملفات الملموسة: لا شيء غير قاعدة `no-require-imports` المعروفة لسكربتات CommonJS (قائمة في كل سكربتات `db-local`). لا `????` في أي ملف.
