# db-local — التحقق من هجرات متجر الأقمشة على Postgres حقيقي

أداة تحقق محلية لخطة الدفع (المرحلة 2 فما بعد). **ليست جزءاً من التطبيق** ولا تلمس Supabase إطلاقاً: تشغّل خادم Postgres 17 مؤقتاً على هذا الجهاز (منفذ محلي فقط، بيانات في مجلد مؤقت تُحذف)، وتبني نسخة من أجزاء الإنتاج التي تمسها الخطة، ثم تطبّق هجرات المستودع **كما هي**.

## ما تبنيه (`replica-*.sql` + `lib.cjs`)

- أدوار Supabase (`anon`, `authenticated`, `service_role`) وصلاحياتها الافتراضية في `public` كما قُرئت من المشروع الحي في 22 سبتمبر 2026، و`USAGE` على `private` لـanon وauthenticated دون service_role.
- `auth.uid()` من `request.jwt.claims`، ومستخدمون تجريبيون (مدير، مدير أقمشة، خياط).
- جداول المخزون والواردات بأعمدتها المستعملة، ودوال الكميات، وtriggers الإنتاج، وسياسات RLS الحية على جداول المخزون.
- جدول `public.fabrics` (بطاقة المتجر) بأعمدته المستعملة، **بمزامنة مبسّطة** في `replica-wiring.sql` تقرّب دوال المزامنة الكبيرة في الإنتاج: تكفي لفحص السعر والخصم والظهور والمخزون، وليست نسخة منها.
- دوال الإنتاج المصابة بتشويه الترميز تُؤخذ من ملفات هجرتها في المستودع (مطابقة للحي بايتاً ببايت بعد عكس التشويه — تقرير المرحلة 3 §1).
- قاعدة بترميز UTF8 (ويندوز العربي يختار WIN1256 افتراضياً).

## التشغيل

الاعتماديات تُثبَّت **خارج المستودع** حتى لا تمس `package.json` ولا فحص TypeScript:

```bash
mkdir -p "$TEMP/ys-db-local" && cd "$TEMP/ys-db-local" && npm init -y && npm install embedded-postgres@17.9.0-beta.17 pg@8
cd "<المستودع>"
export NODE_PATH="$TEMP/ys-db-local/node_modules"

node scripts/db-local/verify-stages.cjs     # اختبارات SQL للمراحل 2 → 6 + محاكاة تشويه الترميز + 19 سيناريو تزامن
node scripts/db-local/verify-payments.cjs   # المرحلة 5 من طرف لطرف: منطق الدفع (TypeScript) + خادم ميسر وهمي (moyasar-mock.cjs)
node scripts/db-local/verify-confirm.cjs    # المرحلة 6 من طرف لطرف: السداد ⇒ المبيعة، والطابور، وبنود فاتورة الأستاذ (الأستاذ نفسه مسجِّل وهمي)
node scripts/db-local/rollback-cycle.cjs    # سكربتات التراجع كما هي في تقارير المراحل 2 → 6 (الترتيب 6 ← 5 ← 4 ← 3 ← 2)
node scripts/db-local/mutate.cjs            # كل الطفرات (SQL للمراحل 2 → 6 + TypeScript للمرحلتين 5 و6)؛ أكثر من ساعة — شغّليه منفصلاً، لا عبر أداة مهلتها 10 دقائق
node scripts/db-local/mutate.cjs ts         # (اختياري) طفرات TypeScript فقط (ts6 للمرحلة 6 وحدها)
node scripts/db-local/mutate.cjs 3 "سعر"    # (اختياري) مرحلة واحدة، أو طفرات يطابق اسمها نصاً
node scripts/db-local/measure-migration-locks.cjs   # كم تُحجب الكتابة على income والمخزون أثناء هجرة المرحلة 2
```

رمز الخروج 0 فقط إن نجح كل شيء. (المكتبة تفرض الخروج بـ0 عبر exit hook، لذلك تخرج السكربتات عبر `finish()` صراحةً.)

## ما لا تغني عنه

هي نسخة، لا Supabase نفسه: سياسات `income` و`expenses` الحية منسوخة حرفياً منذ الدفعة A (1 أكتوبر 2026؛ وأعمدة `income` منذ المرحلة 6)، ولا PostgREST (تحويل `bytea` و`text[]` في `rpc` لم يُجرَّب هنا). اختبارات المراحل 2 → 7 شُغّلت على القاعدة الحية بعد تطبيقها ونجحت؛ **هجرة إصلاح المراجعة `20260929170000` لم تُطبَّق بعد** (اختبار المرحلة 7 الحالي يحتاجها). سيناريوهات التزامن محلية فقط.

**`stage6-local-sale.sql` محلي فقط — لا يُشغَّل على Supabase:** يُنشئ صفوف `income`، فيستهلك أرقاماً من تسلسل فواتير المحل حتى داخل معاملة تُلغى. اختبار المرحلة 6 الآمن على الحي هو `supabase/tests/fabric_store_confirm_sale.sql`.

المنفذ الافتراضي 54329؛ لتشغيل أداتين معاً اضبطي `DB_LOCAL_PORT` لإحداهما.

## المرحلة 8 (الاسترداد)

```bash
node scripts/db-local/verify-refunds.cjs        # منطق الاسترداد (TypeScript) + ميسر وهمي: رد ضائع، مهلة، 500، 400، استرداد يدوي، مفتاح خاطئ
node scripts/db-local/mutate.cjs 8              # طفرات SQL للمرحلة 8 (تشغّل verify-stages)
node scripts/db-local/mutate.cjs ts8            # طفرات refunds.ts و moyasar.ts (تشغّل verify-refunds)
```

`verify-stages` يطبّق هجرة المرحلة 8 ويشغّل `supabase/tests/fabric_store_refunds.sql` (آمن على الحي) و`stage8-local-refund.sql` (**محلي فقط**: يُدرج في `income`). `rollback-cycle` يقرأ التراجع من `docs/…/payments/stage-08-rollback.sql`، ويعيد التطبيق بعده. الخادم الوهمي لميسر مبني من التوثيق، لا من ميسر.

## المرحلة 9 (المطابقة والتنبيهات)

```bash
node scripts/db-local/verify-reconcile.cjs      # دفعة بلا webhook، مستردة قبل أول مطابقة، نجاح المحاولة 11، إعادة بعد تعطل ميسر، والتنبيهات
node scripts/db-local/mutate.cjs 9              # طفرات SQL (تشغّل verify-stages)
node scripts/db-local/mutate.cjs rc9            # طفرات الهجرة عبر verify-reconcile
node scripts/db-local/mutate.cjs ts9            # طفرات payments.ts (تشغّل verify-reconcile)
```

## إصلاحات تقرير التدقيق — الدفعة A (1 أكتوبر 2026)

```bash
node scripts/db-local/verify-finance-rls.cjs    # AUD-01: سياسات income/expenses بهويات JWT لكل دور، الزائر، مبيعة محل عبر حارس المخزون، مبيعة متجر حقيقية (حالة الأستاذ للخادم وحده)، التراجع
node scripts/db-local/verify-payroll-rpc.cjs    # دوال الرواتب الـ13: الغلاف يفحص الدور ويمرّر كل المعاملات والقيم الافتراضية، الاستدعاء المتداخل، التراجع
node scripts/db-local/mutate.cjs A              # طفرات هجرة AUD-01 (تشغّل verify-finance-rls)
node scripts/db-local/mutate.cjs P              # طفرات هجرة الرواتب (تشغّل verify-payroll-rpc)
```

- `replica-wiring.sql` يحمل الآن **سياسات `income` و`expenses` الحية قبل الإصلاح** (أربع سياسات `true` لكل جدول، وكل الصلاحيات لـanon)، و`replica-base.sql` جدول `expenses` بأعمدته وقيوده الحية ودالة `generate_recurring_expenses` الحية. وأُضيفت هويات: محاسب، مدير عام، مدير ورشة، مدير موقوف، مدير أقمشة موقوف.
- `verify-stages` يطبّق هجرة AUD-01 بعد المرحلة 9، فتجري كل اختبارات المراحل فوقها، ويشغّل اختبارها الآمن.
- `replica-payroll.sql` (لـ`verify-payroll-rpc` وحده، ليس في `buildReplica`): بدائل للدوال الـ13 **بالتواقيع والقيم الافتراضية الحية نفسها**، أجسامها تسجّل المستدعي والمعاملات فقط. الأداة تحوّل قائمة البصمات في نسخة من الهجرة إلى بصمات البدائل (ملف المستودع لا يُمس)؛ بصمات الأجسام الحقيقية تُفحص على الحي داخل الهجرة نفسها.
- `audit/audit-proofs.cjs` يطبّق إصلاحات الدفعة A بعد الهجرات 2 → 9؛ سيناريو AUD-01 **يفشل** الآن (المتوقع بعد الإصلاح).

## إصلاحات تقرير التدقيق — الدفعة B (3 أكتوبر 2026): الحجز عند «ادفعي»

```bash
node scripts/db-local/verify-stages.cjs         # يشغّل كل اختبارات المراحل قبل B، ثم يطبّق B ويختبرها (+ 4 سباقات + التراجع)
node scripts/db-local/verify-payments.cjs       # B فوق المرحلة 5: رسائل startPayment الجديدة طرف لطرف
node scripts/db-local/mutate.cjs B              # طفرات SQL للهجرة (تشغّل verify-stages)
node scripts/db-local/mutate.cjs ts "(fix B)"   # طفرات payments.ts للدفعة B (تشغّل verify-payments)
```

- `verify-stages`: اختبارات المرحلة 4 و`stage6-local-sale.sql` والمرحلة 7 وسباقا المرحلة 4 تؤكد «الحجز عند الإنشاء» عمداً، فتجري **قبل** B فقط. بعد B يجري ما بقي صالحاً + اختبار B.
- `verify-payments` و`verify-confirm` و`verify-refunds` و`verify-reconcile` و`audit-proofs` تطبّق B في سلسلتها (ما يعمل عليه التطبيق الآن).
- طفرة داخل دالة تحمي الهجرة بصمتها تُفشل إعادة التطبيق قبل أي اختبار سلوكي؛ `verify-stages` يوجّه البصمة الذاتية (والتي في سكربت التراجع) إلى الجسم المطفَّر حين يتغير فقط.

## إصلاحات تقرير التدقيق — الدفعة C (5 أكتوبر 2026): المال والاسترداد

```bash
node scripts/db-local/verify-stages.cjs         # … ثم C: اختبارها يفشل قبلها، الترميز، البصمة، التطبيق مرتين، كل اختبارات الحي بعدها، والتراجع
node scripts/db-local/verify-payments.cjs       # (fix C) رفض بطاقة ⇒ الرابط نفسه؛ قرب الانتهاء ⇒ انتظار؛ مفتاح test على الإنتاج
node scripts/db-local/verify-refunds.cjs        # (fix C) AUD-12 الفاعل، AUD-03 الاسترداد الخارجي، AUD-04 الدفعة الإضافية، AUD-08 مرجع الدعم
node scripts/db-local/mutate.cjs C              # طفرات SQL للهجرة (تشغّل verify-stages)
node scripts/db-local/mutate.cjs ts "(fix C)"   # طفرات moyasar.ts/payments.ts/refunds.ts للدفعة C
```

- C تستبدل دوالاً من المراحل 8 و9 والدفعة B، فـ`verify-payments` و`verify-confirm` و`verify-refunds` تطبّق الآن المراحل الناقصة (6 → 9) ثم C **في التشغيل العادي فقط**؛ تحت طفرة لمرحلة سابقة لا تُطبَّق C (فحص البصمة فيها كان سيرفض، فتُحسب الطفرة مكشوفة لسبب خاطئ).
- اختبارا المرحلتين 8 و9 الآمنان (`fabric_store_refunds.sql`، `fabric_store_reconciliation.sql`) واختبار المرحلة 5 صارت **تعرف C** (`pg_temp.fix_c()`): الفاعل مدير فعّال من `public.users` (قراءة فقط)، وما تغيّر معناه بـC يُفحص بالسلوك الجديد. تنجح قبل C وبعدها.
- `audit/audit-proofs.cjs` يطبّق C؛ سيناريوهات AUD-03/04/05/06 **تفشل** الآن (المتوقع بعد الإصلاح).

## إصلاحات تقرير التدقيق — الدفعة D (5 أكتوبر 2026): الخصوصية والتشغيل

```bash
node scripts/db-local/verify-stages.cjs         # … ثم D: اختبارها يفشل قبلها، الترميز، انحراف الأعمدة والدوال، التطبيق مرتين، فحصان محليان، والتراجع
node scripts/db-local/verify-privacy-ts.cjs     # بلا قاعدة: رمز التتبّع ورابطه (#)، استثناء GA، الترويسات الأمنية، إرسال أستاذ مقطوع ⇒ مراجعة
node scripts/db-local/mutate.cjs D              # طفرات SQL للهجرة (تشغّل verify-stages)
node scripts/db-local/mutate.cjs tsD            # طفرات TS (تشغّل verify-privacy-ts على نسخة من src/)
```

- `replica-wiring.sql` يحمل الآن **كل أعمدة `public.fabrics` الحية** (قُرئت 5 أكتوبر)، فيعمل منح الأعمدة للزائر وفحص انحرافها كما على الحي.
- فحصان محليان فقط (يحتاجان تواريخ يحميها حارس المرحلة 2، فيُعطَّل بـ`session_replication_role` كمستخدم خارق محلي): عنوان طلب لم يُدفع يبقى 89 يوماً بعد مهلته ويُمحى عند 91 (والحارس نفسه يرفض قبلها)، ومحاولة مدفوعة قبل 60 يوماً تُطابق شهرياً حتى 120 يوماً.
- `fixes/FIX-D-register-migrations.sql` (اقتراح لم يُنفَّذ على الحي) جُرّب محلياً بجدول سجل بديل: يسجّل ما وُجد كائنه فقط، وإعادته لا تكرر شيئاً.

## إصلاحات المراجعة (المرحلتان 6 و7)

```bash
node scripts/db-local/verify-review-fixes.cjs   # يحتاج jiti (موجود في node_modules المستودع)
node scripts/db-local/mutate.cjs rf             # طفرات إعادة الجدولة (تشغّل verify-review-fixes)
```

يفحص بوابة فاتورة الأستاذ بمرسل وهمي لا يتصل بالأستاذ: المفتاح مطفأ، وفشل قراءة المصدر، وغياب جدول الطلبات مع مبيعة محل ومع مبيعة إلكترونية، ومبيعة المحل والمختلطة. ثم على Postgres محلي بعد الهجرات 2 → 7 و`20260929170000`: اختبار SQL للمرحلة 7، ومسار نقص المخزون ← الحسم ← إعادة الجدولة ← مبيعة واحدة وخصم واحد. لا يتصل بـSupabase. طفرات `7r` (هجرة الإصلاح) تعمل مع `mutate.cjs 7`.
