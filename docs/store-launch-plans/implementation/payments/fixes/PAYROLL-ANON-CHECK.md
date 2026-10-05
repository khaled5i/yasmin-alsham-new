# فحص دوال الرواتب القابلة للتنفيذ بدور anon (تقرير التدقيق §6)

**التاريخ:** 1 أكتوبر 2026 · **الطريقة:** قراءة فقط على الحي (`qbbijtyrikhybgszzbjz`): `pg_proc.prosrc` كاملاً، `has_function_privilege`، `prosecdef`، `proconfig`، الـtriggers على جداول الرواتب. لم يُستدعَ أي من هذه الدوال، ولم يُعدَّل شيء.

**الحكم: ثبتت، وهي أوسع مما في التقرير.** لا فحص للدور في الدوال الثلاث المذكورة، ولا في 11 دالة رواتب أخرى. كلها `security definer` يملكها `postgres` (فـRLS على جداول الرواتب لا ينطبق عليها)، و`EXECUTE` ممنوح لـ`anon` و`authenticated`، و`search_path=public`. أي حامل لمفتاح anon المنشور في المتصفح يستطيع استدعاءها عبر `/rest/v1/rpc/<name>`.

## 1. الدوال الثلاث في التقرير

| الدالة | فحص دور؟ | ماذا يستطيع الزائر |
|---|---|---|
| `register_worker_payroll_payment(...)` (10 معاملات) | **لا.** يقرأ `auth.uid()` ليسجّله فقط (`created_by`/`approved_by` = NULL للزائر). الفحوص: مبلغ > 0، الفترة صحيحة، الشهر غير مقفل، ألا يتجاوز المتبقي إن كان `net_due ≥ 0` | تسجيل دفعة راتب لأي عامل في أي شهر غير مقفل ⇒ يرتفع `total_paid` وينخفض المستحق، وقيد يومية `PR-…` (2140 ← 1111/1112) إن وُجدت جداول اليومية. وإن كان `net_due < 0` فأي مبلغ مسموح (يتراكم ديناً على العامل) |
| `register_worker_payroll_big_debt_payment(branch, worker_id, amount)` | **لا** | إنقاص الدين المتراكم لأي عامل حتى الصفر |
| `delete_worker_deduction_payment(uuid)` | **لا** | حذف أي سداد دين وإعادة مبلغه إلى الدين؛ وإن كان مرتبطاً بدفعة تسوية يستدعي `delete_worker_payroll_operation` |

## 2. دوال أخرى بالحالة نفسها (anon + security definer + بلا فحص دور)

`create_worker_payroll_journal_entry`، `ensure_worker_payroll_month`، `register_worker_payroll_adjustment`، `lock_worker_payroll_period`، **`unlock_worker_payroll_period`**، `create_worker_payroll_adjustment_request`، `upsert_worker_payroll_big_debt`، `upsert_worker_payroll_month_snapshot`، `pay_worker_deduction_debt`، `settle_worker_debt_from_salary`، `propagate_worker_salary_to_future_months`.

- **`unlock_worker_payroll_period`**: ذاكرة المشروع تقول «للمدير فقط». هذا صحيح في الواجهة فقط؛ جسم الدالة على الحي لا يقرأ `users` ولا يستدعي `is_admin()`. الزائر يستطيع فتح شهر مقفل، ثم تسجيل دفعات فيه.
- **`delete_worker_payroll_operation(uuid)`**: الحالة الوحيدة التي فيها فحص هي `operation_type = 'salary_deduction'` (مدير فعّال). لغيرها **لا فحص**، والدالة تضبط `app.bypass_trigger = 'true'` بنفسها، فتتجاوز trigger `prevent_mutation_of_approved_payroll_operations`. الزائر يحذف أي دفعة أو سلفة أو دين **معتمد** في شهر غير مقفل (أو بعد فتحه بالدالة السابقة).

(تصنيف الأسماء بالبحث في النص ثم قراءة الأجسام. `register_worker_payroll_payment` ظهرت في البحث الآلي كأن فيها فحصاً، والسبب `ERRCODE = '42501'` لرسالة «الشهر مقفل»، وليس فحص دور.)

## 3. ما لا يتأثر

- **الصندوق النقدي:** `private.calculate_cash_box_balance` لا يقرأ أي جدول رواتب (بحث في الجسم). دفعات الرواتب المزوّرة لا تغيّر رصيد الصندوق مباشرة. (أما سحب السلفة من الصندوق فمساره منفصل ولم يظهر في القائمة.)
- لا شيء في الدوال يمس `income`.

## 4. الأثر

تزوير سجل الرواتب: إخفاء مستحقات العمال (دفعات وهمية)، أو محو ديون، أو حذف سداد حقيقي، أو فتح شهر مقفل وتعديله. لا يكشف بيانات بنكية، لكنه يفسد ما يُصرف للعمال فعلاً، والرواتب مال حقيقي. والفاعل يظهر في السجل بـ`created_by = NULL`، ولا أثر غيره.

## 5. ملاحظة جانبية خارج الرواتب

`generate_recurring_expenses(varchar, date)` أيضاً لـanon وبلا فحص دور، ويُدرج في `expenses`. خطرها محدود: تولّد المصروفات الشهرية من القوالب القائمة فقط، و`ON CONFLICT (recurring_source_id, recurring_month) DO NOTHING` يمنع التكرار. تُغلق مع AUD-01 (سحب EXECUTE من anon) دون تغيير جسمها، لأن صفحات المصروفات الثابتة تستدعيها بهوية موظف.

## 6. القرار والإصلاح (تحديث 1 أكتوبر 2026)

**قالت المالكة «أصلحها»** بمصفوفة: رواتب التفصيل للمدير فقط، رواتب الأقمشة للمدير ومدير الأقمشة، وبقية الفروع للمدير فقط. نُفّذ في الهجرة `supabase/migrations/20261001120100_payroll_rpc_role_checks.sql` (أغلفة تفحص الدور أمام الأصول دون تعديل أجسامها، بفحص بصمة) — التفاصيل والاختبارات في `FIX-01-income-expenses-rls-and-payroll.md` §3. **تنتظر التطبيق.**

العدد النهائي: 13 دالة تُستدعى من التطبيق أو يمكن استدعاؤها (الثلاث في §1 + العشر في §2 عدا المساعدتين) صارت خلف أغلفة، والمساعدتان `create_worker_payroll_journal_entry` و`ensure_worker_payroll_month` سُحب تنفيذهما من المتصفح؛ والمسار `src/app/api/worker-payroll/operations/[id]/route.ts` يحذف عملية رواتب بلا أي تحقق هوية (عميل متصفح بلا جلسة) — تغلقه الهجرة في القاعدة، وحذفه من الكود ينتظر موافقة.

### الاقتراح الأصلي (قبل القرار)

1. أقل تغيير وأكثره أماناً: `revoke execute on function <الدوال الـ14> from anon, public;`. صفحات الرواتب كلها بعد تسجيل الدخول؛ هذا يغلق باب الزائر **ولا يغيّر سلوك أي موظف**.
2. ثم (منفصلاً، بعد جرد الأدوار في المرحلة 0 من الخطة 03): فحص دور داخل كل دالة (`is_admin()` أو مدير/محاسب حسب الصفحة)، لأن أي حساب عامل (خياط) يستطيع اليوم استدعاءها أيضاً بدور `authenticated`.

الخطوة 1 لا تحتاج تعديل أجسام الدوال، فلا خطر على منطق الرواتب. والخطوة 2 تمس الرواتب، فتحتاج موافقة صريحة منفصلة.
