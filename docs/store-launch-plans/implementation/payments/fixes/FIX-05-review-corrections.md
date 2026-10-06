# FIX-05 — الدفعة E: تصحيحات المراجعة المستقلة (REVIEW-CD.md)

موجّه لمراجع آلي مستقل. التاريخ: 6 أكتوبر 2026. **لم يُطبَّق شيء من هذه الدفعة على الحي** (هجرة واحدة بيد المالكة؛ والباقي كود ينتظر النشر).

## 0. الحالة التي بُنيت عليها (من المراجعة، أؤكدها)

- A → D **مطبّقة على الحي**، وبصمات C وD مطابقة. هجرة D طُبّقت 5 أكتوبر **قبل** نشر كودها.
- الإنتاج على النشر القديم (`dpl_5DMYQAUy…`): قارئ `fabrics` بـ`select('*')` ⇒ الزائر يُرفض (`42501`). تحققتُ بنفسي بقراءة فقط (6 أكتوبر): `select=*` ⇒ 401، والأعمدة الصريحة ⇒ 200.
- A وB مسجّلتان في `schema_migrations` بأرقام بديلة (`20261003101953`، `20261003102028`، `20261003102058`). لم أكن أعلم ذلك.

## 1. الملاحظات وما فُعل

| # | الملاحظة (المراجعة) | قبلتُها؟ | الإصلاح | الاختبار |
|---|---|---|---|---|
| R-CD-01 | المتجر لا يقرأ الأقمشة | نعم | **نشر الكود** — لا هجرة ولا تراجع (الكود الحالي في المستودع يقرأ بالأعمدة الصريحة) | بعد النشر: قراءة زائر |
| R-CD-02 | `?t=` القديم = رمز الوصول نفسه، يخوّل «ادفعي» كوكياً | **نعم، وكان وصفي خاطئاً** | لا قبول لرمز الوصول في ترويسة (`track` يقبل الكوكي أو رقم الطلب + رمز التتبّع فقط)؛ الصفحة لا تقرأ `?t=` وتمحوه. المتجر لم يُطلق، فلا روابط قديمة لدى زبونات — لذلك لا فترة انتقالية | مراجعة كود (المسار يحتاج Next وعميل الخدمة؛ لا اختبار وحدة له هنا) |
| R-CD-03 | مرجع الدعم غير قابل للإدخال في رد الدفعة الإضافية | نعم | `supportReferenceRequired` **لكل محاولة** في GET؛ حقل المرجع في قسم الدفعة الإضافية، يُرسل ويُحفظ في `PendingAction` مع الطلب | القاعدة كانت تفرضه أصلاً (اختبار C §6)؛ الواجهة tsc/eslint فقط |
| R-CD-04 | أداة الطفرات تعدّ الانهيار كشفاً | نعم | `mutate.cjs`: «مكشوفة» فقط إن فشل فحص مسمّى (سطر ✘) وليس «run aborted»/«setup»؛ غير ذلك **INCONCLUSIVE** ويُفشل التشغيل | §5 (لا INCONCLUSIVE في التشغيل الأخير) |
| R-CD-05 | المهلة بين الخطوات لا داخل الحلقة | نعم | مهلة اختيارية في الحلقات الأربع (الأحداث، المطابقة، الاستردادات، الطابور): لا يبدأ عنصر بعد 45 ث ويُعدّ `deferred`. **لا يُقطع نداء بدأ.** المؤجَّل آمن: الأحداث والطابور لا تُحجز عند القراءة (لا تستهلك محاولة)، وحجز المطابقة (5 د) والاسترداد (2 د) ينتهي | `verify-privacy-ts` (4 حلقات بمهلة ماضية: كلها `deferred`، ولا نداء) |
| R-CD-06 | `p_retention` يسمح بمحو قبل 90 يوماً | نعم | **هجرة `20261006120000`**: أقل من 90 يوماً ⇒ `bad_request`، حتى للخادم. التوقيع كما هو | `fabric_store_purge_retention_floor.sql` (يفشل قبلها)؛ محلياً: طلب منتهٍ يبقى عنوانه عند 89 يوماً ويُمحى عند 91 بالافتراضي |
| R-CD-07 | تعطيل GA أثناء التنقّل غير مضمون؛ طفرة الحارس نجت | نعم | (1) سكربت الصفحة الأولى **يلفّ `history.pushState/replaceState`** فيُضبط العلم **قبل** تغيّر العنوان، ومثله `popstate`؛ ويُحقن قبل `gtag.js`. (2) `page_view` نرسله نحن للمسموح فقط (`send_page_view` عند التحميل الأول، ثم `applyAnalyticsRoute` — منطق نقي مختبَر بدل المكوّن). (3) **يدوي في GA:** إطفاء «Page changes based on browser history events» (§6) | `verify-privacy-ts`: محاكاة نافذة في `vm` — العلم مضبوط قبل استدعاء pushState الأصلي؛ تحميل أول لصفحة حساسة بلا page_view |
| R-CD-08 | اقتراح تسجيل الهجرات ضعيف | نعم | **مسحوب**: الملف يبدأ بـ`raise exception` فلا يعمل إن شُغّل خطأً. القاعدة: لا `db push` | — |
| منخفضة | مفتاح «الاطلاع» يتضمن وقت المطابقة فيعود التنبيه «جديداً» | نعم | المفتاح = النوع + الطلب | `verify-privacy-ts` |
| منخفضة | «مراجعة» تُعلن دون التحقق أن الكتابة تمت (والاختبار يرجع count=0) | نعم | `count: 'exact'`؛ إن لم يُكتب الصف (تغيّر بين القراءة والكتابة) ⇒ `in_progress`. الاختبار يميّز الآن 1 من 0 | `verify-privacy-ts` |
| منخفضة | «لا حالة فشل للفاتورة» قاطعة أكثر من التوثيق | نعم | لا تغيير كود؛ تجربة المالكة بمفتاح test تحسمه (§6) | — |

**لم أقبل/لم أفعل:** لا شيء رفضتُه. لم أضف «نبضاً» (heartbeat) لإرسال الأستاذ: «sending» > 10 د ⇒ مراجعة **لا إعادة**، فأسوأ الأحوال مراجعة يدوية لإرسال بطيء جداً — مقبول ومذكور.

## 2. الهجرة `supabase/migrations/20261006120000_fabric_store_purge_retention_floor.sql`

- فحص مسبق: بصمة `purge_addresses` الحية = نسخة D (`3af7279d…` — كما قاسها المراجع على الحي) أو نسخة E؛ وإلا `FABRIC_STORE_FIX_E_DRIFT`.
- يستبدل الدالة وحدها (نسخة D + شرط الحد الأدنى)، ويحدّث تعليقها (`R-CD-06`) — اختبار D يقرأ التعليق ليعرف أن E مطبّقة.
- فحص ترميز ذاتي. لا يمس جدولاً ولا المحل. التطبيق في أي وقت.
- التراجع `fixes/FIX-E-rollback.sql`: يعيد نسخة D حرفياً ويفحص بصمتها.

**اختبار D المعتمد** صار يعرف E (درس 42): بعد E يتوقع رفض المدة الصفرية، ويمحو عنوان الطلب المسلَّم عبر الحارس مباشرة ليبقي فحص «لا يُعاد كتابته».

## 3. الكود

| الملف | التغيير |
|---|---|
| `src/app/api/fabric-store/track/route.ts` | حذف قبول `x-order-token` (R-CD-02) |
| `src/app/fabrics/order/page.tsx` | لا قراءة لـ`?t=`؛ يُمحى الاستعلام و`#` معاً |
| `src/app/api/fabric-store/staff/orders/[id]/route.ts` | `closedAfterCall(attemptId)`؛ `supportReferenceRequired` لكل محاولة وللمعتمدة |
| `src/app/dashboard/accounting/fabrics/online-orders/page.tsx` | حقل مرجع الدعم في رد الدفعة الإضافية وتعطيل الزر بدونه |
| `src/lib/server/fabric-store/payments.ts`، `refunds.ts`، `confirm.ts`، `src/app/api/fabric-store/jobs/run/route.ts` | مهلة العناصر (45 ث) |
| `src/lib/analytics-privacy.ts`، `src/components/AnalyticsPrivacyGuard.tsx`، `src/app/layout.tsx` | لفّ history، page_view يدوي، `applyAnalyticsRoute`، ترتيب السكربتين |
| `src/lib/fabric-store/store-alerts.ts` | مفتاح الاطلاع |
| `src/lib/server/alostaz-fabric-invoice.ts` | التحقق من عدد الصفوف المكتوبة |
| `scripts/db-local/mutate.cjs` | INCONCLUSIVE؛ طفرات الدفعة E؛ تصويب طفرة D لـ`page_location` |
| `scripts/db-local/verify-privacy-ts.cjs` | 9 فحوص (كانت 5) |
| `scripts/db-local/verify-stages.cjs`، `lib.cjs` | قسم E |

`tsc` = 38 (خط الأساس). `eslint` على الملفات الثلاثة عشر: 0 أخطاء.

## 4. الاختبارات

| الأداة | النتيجة |
|---|---|
| `verify-stages` (كامل) | exit 0 — كل ما سبق + E: يفشل اختبارها قبلها، الترميز، انحراف البصمة، التطبيق مرتين، اختبار D بعد E، اختبار E، 89/91 يوماً محلياً، التراجع ثم إعادة E |
| `verify-stages --no-concurrency` | exit 0 |
| `verify-payments` / `verify-confirm` / `verify-refunds` / `verify-reconcile` | 19 / 11 / 17 / 8 — كلها exit 0 |
| `verify-privacy-ts` | 9/9 |

## 5. الطفرات

**25/25 كُشفت، ولا INCONCLUSIVE** (بالأداة المصحّحة R-CD-04: لا يُحسب إلا فحص مسمّى فشل): 3 SQL للدفعة E، و17 TS عبر `verify-privacy-ts` (10 جديدة + 7 للدفعة D أُعيدت لأن ملفاتها تغيّرت)، و5 TS للدفعة C.

طفرة واحدة **نجت** أولاً: «encoding self-check removed (batch E)» — الخلل في الطفرة لا في الفحص: عطّلت نصف الشرط فقط (`false and A = 0 or B > 0`)، والنصف الثاني (كشف تشويه WIN1256) ظل يعمل. صُوّبت لتعطّل الشرط كله فكُشفت بالسبب الصحيح. وطفرة D لـ`page_location` صُوّبت لأن نصها تغيّر في هذه الدفعة.

| المجموعة | الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|---|
| E | the purge accepts any retention again (R-CD-06) | fix D SQL test after E (live-safe): FAILED -> TEST FAILED: zero retention after batch E: expected status bad_request but got: {"status": " |
| E | a purge we did not read is replaced (no fingerprint check, batch E) | batch E replaced a purge it did not read |
| tsD:lib/server/fabric-store/http.ts | (fix D) the track token is the access token (AUD-07) | AUD-07 the track token is not the access token, and only it matches: Expected "actual" to be strictly unequal to: |
| tsD:lib/server/fabric-store/http.ts | (fix D) any 64-hex token matches (AUD-07) | AUD-07 the track token is not the access token, and only it matches: the access token is not a track token |
| tsD:lib/server/fabric-store/http.ts | (fix D) the token travels in the query string (AUD-07) | AUD-07 the customer link carries the token after # (never sent to the server): Expected values to be strictly equal: |
| tsD:lib/analytics-privacy.ts | (fix D) analytics runs on order tracking (AUD-07) | AUD-07/10 Google Analytics is off on checkout, payment and order tracking: /fabrics/order/ |
| tsD:lib/analytics-privacy.ts | (fix D) page_location keeps the query (AUD-07) | AUD-07/10 Google Analytics is off on checkout, payment and order tracking: The input did not match the regular expression /page_location:  |
| tsD:lib/server/alostaz-fabric-invoice.ts | (fix D) a cut send stays «sending» (AUD-13) | AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»: Expected values to be strictly equal: |
| tsD:lib/server/alostaz-fabric-invoice.ts | (fix D) a send in progress is taken for cut (AUD-13) | AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»: Expected values to be strictly equal: |
| tsD:lib/analytics-privacy.ts | (batch E) pushState/replaceState are not guarded (R-CD-07) | R-CD-07 the flag is set synchronously before every in-site navigation (pushState, replaceState, back): the flag was set before the origina |
| tsD:lib/analytics-privacy.ts | (batch E) the back button is not guarded (R-CD-07) | R-CD-07 the flag is set synchronously before every in-site navigation (pushState, replaceState, back): Expected values to be strictly equa |
| tsD:lib/analytics-privacy.ts | (batch E) a sensitive page gets a page_view (R-CD-07) | R-CD-07 page views are ours, only on allowed pages, without query: Expected values to be strictly equal: |
| tsD:lib/analytics-privacy.ts | (batch E) a sensitive first load sends a page_view (R-CD-07) | R-CD-07 the flag is set synchronously before every in-site navigation (pushState, replaceState, back): Expected values to be strictly equa |
| tsD:lib/fabric-store/store-alerts.ts | (batch E) the seen key follows the reconciliation time | the «seen» key of a store alert does not change with the daily reconciliation time: Expected values to be strictly equal: |
| tsD:lib/server/fabric-store/payments.ts | (batch E) events ignore the deadline (R-CD-05) | R-CD-05 the job loops start no item after the deadline: unexpected rpc after the deadline: fabric_store_note_event_failure |
| tsD:lib/server/fabric-store/payments.ts | (batch E) reconciliation ignores the deadline (R-CD-05) | R-CD-05 the job loops start no item after the deadline: Expected values to be strictly deep-equal: |
| tsD:lib/server/fabric-store/refunds.ts | (batch E) refunds ignore the deadline (R-CD-05) | R-CD-05 the job loops start no item after the deadline: Expected values to be strictly deep-equal: |
| tsD:lib/server/fabric-store/confirm.ts | (batch E) the outbox ignores the deadline (R-CD-05) | R-CD-05 the job loops start no item after the deadline: unexpected rpc after the deadline: fabric_store_confirm_order |
| tsD:lib/server/alostaz-fabric-invoice.ts | (batch E) «review» announced though not written | AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»: Expected values to be strictly equal: |
| ts:moyasar.ts | (fix C) a test key is accepted on the production deployment | configuration refuses what it must: Expected values to be strictly equal: |
| ts:payments.ts | (fix C) the closing-invoice answer is generic | (fix C) declined, the old page about to end, then ended: wait, then a new invoice: The input did not match the regular expression /تنتهي خ |
| ts8:refunds.ts | (fix C) the extra payment is not passed to the database | (fix C, AUD-04) a second payment on another invoice: refunded in full with one call; the sale untouched: Expected values to be strictly eq |
| ts8:refunds.ts | (fix C) Moyasar support's reference is not passed | (fix C, AUD-08) after a sent refund was closed, a new one needs Moyasar support's reference; a late execution is flagged: {"ok":false,"htt |
| ts8:refunds.ts | (fix C) recording trusts the typed amount instead of asking Moyasar | (fix C, AUD-03) a partial refund in the Moyasar dashboard: flagged, recorded without a call, then refunds work: Expected values to be stri |
| E | encoding self-check removed (batch E) | garbled batch E migration was APPLIED *(بعد تصويب الطفرة — انظر أدناه)* |

## 6. ما على المالكة — بالترتيب

1. **نشر الكود الآن** (يعيد المتجر؛ يشمل C وD وE). وفي Vercel (Production) ما دام المفتاح `sk_test_`: `FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION=true` — بدونه يرفض الكود الجديد إعداد ميسر كله، **بما فيه الـwebhook**.
2. بعد النشر: SQL Editor ← `20261006120000_fabric_store_purge_retention_floor.sql` ← ثم `supabase/tests/fabric_store_purge_retention_floor.sql` (PASS).
3. **Google Analytics (يدوي):** Admin ← Data streams ← (البث) ← Enhanced measurement ← ⚙ ← Page views ← Show advanced settings ← **أطفئي «Page changes based on browser history events»** ← Save. (صفحات التنقّل الداخلي يرسلها الموقع الآن بنفسه؛ بدون هذا تُحسب مرتين.)
4. تجارب بمفتاح test: رفض بطاقة ثم الدفع من **الرابط نفسه**؛ استرداد جزئي من لوحة ميسر ثم تسجيله من صفحة الطلب ثم رد من النظام؛ رابط التتبّع الجديد يفتح الطلب ويختفي الرمز من الشريط؛ مركز الإشعارات والجرس.

## 7. ما لم يُتحقق منه

- لا تجربة متصفح (الصفحات، GA في المتصفح، الترويسات على Vercel) — حتى ينشر الكود.
- ترتيب لفّ `history` مع غلاف GA الخاص يُفترض أنه يستدعي الأصل قبل إرسال حدثه؛ لذلك الطبقة 3 (إطفاء أحداث السجل في GA) إلزامية لا اختيارية.
- R-CD-02 بلا اختبار وحدة للمسار.
