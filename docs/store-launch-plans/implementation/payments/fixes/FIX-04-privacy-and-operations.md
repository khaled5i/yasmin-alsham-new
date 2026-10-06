# FIX-04 — الدفعة D: الخصوصية والتشغيل والوثائق (AUD-07، 10، 09، 13، 14، 11)

موجّه لمراجع آلي مستقل. التاريخ: 5 أكتوبر 2026. (تحديث 6 أكتوبر: **الهجرة مطبّقة على الحي قبل نشر الكود** — المتجر لا يقرأ الأقمشة حتى يُنشر؛ تصحيحات المراجعة في `FIX-05-review-corrections.md`. وقت كتابة التقرير لم تكن مطبّقة.) قبلها: الدفعة C **مطبّقة على الحي**.

| البند | ثبت؟ | الإصلاح | الاختبار الذي فشل قبل ونجح بعد |
|---|---|---|---|
| AUD-07 | **نعم** (الكود): رابط واتساب `/fabrics/order/?t=<رمز الوصول>`؛ الصفحة لا تمحوه؛ GA على كل الصفحات؛ الرمز نفسه كوكي الوصول | رمز تتبّع للقراءة فقط بعد `#`، يُمحى من العنوان فور قراءته؛ GA معطّل في صفحات الطلب والدفع والتتبّع؛ الروابط القديمة للتتبّع فقط | `verify-privacy-ts` (3 فحوص) |
| AUD-10 | **نعم** (الإعداد): لا `headers()` ولا middleware؛ `retain_until` لا يُضبط أبداً؛ سياسة الخصوصية لا تذكر GA ولا الاستضافة | ترويسات أمنية + CSP «تقرير فقط»؛ محو العنوان بعد 90 يوماً (قرار المالكة)؛ تحديث سياسة الخصوصية ورفع إصدارها | `fabric_store_privacy_ops.sql` §2، `verify-stages` (فحصان محليان)، `verify-privacy-ts` (الترويسات) |
| AUD-09 | **نعم**: `staff/alerts` يرد 404 ما دام `FABRIC_STORE_RECONCILE_ENABLED` مطفأ؛ المدفوع يُطابق 30 يوماً فقط؛ لا إشعار خارج صفحة الطلبات | التنبيهات بمفتاح الطلبات؛ قسم وشارة في مركز الإشعارات (قرار المالكة)؛ مطابقة المدفوع حتى 120 يوماً | §3، `verify-stages` (60 يوماً شهرياً، لا بعد 120) |
| AUD-13 | **نعم** (الكود): 4 حلقات متتالية في 60 ث؛ «sending» المقطوع لا يتغير أبداً | ميزانية زمنية 40 ث بين الخطوات؛ «sending» أقدم من 10 دقائق ⇒ `review_required` | `verify-privacy-ts` (11 د ⇒ مراجعة، 2 د ⇒ جارٍ) |
| AUD-14 | **نعم** (التقرير: anon يقرأ أعمدة التكلفة؛ قيمها اليوم أصفار) | `FABRIC_PUBLIC_COLUMNS` بدل `select('*')`، ثم سحب SELECT الجدول من anon ومنح الأعمدة بلا الخمسة | §1 (يفشل قبلها: `anon can read fabrics.cost_per_meter`) |
| AUD-11 | **نعم** | تصحيح 3 وثائق، واقتراح تسجيل الهجرات (لم يُنفَّذ) | — (وثائق) |

## 1. قرارات المالكة (5 أكتوبر 2026)

| السؤال | القرار |
|---|---|
| متى يُمحى عنوان الشحن | **90 يوماً** بعد التسليم أو الإلغاء (أو بعد مهلة دفع طلب لم يُدفع)؛ المدينة تبقى |
| كيف تُبلَّغ المالكة بالتنبيهات المالية | **مركز الإشعارات في اللوحة** (لا بريد ولا واتساب آلي — لا قناة إرسال آلية في المشروع اليوم: رسائل واتساب روابط `wa.me` تُفتح يدوياً، ولا خدمة بريد) |

## 2. الهجرة `supabase/migrations/20261005150000_fabric_store_privacy_ops.sql`

**الرقم:** `20261005130000` محجوز لهجرة أخرى أُنشئت اليوم (`women_workshop_invoice_print`)، فأخذت هذه `20261005150000`.

**الفحص المسبق:** C مطبّقة؛ بصمتا `private.fabric_store_guard_address` (المرحلة 2) و`fabric_store_due_reconciliation` (المرحلة 9) = ملفّا هجرتيهما أو نسخة هذه الهجرة؛ وكل عمود يُمنح للزائر موجود في `public.fabrics` (وإلا `FABRIC_STORE_FIX_D_DRIFT` ولا يتغير شيء). فحص ترميز ذاتي.

1. **AUD-14:** `revoke select on table public.fabrics from anon` ثم `grant select (49 عموداً) … to anon` — كل الأعمدة الحية (قُرئت 5 أكتوبر) **عدا** `cost_per_meter`، `average_cost`، `last_purchase_price`، `last_purchase_date`، `supplier_id`. منح الأعمدة **إضافي** في Postgres: سحب عمود لا أثر له ما دام منح الجدول قائماً، لذلك يُسحب الجدول ثم تُمنح الأعمدة. `authenticated` (اللوحة) و`service_role` كما هما. **أثر جانبي مقصود:** عمود يُضاف لاحقاً لا يراه الزائر حتى يُمنح صراحةً (ويُضاف إلى `FABRIC_PUBLIC_COLUMNS`). دمج سياستي القراءة (SEC-07) **لم يُفعل**: لا أستطيع قراءة تعريفهما الحي من هنا، وتغيير ما يظهر في المتجر بلا قراءته خطر — يبقى للخطة 03.
2. **AUD-10:** الحارس يسمح أيضاً بمحو عنوان طلب `pending` انتهت مهلة دفعه قبل 90 يوماً (كان يبقى للأبد). `fabric_store_purge_addresses(p_limit, p_retention default 90 days)` لـ`service_role`: يمحو كل الحقول عدا المدينة، ويضبط `anonymized_at` و`retain_until`. يقارن بـ`clock_timestamp()` (الدرس 40). `p_retention` للاختبار الآمن فقط ولا يقل عن صفر.
3. **AUD-09:** المدفوع يُطابق يومياً أول 30 يوماً، ثم كل 30 يوماً حتى 120 يوماً (نافذة الاعتراض البنكي المعتادة — **للتحقق من ميسر**).

## 3. التطبيق (TypeScript)

| الملف | التغيير | البند |
|---|---|---|
| `src/lib/services/fabric-service.ts` | `FABRIC_PUBLIC_COLUMNS` بدل `select('*')`/`select()` في 9 مواضع (كل قراءات `fabrics` في `src/`) | 14 |
| `next.config.ts` | `headers()` لكل المسارات (عدا بناء Capacitor): HSTS (بلا `includeSubDomains` — لم يُتحقق من النطاقات الفرعية)، `nosniff`، `X-Frame-Options: DENY` (لا صفحة تؤطّر أخرى — فُحص)، `Referrer-Policy`، و**CSP بوضع Report-Only** (Supabase، GA، Soniox، aladhan، `form-action` لميسر) | 10 |
| `src/lib/analytics-privacy.ts` (جديد)، `src/components/AnalyticsPrivacyGuard.tsx` (جديد)، `src/app/layout.tsx` | سكربت GA يعطّل الإرسال (`ga-disable-<ID>`) قبل `config` على `/fabrics/checkout/`، `/fabrics/payment/`، `/fabrics/order/`، ويرسل `page_location` بلا استعلام ولا `#`؛ المكوّن يحدّث العلم مع كل تنقّل داخلي | 07، 10 |
| `src/app/privacy-policy/page.tsx`، `src/lib/store-legal.ts`، `checkout-contract.ts` | Vercel (الولايات المتحدة) وSupabase (سنغافورة) خارج المملكة؛ GA ومتى لا يعمل؛ محو العنوان بعد 90 يوماً؛ كوكي الطلب 90 يوماً. التاريخ ← «5 أكتوبر 2026»، `privacy` ← `2026-10-05` (قاعدة المشروع: رفعهما مع أي تغيير مضمون) | 10، 07 |
| `src/lib/server/fabric-store/http.ts` | `deriveTrackToken` (`track:`)، `trackTokenMatches` (ثابتة الزمن)، `trackingLink` (`#n=…&k=…`)، `getFabricStoreAccessSecret` | 07 |
| `src/app/api/fabric-store/track/route.ts` | ترويستا `x-order-number` + `x-track-token`: الطلب برقمه ومقارنة الرمز المشتق من `checkout_key`؛ الطريق القديم (`x-order-token`/الكوكي) كما هو للتتبّع | 07 |
| `src/app/api/fabric-store/staff/orders/[id]/route.ts` | رابط التتبّع (وواتساب) = `trackingLink(…)`، لا رمز الوصول | 07 |
| `src/app/fabrics/order/page.tsx` | يقرأ `#n/k` أو `?t=` **مرة واحدة** (ref) ثم `history.replaceState` إلى المسار وحده قبل أي طلب | 07 |
| `src/app/api/fabric-store/staff/alerts/route.ts` | بلا شرط مفتاح المطابقة (`requireFabricStoreStaff` يشترط مفتاح الطلبات) | 09 |
| `src/lib/fabric-store/store-alerts.ts` (جديد)، `src/components/fabric-store/StoreAlertsPanel.tsx` (جديد)، `notifications/page.tsx`، `dashboard/page.tsx`، `online-orders/page.tsx` | تعريف وتسميات مشتركة؛ قسم «تنبيهات متجر الأقمشة» أعلى مركز الإشعارات؛ شارة الجرس تضيف **غير المطّلع عليه** (مفاتيح في متصفح المديرة)؛ «تم الاطلاع» يطفئ الشارة ولا يزيل التنبيه | 09 |
| `src/app/api/fabric-store/jobs/run/route.ts` | لا تبدأ خطوة بعد 40 ث (`result.skipped`)؛ خطوة محو العناوين (بمفتاح الطلبات؛ قبل الهجرة `PGRST202` ⇒ `not-installed` لا فشل) | 13، 10 |
| `src/lib/server/alostaz-fabric-invoice.ts` | «sending» أقدم من 10 دقائق ⇒ `review_required` بشرط الحالة والوقت (لا يمس إرسالاً جارياً)، ولا `failed` أبداً (إعادة قد تكرر الفاتورة). يشمل مبيعات المحل: الصف العالق كان «جارٍ» للأبد | 13 |

`tsc`: **38 = خط الأساس** والمجموعة نفسها. `eslint`: لا خطأ جديد — الملفات الكبيرة (`dashboard/page.tsx` 9، `notifications/page.tsx` 39، `fabric-service.ts` 10) بالعدد نفسه في `HEAD`؛ `layout.tsx` أقل بخطأ.

## 4. الوثائق (AUD-11)

- `docs/store-launch-plans/implementation/HANDOFF.md` (الخطة 03): `20260920120000/100/200` «لم يُطبَّق» ⇒ **مطبّق على الحي** (تدقيق 30 سبتمبر، غير مسجّل).
- `payments/stage-08-rollback.sql`: الرأس ← `20260930091944` (كان `20260930120000`).
- `payments/stage-08-refunds.md` §10: التصحيح `20260930135711` «محلي فقط» ⇒ مطبّق على الحي.
- `20260930135919_…sql` يذكر `20260930140000`: **لم يُعدَّل** (هجرة مطبّقة — الدرس 25)؛ الرقم الصحيح `20260930135711`.
- `fixes/FIX-D-register-migrations.sql`: **اقتراح لم يُنفَّذ** — جملة واحدة تسجّل في `schema_migrations` 12 رقماً، كلٌ **فقط إن وُجد كائن تنشئه** ولم يكن مسجّلاً، وتطبع ما سُجّل وما تُرك. جُرّب محلياً بجدول سجل بديل (إعادته لا تكرر). البديل: قاعدة «لا `db push`».

## 5. حصر المستهلكين والأثر على المحل

- **المحل:** لا تغيير في `income` ولا المخزون ولا شاشاتهما. أثر وحيد: مبيعة محل علق إرسالها للأستاذ «sending» أكثر من 10 دقائق تصير «مراجعة» عند المحاولة التالية (كانت «جارٍ» للأبد).
- **`fabrics` للزائر:** القارئ الوحيد في `src/` هو `fabric-service.ts` (بحث شامل)؛ مسارات المتجر بالخادم تعمل بمفتاح الخدمة.
- **ترتيب النشر — عكس الدفعة C:** الكود **أولاً** ثم الهجرة (`select('*')` القديم يفشل للزائر بعد سحب الأعمدة). الكود الجديد يعمل قبل الهجرة وبعدها.
- **روابط التتبّع المرسلة سابقاً** (`?t=`) تبقى تعمل للتتبّع حتى انتهاء صلاحية طلبها (90 يوماً)، وتُمحى من العنوان فور فتحها.

## 6. الاختبارات

| الأداة | النتيجة |
|---|---|
| `supabase/tests/fabric_store_privacy_ops.sql` (جديد، آمن على الحي) | يفشل قبل D عند الحالة 1؛ PASS بعدها |
| `verify-stages` (كامل) | exit 0: كل ما سبق + D: فشل قبلها، الترميز، انحراف عمود، انحراف دالة، التطبيق مرتين، اختبارات 5/8/9/C/D بعدها PASS، **محلياً:** عنوان طلب لم يُدفع يبقى عند 89 يوماً (والحارس يرفض) ويُمحى عند 91 والمدينة باقية؛ مدفوع منذ 60 يوماً يُطابق بعد 31 يوماً لا بعد 5، ولا بعد 120؛ التراجع يرفض بلا إعلان ثم يعيد الدالتين حرفياً ومنح الجدول؛ إعادة D بعده PASS |
| `verify-privacy-ts` (جديد) | 5/5 |
| اختبارات الحي السابقة فوق D | 5، 6، 8، 8-محلي، 9، A، B، C: PASS |

## 7. الطفرات

**18/18 كُشفت** (11 SQL عبر `verify-stages` بلا تزامن + 7 TS عبر `verify-privacy-ts` على نسخة من `src/`)، كلٌ بالفحص المقصود (الدرس 11). ملاحظتان على التشغيل الأول (أُعيد كاملاً):
- كل طفرات SQL كُشفت أولاً بخطأ أداة لا بالطفرة: في وضع «بلا تزامن» لم يجد اختبار تراجع C دفعة مدفوعة يعلّق عليها استرداداً (وكذلك فحص النافذة المحلي). صار الفحصان يُنشئان دفعة إن لم يجدا.
- طفرات TS كُشفت بانهيار: نسخة `src/` في مجلد النظام المؤقت لا تصل `node_modules`. صارت النسخة في `node_modules/.cache` داخل المستودع.
- «the column drift check is gone»: بلا الفحص تفشل الهجرة أيضاً، لكن عند `grant` وبرسالة غير واضحة؛ الاختبار يشترط رفض الانحراف الصريح قبل أي تغيير.

| المجموعة | الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|---|
| D | visitors still read the whole fabrics table (AUD-14) | fix D SQL test (live-safe): FAILED -> TEST FAILED: anon can read fabrics.cost_per_meter |
| D | a cost column is granted to visitors (AUD-14) | fix D SQL test (live-safe): FAILED -> TEST FAILED: anon can read fabrics.cost_per_meter |
| D | the column drift check is gone (AUD-14) | fix D column drift: column "tags" of relation "fabrics" does not exist |
| D | an unpaid order's address may go at once (AUD-10) | fix D: the guard must refuse erasing an unpaid order's address at 89 days: erased |
| D | the purge ignores the retention (AUD-10) | fix D SQL test (live-safe): FAILED -> TEST FAILED: an address was erased before 90 days: {"status": "ok", "anonymized": 1} |
| D | the purge erases the city too (AUD-10) | fix D SQL test (live-safe): FAILED -> TEST FAILED: the finished order's address is erased, the city kept: {"order_id":"0a13d391-4d87-4f37- |
| D | a browser role may run the purge (AUD-10) | fix D SQL test (live-safe): FAILED -> TEST FAILED: the purge is for the server only |
| D | paid attempts reconciled only 30 days (AUD-09) | fix D SQL test (live-safe): FAILED -> TEST FAILED: paid attempts are reconciled up to 120 days |
| D | after 30 days paid attempts are still asked daily (AUD-09) | fix D window: {"paid":true,"d60r5":true,"d60r31":true,"d130":false} |
| D | functions we did not read are replaced (no fingerprint check, fix D) | fix D replaced a due_reconciliation it did not read |
| D | encoding self-check removed (fix D) | garbled fix D migration was APPLIED |
| tsD:lib/server/fabric-store/http.ts | (fix D) the track token is the access token (AUD-07) | AUD-07 the track token is not the access token, and only it matches: Expected "actual" to be strictly unequal to: |
| tsD:lib/server/fabric-store/http.ts | (fix D) any 64-hex token matches (AUD-07) | AUD-07 the track token is not the access token, and only it matches: the access token is not a track token |
| tsD:lib/server/fabric-store/http.ts | (fix D) the token travels in the query string (AUD-07) | AUD-07 the customer link carries the token after # (never sent to the server): Expected values to be strictly equal: |
| tsD:lib/analytics-privacy.ts | (fix D) analytics runs on order tracking (AUD-07) | AUD-07/10 Google Analytics is off on checkout, payment and order tracking: /fabrics/order/ |
| tsD:lib/analytics-privacy.ts | (fix D) page_location keeps the query (AUD-07) | AUD-07/10 Google Analytics is off on checkout, payment and order tracking: The input did not match the regular expression /page_location:  |
| tsD:lib/server/alostaz-fabric-invoice.ts | (fix D) a cut send stays «sending» (AUD-13) | AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»: Expected values to be strictly equal: |
| tsD:lib/server/alostaz-fabric-invoice.ts | (fix D) a send in progress is taken for cut (AUD-13) | AUD-13 a send cut more than 10 minutes ago becomes «review», never «failed»: Expected values to be strictly equal: |

## 8. التراجع — `fixes/FIX-D-rollback.sql`

مولَّد من ملفات الهجرات: يحذف `purge_addresses`، ويعيد الحارس (المرحلة 2) و`due_reconciliation` (المرحلة 9) **حرفياً** ويفحص بصمتيهما، ويعيد `grant select on public.fabrics to anon`. **يرفض** بلا `set local fabric_store.rollback_d_ack = 'cost-columns-exposed';` (يعيد AUD-14) ومع بصمة لا تطابق نسخ D. العناوين الممحوّة لا تُسترجع. الكود يعمل بعده كما هو. تراجع C لا يمس دوال D.

## 9. خطة التطبيق للمالكة

1. **نشر الكود** (يشمل كود الدفعة C الذي لم يُنشر بعد). بعده مباشرة في Vercel (Production) ما دام المفتاح `sk_test_`: `FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION=true`.
2. SQL Editor ← `20261005150000_fabric_store_privacy_ops.sql` (أي وقت).
3. `supabase/tests/fabric_store_privacy_ops.sql` ⇒ `PASS fabric_store privacy ops (…)`.
4. تحقق في المتصفح: المتجر يعرض الأقمشة كالعادة؛ رابط التتبّع الجديد من صفحة الطلب يفتح الطلب ويختفي الرمز من شريط العنوان؛ مركز الإشعارات يُظهر قسم تنبيهات المتجر (إن وُجدت).
5. (قرار) `FIX-D-register-migrations.sql` — أو قاعدة «لا `db push`».

## 10. ما لم يُتحقق منه

- الترويسات الفعلية على Vercel (`curl -sI` بعد النشر)، ومخالفات CSP في أدوات المتصفح قبل فرضها.
- سلوك GA4 مع `ga-disable` في التنقّل الداخلي — مبني على توثيق gtag، لم يُراقَب طلب `collect` في متصفح.
- نافذة الاعتراض البنكي لدى ميسر (120 يوماً افتراض التقرير).
- دمج سياستي قراءة `fabrics` (SEC-07) — يحتاج قراءة تعريفهما الحي.
- الشاشات الجديدة (قسم التنبيهات، صفحة التتبّع) لم تُجرَّب في متصفح (tsc وeslint فقط).
