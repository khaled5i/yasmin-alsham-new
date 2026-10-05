# FIX-02 — الدفعة B: تجميد مخزون المحل بطلبات لا تُدفع (AUD-02)

**موجّه إلى:** مراجع آلي مستقل. **التاريخ:** 3 أكتوبر 2026. **الحالة:** مُصلحة ومختبرة محلياً، **تنتظر تطبيق المالكة**. لم يُكتب شيء على القاعدة الحية، ولم يُستدعَ ميسر ولا الأستاذ، ولا إيداع.

| البند | ثبت؟ | الهجرة | الاختبار الآمن على الحي | الأدوات المحلية | الطفرات |
|---|---|---|---|---|---|
| AUD-02 | **نعم** | `20261003120000_fabric_store_hold_at_payment.sql` | `supabase/tests/fabric_store_hold_at_payment.sql` | `verify-stages` (اختبار + 4 سباقات + التراجع)، `verify-payments` (5 سيناريوهات طرف لطرف) | **22/22** (18 SQL + 4 TS) |

---

## 1. التحقق

- **محلياً:** `audit/audit-proofs.cjs AUD-02` أعاد إنتاج الخلل قبل أي تعديل: طلب واحد بلا دفع (16,100 ريال) حجز 40 قطعة كاملة، ورُفضت 5 من 5 مبيعات للمحل (`FABRIC_STOCK_RESERVED`)، و12 طلباً من بصمتين في 10 دقائق قُبلت كلها.
- **الكود:** `20260924114354_fabric_store_checkout.sql:441` — `create_checkout` يستدعي `fabric_store_reserve_order(..., now()+30m)` لحظة الإنشاء؛ `:260` يقبل حتى 40 سطراً؛ الحدود في `:212-215` على عدد الطلبات لا الكمية.
- **بيانات المحل الحقيقية (قراءة مجمّعة من الحي، 1 أكتوبر، آخر 180 يوماً، 269 مبيعة):** الوسيط سطر واحد و3.5 م؛ 90% سطران أو أقل وحتى 12 م؛ 99% حتى 4 أسطر؛ أكبر مبيعة 6 أسطر. بنيت عليها خيارات السقوف التي عُرضت على المالكة.

## 2. قرارات المالكة (1 أكتوبر 2026، بأسئلة محددة الخيارات)
| الموضوع | القرار |
|---|---|
| متى يُحجز القماش | **لا حجز قبل «ادفعي»** |
| السقوف | الخيار «أشد» كاملاً: **الطلب ≤ 5 أسطر**؛ لكل جوال **ولكل** بصمة IP: **≤ 5 قطع كاملة و≤ 20 م** محجوزة في وقت واحد؛ للمتجر كله **≤ 20 قطعة و≤ 100 م** |
| CAPTCHA | لا الآن |
| زر تحرير الحجوزات | لا |

## 3. الإصلاح

### 3.1 قيود قائمة شكّلت التصميم (لم تتغير)
- `fabric_store_stock_reservations` فيه `unique (order_item_id)`: **سطر الطلب يُحجز مرة واحدة أبداً**.
- حارس المرحلة 2 يمنع تمديد `expires_at`، و`payment_due_at` لا يتغير بعد الإنشاء.

النتيجة: أول «ادفعي» ينشئ الحجز؛ إن انتهى الحجز تعيد الزبونة إنشاء الطلب من السلة — وهو سلوك اليوم نفسه (`hold_expiring`). لم أغيّر أي قيد ولا حارساً.

### 3.2 الهجرة `supabase/migrations/20261003120000_fabric_store_hold_at_payment.sql`
0. **فحص البصمة** قبل الاستبدال لـ`create_checkout` (`b5b222ed…` = ملف المرحلة 4، أو `a50962d6…` = هذه الهجرة) ولـ`begin_payment` (`69e5b1bc…` = ملف المرحلة 5، أو `5c4a23f0…`)، وإلا `…_DRIFT` ولا يتغير شيء.
1. `private.fabric_store_hold_clients(order_id pk → orders on delete cascade, client_hash bytea(32), created_at)`: بصمة من ضغط «ادفعي»، للسقف لكل عنوان. RLS مفعّل، ولا صلاحية لأي دور API (ولا service_role).
2. **`public.fabric_store_create_checkout`** — نسخة المرحلة 4 حرفياً مع ثلاثة تغييرات معلَّمة «الدفعة B» (وُلّدت باستبدالات نصية مؤكَّدة الوحدة من الملف المطبَّق، لا بإعادة كتابة):
   - `c_max_lines = 5`: أكثر ⇒ `rejected / FABRIC_STORE_TOO_MANY_LINES` برسالة عربية، ولا يُنشأ شيء.
   - الحجز الذري يُجرَّب **كاملاً** (البطاقة، السعر، الظهور، طريقة البيع، المتاح بعد حجوزات الآخرين — تحت أقفال صفوف المخزون نفسها) ثم يُلغى داخل كتلة فرعية بخطأ حارس `FABRIC_STORE_DRY_RUN|ok`: لا يبقى صف حجز، وأقفال الكتلة الفرعية تُفك. أي خطأ آخر يُعاد رميه إلى المعالج القائم فيُترجم كما كان (`rejected` برسالة، أو `55P03` للخادم).
   - `payment_due_at` = الآن + 30 دقيقة صار **مهلة الضغط على «ادفعي»**. الحقل `hold_expires_at` في الرد باقٍ بالاسم للتوافق.
3. **`public.fabric_store_begin_payment`** — نسخة المرحلة 5 حرفياً + كتلة واحدة قبل فحص الحجز القائم، تعمل فقط حين **لا صف حجز** للطلب:
   - بعد `payment_due_at` ⇒ `order_expired`.
   - `pg_advisory_xact_lock('fabric_store_hold_caps')` ثم حساب المحجوز الساري (`active` ولم ينتهِ) قطعاً (`piece`، عدّاً) وأمتاراً (`meter`، سنتيمتراً): لجوال الطلب، ولبصمة المرسل، وللمتجر. تجاوز ⇒ `hold_limit` مع `scope` = `phone` | `client` | `store`، بلا حجز ولا محاولة.
   - `fabric_store_reserve_order(order, now()+25m)`؛ رفضه (سعر/متاح/ظهور تغيّر منذ الطلب) ⇒ `rejected` برمزه ورسالته، بلا محاولة؛ `55P03` يُرمى للخادم.
   - تسجيل المرسل في `hold_clients`.
   - ثم المنطق القائم كما هو: صفحة ميسر = `least(now+20m, hold−2m)` ⇒ **20 دقيقة < 25** دائماً.
4. فحص ذاتي للترميز. `lock_timeout = 5s`. **لا يمس جدولاً أو دالة للمحل** (حارس المخزون، مسار الخصم، `confirm_order`، `apply_payment`، `set_fulfillment` كما هي).

**الطلبات التي أُنشئت قبل الهجرة** (ولها حجز من الإنشاء): الكتلة لا تعمل لها (صف الحجز موجود)، فتمضي في المسار القديم بلا تغيير.

### 3.3 ما يبقى بعد الإصلاح (تحليل الخطر المتبقي)
- **أقصى ما يُجمَّد في أي لحظة: 20 قطعة كاملة و100 م** مهما تعددت العناوين والجوالات (≈ 6.5% من 305 قطعة؛ المحل يبقى معه ≥ 285). وكل حجز يتطلب فتح فاتورة ميسر فعلية، ويدوم 25 دقيقة.
- مهاجم يدوّر العناوين يستطيع إبقاء سقف المتجر ممتلئاً، فتُرفض الزبونات الحقيقيات بـ«الطلبات الإلكترونية كثيرة الآن» — **المحل لا يتأثر**. لا CAPTCHA بقرار المالكة؛ إن حدث، فالعلاج إطفاء مفتاح الطلبات أو إضافة التحدي لاحقاً.
- حدود عدد الطلبات القائمة (6/10 د و30/يوم لكل مرسل، 3 طلبات حية لكل جوال، 50 للمتجر، 10 بدايات دفع/10 د) باقية كما هي.
- سقف العنوان يعتمد على صحة بصمة IP (`http.ts:87-91`، `x-real-ip`/`x-forwarded-for`) — التقرير وضع ثقتها على Vercel «للتحقق»، ولم أتحقق منها. سقفا الجوال والمتجر لا يعتمدان عليها.

### 3.4 التطبيق (TypeScript)
| الملف | التغيير |
|---|---|
| `src/lib/fabric-store/checkout-contract.ts` | `FABRIC_STORE_MAX_ORDER_LINES = 5` و`FABRIC_STORE_PAYMENT_HOLD_MINUTES = 25`؛ `FABRIC_STORE_MAX_LINES` (40) باقٍ للسلة وعرض السعر — `linesSchema` مشترك بين الاثنين، وخفضه كان سيُسقط تسعير أي سلة أطول. إصدار الشروط `terms` ← `2026-10-03`. |
| `src/lib/store-legal.ts` | `STORE_POLICIES_UPDATED_AT` ← «3 أكتوبر 2026» (قاعدة المشروع: رفعهما معاً مع أي تغيير مضمون). |
| `src/app/sales-terms/page.tsx` | البند 4: لا حجز قبل «ادفعي»، 30 دقيقة للضغط، 25 دقيقة حجز، 5 أقمشة للطلب. |
| `src/app/api/fabric-store/checkout/route.ts` | رفض أكثر من 5 أسطر قبل إعادة التسعير (400 `too-many-lines`)؛ تعليق المسار. |
| `src/lib/server/fabric-store/payments.ts` | `startPayment`: `hold_limit` ⇒ 429 `hold-limit-<scope>` برسالة لكل نطاق؛ `rejected` ⇒ 409 برسالة القاعدة؛ `order_expired` ⇒ 409؛ `55P03` من `begin_payment` ⇒ 503 `busy` («القماش قيد البيع في المحل…»). |
| `src/app/fabrics/checkout/page.tsx` | تنبيه وتعطيل الإرسال إن تجاوزت السلة 5 أسطر؛ «اضغطي ادفعي قبل الساعة…» بدل «القماش محجوز لكِ حتى…»؛ نص الزر «تأكيد الطلب»؛ شرح المدتين. |

حصر المستهلكين: `holdExpiresAt`/`payment_due_at` يُعرضان في صفحة إتمام الطلب وحدها (لوحة الموظفين تحمل الحقل نوعاً ولا تعرضه)؛ `FabricPayNowButton` يعرض `error` من المسار كما هو (فتصله الرسائل الجديدة بلا تعديل)؛ صفحة الرجوع «ما دام القماش محجوزاً لكِ» صحيحة (الحجز قائم بعد أول «ادفعي»). **حارس المحل ومسار الخصم لم يُمسّا**؛ اختبارات الحارس كلها ناجحة قبل B وبعده.

## 4. الاختبارات

- **`supabase/tests/fabric_store_hold_at_payment.sql` (آمن على الحي):** أقمشة وطلبات خاصة به، كخادم (service_role)؛ لا إدراج في `income` (يتحقق في آخره من العدد والتسلسل)؛ لا جداول مؤقتة؛ `rollback`. الحالات: الإنشاء لا يحجز والحارس لا يرى شيئاً، و`payment_due_at` = +30 د؛ «ادفعي» يحجز كل الأسطر 25 د والصفحة تنتهي قبل الحجز بدقيقتين، والمرسل مسجّل، والضغط مرة ثانية لا يحجز مرتين؛ 6 أسطر تُرفض ولا يبقى شيء، 5 تُقبل؛ سعر قديم ومتاح غير كافٍ يُرفضان **عند الإنشاء** دون أثر حجز؛ سعر تغيّر بين الطلب و«ادفعي» يُرفض بلا حجز ولا محاولة؛ سقف المرسل (6 قطع)، وسقف الجوال (3 + 2 + 1)، وسقف الأمتار لمرسل (15+6 مرفوض، 15+5 = 20 مقبول)، ومرسل آخر لا يتأثر؛ سقف المتجر قطعاً (21) وأمتاراً (100 + 1) — **يُتخطى بإشعار إن وُجدت على الحي حجوزات حقيقية** (لا يكذب)؛ الصلاحيات.
  - **قبل الإصلاح** (المراحل كما هي): `FAILED -> TEST FAILED: creating the order reserves nothing: expected 0 but got 1`. **بعده:** PASS.
  - أثناء تشغيله يمسك قفل السقوف، فـ«ادفعي» حقيقية في تلك الثواني تنتظر ولا تفشل.
- **`verify-stages.cjs` — 62 ✔، 0 ✘:** كل اختبارات المراحل 2 → 9 وA وكل سيناريوهات التزامن القائمة **كما كُتبت، قبل B**؛ ثم: ترميز مشوّه يُرفض بلا أثر؛ `begin_payment` ببصمة أخرى ⇒ `…_DRIFT`؛ التطبيق مرتين؛ اختبارات المراحل 5 و6 و8 (الآمن والمحلي) و9 وA **فوق B**؛ اختبار B؛ أربعة سباقات حقيقية: (1) زبونتان و«ادفعي» على آخر قطعة في اللحظة نفسها — حجز واحد، والثانية تنتظر ثم تُبلَّغ بلا محاولة؛ (2) «ادفعي» مرتين معاً والمتجر عند 19 قطعة — الثانية تنتظر قفل السقوف ثم `hold_limit/store`، ولا يصير المحجوز 21 أبداً؛ (3) مبيعة محل و«ادفعي» على المتر نفسه — «ادفعي» يتراجع (`55P03`) والمبيعة تمر؛ (4) «ادفعي» بعد المهلة ⇒ `order_expired`؛ ثم التراجع (§6).
- **`verify-payments.cjs` — 18 ✔** (13 قائمة + 5 جديدة، طرف لطرف عبر `startPayment` الحقيقي وميسر الوهمي، والهجرة B فوق المرحلة 5): لا حجز عند الإنشاء وحجز بعد «ادفعي»؛ سقف المرسل ⇒ 429 `hold-limit-client` برسالته **ولا فاتورة لدى ميسر**؛ تغيّر السعر ⇒ 409 برسالة القاعدة العربية بلا محاولة ولا فاتورة؛ صف مخزون ممسوك من المحل ⇒ 503 `busy` بلا فاتورة، والضغطة التالية تنجح؛ طلب بعد مهلته ⇒ `order_expired`.
- **مع B في السلسلة:** `verify-confirm` 11 ✔، `verify-refunds` 13 ✔ (13/13 كما يشترط التكليف)، `verify-reconcile` 8 ✔.
- **`audit/audit-proofs.cjs`:** يطبّق A وB فوق الهجرات ⇒ **AUD-01 وAUD-02 يفشلان** (AUD-02 عند أول خطوة: `FABRIC_STORE_TOO_MANY_LINES`)؛ AUD-03…06 ما زالت تعيد الإنتاج (الدفعة C) — دليل أن B لم يكسر مسار الدفع.
- `tsc --noEmit` = 38 (خط الأساس). `eslint` على ملفات التطبيق الست: نظيف.

### 4.1 اختبارات معتمدة لا تُعاد بعد B — عمداً
تؤكد سلوك «الحجز عند الإنشاء» الذي ألغته المالكة: `supabase/tests/fabric_store_checkout.sql` (المرحلة 4: «عرض السعر يرى حجز الـ4 م»)، `scripts/db-local/stage6-local-sale.sql` («الاعتماد مقابل حجز آخر»)، `supabase/tests/fabric_store_order_admin.sql` (المرحلة 7: «إلغاء طلب غير مدفوع يحرر حجزه»)، وسباقا المرحلة 4 «نفس الطلب مرتين» و«متصفحان وآخر قطعة». **لم أعدّلها** (درس 31): تجري في `verify-stages` على المراحل كما كُتبت قبل B وتنجح، ويغطي اختبار B وسباقاته معناها الجديد. **على الحي بعد تطبيق B لا تُشغَّل هذه الثلاثة** (ستفشل في تلك الحالات).

## 5. الطفرات
**22/22 كُشفت**، كلٌّ بسببه المقصود (`mutate.cjs B` و`mutate.cjs ts "(fix B)"`):

| المجموعة | الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|---|
| B | creating an order still holds the stock | fix B SQL test (live-safe): FAILED -> TEST FAILED: creating the order reserves nothing: expected 0 but got 1 |
| B | creating an order no longer validates price and stock | fix B SQL test (live-safe): FAILED -> TEST FAILED: a stale price at creation: expected rejected/FABRIC_STORE_PRICE_CHANGED but got created |
| B | a six-line order is accepted | fix B SQL test (live-safe): FAILED -> TEST FAILED: a six-line order: expected rejected/FABRIC_STORE_TOO_MANY_LINES but got created/ |
| B | the hold at «ادفعي» lasts 45 minutes | fix B SQL test (live-safe): FAILED -> TEST FAILED: the hold lasts 25 minutes: expected true but got false |
| B | six pieces per holder | fix B SQL test (live-safe): FAILED -> TEST FAILED: the same sender holds a sixth piece: expected hold_limit/client but got created/ |
| B | 21 m per holder | fix B SQL test (live-safe): FAILED -> TEST FAILED: 15 m + 6 m from one sender: expected hold_limit/client but got created/ |
| B | 21 pieces on the store | fix B SQL test (live-safe): FAILED -> TEST FAILED: a 21st piece on the store: expected hold_limit/store but got created/ |
| B | 101 m on the store | fix B SQL test (live-safe): FAILED -> TEST FAILED: one metre over 100 m on the store: expected hold_limit/store but got created/ |
| B | the phone cap is not checked | fix B SQL test (live-safe): FAILED -> TEST FAILED: the same phone holds a sixth piece: expected hold_limit/phone but got created/ |
| B | the sender cap is not checked | fix B SQL test (live-safe): FAILED -> TEST FAILED: the same sender holds a sixth piece: expected hold_limit/client but got created/ |
| B | the store cap is not checked | fix B SQL test (live-safe): FAILED -> TEST FAILED: a 21st piece on the store: expected hold_limit/store but got created/ |
| B | two «ادفعي» are not serialised on the caps | fix B: two «ادفعي» at once with the store one piece below its cap: the second «ادفعي» must wait for the first to count |
| B | the sender of «ادفعي» is not recorded | fix B SQL test (live-safe): FAILED -> TEST FAILED: the sender of «ادفعي» is recorded: expected true but got <NULL> |
| B | an order past its deadline is still held | fix B: «ادفعي» after the 30-minute order deadline: {"status":"created","attempt_id":"29acfa82-d9fc-4466-ad0f-d015cdcfb216","expires_at":"2 |
| B | a refusal at «ادفعي» escapes as an error | fix B SQL test (live-safe): FAILED -> FABRIC_STORE_PRICE_CHANGED/تغيّر سعر القماش اختبار الحجز عند الدفع سعر منذ عرض السعر؛ أعيدي مراجعة ا |
| B | the server may read the senders | fix B SQL test (live-safe): FAILED -> TEST FAILED: service_role reads hold_clients: expected false but got true |
| B | a begin_payment we did not read is replaced (no fingerprint check) | fix B replaced a begin_payment it did not read |
| B | encoding self-check removed (fix B) | garbled fix B migration was APPLIED |
| ts:payments.ts | (fix B) a hold limit gets a generic answer | fix B: one sender over 20 m held is told why, and no invoice is made: {"ok":false,"httpStatus":400,"code":"hold_limit","error":"تعذّر بدء  |
| ts:payments.ts | (fix B) the database refusal message is dropped | fix B: the price changed after the order: the database message reaches the customer: The input did not match the regular expression /تغيّر |
| ts:payments.ts | (fix B) a shop sale holding the row is not recognised | fix B: a shop sale holds the stock row: «ادفعي» answers busy, no invoice: fabric_store_begin_payment: canceling statement due to lock time |
| ts:payments.ts | (fix B) an expired order gets a generic answer | fix B: «ادفعي» after the 30-minute order deadline: The input did not match the regular expression /أعيدي إنشاء الطلب/. Input: |

طبّقتُ درس الدفعة A مسبقاً: طفرة داخل إحدى الدالتين تغيّر بصمتها، فكانت إعادة التطبيق والتراجع سيتوقفان عند فحص البصمة قبل أي اختبار سلوكي؛ `verify-stages` يوجّه البصمتين الذاتيتين (في الهجرة وفي سكربت التراجع) إلى الجسم المطفَّر حين يتغير فقط — فبقيت طفرة «begin_payment لم نقرأه» مكشوفة بفحص البصمة نفسه، وكل الطفرات الأخرى كُشفت بالسلوك.

طفرة **مكافئة** تُركت عمداً (موثقة في `mutate.cjs`): حذف `service_role` من سحب صلاحيات `hold_clients` (لا صلاحيات افتراضية في `private`، على الحي ولا هنا) — فالطفرة المستعملة تمنحها صراحةً.

## 6. التراجع — `fixes/FIX-B-rollback.sql`
- **الخط الأول بلا قاعدة:** إطفاء `FABRIC_STORE_CHECKOUT_ENABLED` على Vercel (المتجر مطفأ أصلاً حتى الإطلاق).
- السكربت يعيد الدالتين **حرفياً** من ملفي المرحلتين 4 و5 (مُولَّد آلياً)، ويحذف `hold_clients`، ويتحقق أن البصمتين عادتا `b5b222ed…`/`69e5b1bc…`. وهذا **يعيد AUD-02**، لذلك:
  - يرفض ما لم يُعلَن في المعاملة نفسها: `set local fabric_store.rollback_b_ack = 'checkout-disabled';`
  - يرفض ما دامت صفحة دفع مفتوحة (بعد قفل جدول المحاولات `nowait`).
  - يرفض إن لم تكن الدالتان نسختي B (`FIX_B_ROLLBACK_DRIFT`).
- لا يمس صفاً. مُختبر في `verify-stages` (الرفضان، الاستعادة بايتاً ببايت، ثم إعادة B ونجاح اختباره).
- سكربتات التراجع القديمة: تراجع المرحلتين 4 و5 (في تقريريهما) يحذف الدالتين ويرفض ما دامت المراحل التالية مطبّقة — لا يعيدان النسخ القديمة فوق B. وتراجع المرحلة 2 يحذف جدول الطلبات الذي يشير إليه `hold_clients` — الترتيب الإلزامي (B أولاً) يحذفه قبله.

## 7. خطة التطبيق للمالكة
1. **بعد** هجرتي الدفعة A (ترتيب الدفعات؛ لا اعتماد تقني بينهما).
2. SQL Editor ← الصقي `supabase/migrations/20261003120000_fabric_store_hold_at_payment.sql` ← Run. لا يمس جداول المحل، فلا يحتاج إغلاق المحل؛ ومع ذلك الأفضل خارج ساعات الذروة. `…_DRIFT` أو `…_ENCODING` ⇒ توقفي وأرسلي؛ لم يتغير شيء.
3. الصقي `supabase/tests/fabric_store_hold_at_payment.sql` ← Run ⇒ `PASS fabric_store hold at payment`.
4. انشري كود التطبيق (الملفات في §3.4). الترتيب بين النشر والهجرة آمن في الاتجاهين: كود قديم مع قاعدة جديدة يعطي رسائل عامة للحالات الجديدة؛ كود جديد مع قاعدة قديمة يرفض أكثر من 5 أسطر مبكراً فقط.
5. لا تشغّلي بعد B اختبارات §4.1 الثلاثة.

## 8. ما لم يُتحقق منه
- **بصمتا الدالتين على الحي لم أقرأهما في هذه الجلسة** (اتصال Supabase مقطوع). القيمتان من ملفي الهجرتين، والتدقيق (30 سبتمبر) أثبت تطابق دوال المتجر الـ47 مع المستودع؛ والهجرة تتحقق بنفسها وترفض عند الاختلاف.
- المتصفح: صفحة إتمام الطلب والشروط لم تُفتحا.
- ثقة بصمة IP على Vercel (§3.3).
- ميسر الحقيقي (test) لم يُستدعَ: صفحة 20 دقيقة مقابل حجز 25 مختبرة على المحاكي فقط.

## 9. الملفات
| الملف | التغيير |
|---|---|
| `supabase/migrations/20261003120000_fabric_store_hold_at_payment.sql` | جديد |
| `supabase/tests/fabric_store_hold_at_payment.sql` | جديد (آمن على الحي) |
| `docs/…/payments/fixes/FIX-B-rollback.sql`، هذا الملف | جديدان |
| `src/…` (ست ملفات) | §3.4 |
| `scripts/db-local/verify-stages.cjs` | B بعد اختبارات المراحل؛ الاختبار قبل/بعد؛ الترميز والبصمة؛ 4 سباقات؛ التراجع؛ `--mutateB` |
| `scripts/db-local/verify-payments.cjs` | B فوق المرحلة 5؛ 5 سيناريوهات؛ `newOrder` بكمية |
| `scripts/db-local/verify-confirm.cjs`، `verify-refunds.cjs`، `verify-reconcile.cjs` | B في السلسلة |
| `scripts/db-local/audit/audit-proofs.cjs` | B في السلسلة |
| `scripts/db-local/lib.cjs` | `migrationB`، `testB`، `rollbackB` |
| `scripts/db-local/mutate.cjs` | `FIXB_MUTANTS` |
| `scripts/db-local/README.md` | قسم الدفعة B |
