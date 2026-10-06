# FIX-03 — الدفعة C: المال والاسترداد (AUD-06، 05، 04، 03، 08، 12)

موجّه لمراجع آلي مستقل. التاريخ: 5 أكتوبر 2026. (تحديث 6 أكتوبر: **الهجرة مطبّقة على الحي** — طبّقتها المالكة 5 أكتوبر، وطابق المراجع المستقل بصماتها؛ الكود لم يُنشر بعد. وقت كتابة التقرير لم يكن شيء مطبّقاً.)

| البند | ثبت؟ | الإصلاح | الاختبار الذي فشل قبل ونجح بعد |
|---|---|---|---|
| AUD-06 | **نعم** — `audit-proofs AUD-06`: دفعة test ⇒ `preparing:ok → ready_for_pickup:ok → delivered:ok` | `staff_set_fulfillment(…, p_allow_test)` + `getMoyasarConfig` + لافتة الزبونة | `fabric_store_money_guards.sql` §1؛ `verify-payments` «configuration refuses» |
| AUD-05 | **نعم** — `audit-proofs AUD-05` (فاتورتان مدفوعتان لطلب واحد) و`AUD-04` (إلغاء وصفحة مفتوحة: ok) | `begin_payment` يعيد رابط الفاتورة الفاشلة الصالحة؛ `set_fulfillment` يرفض الإلغاء وصفحة قابلة للدفع | §2 و§3؛ `verify-payments` سيناريوا «(fix C) declined…» |
| AUD-04 | **نعم** — `audit-proofs AUD-04/05`: بعد حسم مدير الأقمشة صفر تنبيهات، ولا مسار رد للدفعة الثانية | `refund_begin(…, p_attempt_id)` + `refund_finish` + تنبيهان محسوبان | §3 و§4؛ `verify-refunds` «(fix C, AUD-04)» |
| AUD-03 | **نعم** — `audit-proofs AUD-03`: `already_paid`، `needs_review=false`، صفر تنبيهات، ثم `mismatch` للأبد | `provider_refunded_halalas` + فحص في `apply_payment` + `refund_record_external` + تنبيه `external_refund` | §5؛ `verify-refunds` «(fix C, AUD-03)» |
| AUD-08 | **نعم** من الكود (كما في التقرير) | `support_reference` إلزامي بعد إغلاق استرداد نُودي عليه + كشف التنفيذ المتأخر | §6؛ `verify-refunds` «(fix C, AUD-08)» |
| AUD-12 | **نعم** — جسما الدالتين لا يقرآن `public.users` | `private.fabric_store_actor_is_admin` في 4 دوال | §4 و§5 و§6؛ `verify-refunds` «(fix C, AUD-12)» |

`audit/audit-proofs.cjs` بعد C: سيناريوهات AUD-03/04/05/06 **تفشل** كلها (المتوقع)، كل منها عند الخطوة التي يغلقها الإصلاح:
AUD-03 `needs_review true !== false` · AUD-04 `payment_in_progress` بدل `ok` · AUD-05 محاولة واحدة لا اثنتان · AUD-06 `unfulfilled` بدل `delivered`.

## 1. قرارات المالكة (5 أكتوبر 2026، أسئلة محددة الخيارات)

| السؤال | القرار |
|---|---|
| طلب دُفع ببطاقة ميسر التجريبية | **يُمنع إلا للمدير بعلامة** («تجربة اللوحة»)؛ مدير الأقمشة لا أبداً |
| إلغاء طلب غير مدفوع وصفحة دفعه مفتوحة | **يُرفض حتى تنتهي الصفحة** |
| من يحسم مراجعة سببها مالي | **المدير ومدير الأقمشة** (كما اليوم) ⇒ التنبيهات المالية تبقى ما دام المال لم يُرد، مهما حُسمت المراجعة |
| استرداد جديد بعد إغلاق استرداد أُرسل ولم يظهر | **فقط بمرجع من دعم ميسر** |

## 2. التحقق من ميسر (توثيق رسمي، 5 أكتوبر)

- حالات **الفاتورة**: `initiated` (أول حالة، غير مدفوعة) ← `paid` / `expired` / `canceled` (يلغيها التاجر من اللوحة). **لا حالة «فشل» للفاتورة**: رفض البطاقة يُفشل **الدفعة** وتبقى الفاتورة قابلة للدفع حتى انتهائها. لذلك إعادة رابطها هي الإصلاح، لا فاتورة جديدة.
- **لم أجد في التوثيق واجهة API لإلغاء فاتورة** (الإلغاء مذكور من لوحة التحكم فقط). لم تُخترع واجهة (FIX-PROMPT §4/C-2).
- يبقى للتحقق بمفتاح test (§7): أن صفحة الفاتورة تقبل محاولة ثانية بعد رفض البطاقة، وحالة الدفعة و`refunded` بعد استرداد جزئي من اللوحة.

## 3. الهجرة `supabase/migrations/20261005120000_fabric_store_money_guards.sql`

دوال المتجر وأعمدة جداوله فقط؛ **لا جدول ولا trigger ولا دالة للمحل**، ولا قفل على `income` أو المخزون (تُطبَّق في أي وقت).

**الفحص المسبق:** المرحلة 9 والدفعة B موجودتان؛ بصمة `md5(replace(prosrc, E'\r\n', E'\n'))` لكل دالة تُستبدل = نسختها في ملف هجرتها (التدقيق أثبت تطابق دوال المتجر الحية مع المستودع)، أو نسخة هذه الهجرة (إعادة التطبيق آمنة). للدالتين اللتين يتغير توقيعهما: القديمة ببصمتها، أو الجديدة قائمة. أي اختلاف ⇒ `FABRIC_STORE_FIX_C_DRIFT` ولا يتغير شيء. فحص ترميز ذاتي في آخرها.

| # | التغيير | البند |
|---|---|---|
| 1 | أعمدة: `payment_attempts.provider_refunded_halalas` (≥ 0)، `refunds.support_reference` و`external_reference` (3–120 حرفاً) + trigger يمنع تغييرهما بعد الكتابة | 03، 08 |
| 2 | `private.fabric_store_actor_is_admin(uuid)`: `users.role = 'admin' and is_active`. لا يصلها anon/authenticated | 12 |
| 3 | `begin_payment`: محاولة `failed` لها رابط وفاتورتها لم تنتهِ ⇒ `existing` بالرابط نفسه؛ إن بقي أقل من دقيقة ⇒ `invoice_closing` (+ `retry_after`). فاتورة جديدة بعد انتهاء القديمة فقط | 05 |
| 4 | `staff_set_fulfillment` **توقيع جديد** (+ `p_allow_test boolean default false`؛ القديم يُحذف — الدرس 26): تقدّم طلب test ⇒ `test_order` بلا العلامة، `forbidden` بالعلامة من غير المدير الفعّال، وإلا يمر ويُسجَّل حدث «تجربة اللوحة…». الإلغاء ⇒ `payment_in_progress` ما دامت محاولة `created/initiated/authorized/failed` لم تنتهِ (`clock_timestamp()`) | 06، 05 |
| 5 | `apply_payment`: في فرع السداد (غير «دفعة ثانية على الفاتورة نفسها») يحفظ `max(provider_refunded, refunded)`؛ `refunded` > سجلنا (`pending + succeeded`) ⇒ مراجعة + `notify_staff` (`external_refund:<payment>:<refunded>`) + الحدث `quarantined` بسببه. **السداد نفسه يُسجَّل كما كان** والنتيجة (`paid`/`already_paid`) لا تتغير، فيمضي الاعتماد. فرعا `refunded` يحفظان المسترد أيضاً | 03 |
| 6 | `refund_begin` **توقيع جديد** (+ `p_attempt_id`، `p_support_reference`؛ القديم يُحذف): المدير الفعّال وإلا `forbidden`؛ محاولة `paid` غير معتمدة للطلب ⇒ رد كامل فقط (`extra_full_only`)، بلا فحوص القص والمبيعة؛ إغلاق سابق على الدفعة نفسها بعد نداء (`failed` + `provider_called_at` + `review_reference`) ⇒ `support_reference_required` ما لم يُعطَ مرجع | 12، 04، 08 |
| 7 | `refund_finish`: استرداد على محاولة ليست `paid_attempt_id` ⇒ لا تغيير لحالة دفع الطلب ولا صف مرتجع ولا إلغاء؛ ويحفظ `provider_refunded_halalas` بعد النجاح | 04 |
| 8 | `refund_close_unconfirmed`: المدير الفعّال وإلا `forbidden` | 12 |
| 9 | جديد `refund_record_external(order, attempt, actor, label, amount, reference, reason, provider_refunded, key)`: المدير الفعّال؛ محاولة `paid` للطلب؛ لا استرداد معلّق؛ المبلغ = `provider_refunded − الناجح`؛ مبيعة حقيقية لم تُسجَّل ⇒ `sale_pending`. يُدرج صفاً `pending` بلا `provider_called_at` ثم يُنهيه `succeeded` **بالمسار نفسه** (`refund_finish`: حالة الدفع + صف المرتجع). **لا نداء لميسر**؛ لا إعادة قماش آلياً | 03 |
| 10 | `staff_alerts` + `extra_payment_unrefunded` (محاولة `paid` ليست المعتمدة ولم تُرد كاملة)، `cancelled_paid_unrefunded` (طلب ملغى `paid/partially_refunded`)، `external_refund` (`provider_refunded` > `pending + succeeded`). محسوبة من الحالة؛ الحسم لا يمحوها | 04، 03، 08 |

قاعدة «نداء استرداد واحد لكل استرداد أبداً» كما هي: `refund_mark_called` و`due_refunds` لم يتغيرا.

**لماذا `pending + succeeded` لا `succeeded` وحده (مخاطر AUD-03 في التقرير):** استردادنا المنادى ولم يُسجَّل نجاحه بعد يُظهره ميسر مسترداً؛ مقارنته بالناجح وحده كانت ستحجر استرداداً صحيحاً. اختبار §5 والطفرة «our own refund in flight counts as external» يثبتان ذلك.

## 4. التطبيق (TypeScript)

| الملف | التغيير |
|---|---|
| `src/lib/server/fabric-store/moyasar.ts` | `sk_test_` مع `VERCEL_ENV=production` ⇒ `test-on-production` ما لم يكن `FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION=true` |
| `src/lib/server/fabric-store/payments.ts` | رسالة `invoice_closing` |
| `src/lib/server/fabric-store/refunds.ts` | `startRefund` + `attemptId`/`supportReference` (يُرسلان **فقط حين يُستعملان** — الدرس 41)؛ رسائل `forbidden`/`extra_full_only`/`support_reference_required`؛ `recordExternalRefund` يجلب `refunded` من ميسر بمفتاحنا ثم يستدعي القاعدة (لا نداء استرداد) |
| `src/app/api/fabric-store/staff/orders/[id]/route.ts` | GET: لكل محاولة `isExtra`، `extraUnrefundedHalalas`، `externalUnrecordedHalalas`؛ `supportReferenceRequired`؛ المرجعان في الاستردادات؛ `refundableHalalas` على المحاولة المعتمدة فقط. POST: `allowTest` (403 لغير المدير، ويُرسل `p_allow_test` فقط حين يُطلب)، `attemptId`/`supportReference` في `refund`، إجراء جديد `refund_external` (المدير)، رسائل `test_order`/`payment_in_progress` (بوقت انتهاء الصفحة)/`forbidden` |
| `src/app/dashboard/accounting/fabrics/online-orders/page.tsx` | أزرار التجهيز لطلب test للمدير فقط وبتأكيد «تجربة اللوحة»؛ وسوم المحاولات (دفعة إضافية، استرداد خارجي)؛ قسم رد الدفعة الإضافية وقسم تسجيل الاسترداد الخارجي (للمدير)؛ حقل مرجع دعم ميسر حين يلزم؛ تسميات التنبيهات الثلاثة |
| `src/app/api/fabric-store/payment/status/route.ts` · `src/app/fabrics/payment/return/page.tsx` | `isTest` ⇒ «دفعة تجريبية (بطاقة اختبار) — لم يُخصم مال، ولن يُجهَّز أو يُسلَّم شيء» |
| `src/app/api/fabric-store/track/route.ts` · `src/app/fabrics/order/page.tsx` | `isTest` من بيئة المحاولة المعتمدة؛ اللافتة نفسها |

`npx tsc --noEmit`: **38 خطأ = خط الأساس**، لا شيء في الملفات أعلاه. `eslint` على الملفات التسعة: نظيف.

## 5. حصر المستهلكين والأثر على المحل

- **المحل:** لا تغيير في `income` ولا triggerاته ولا حارس المخزون ولا شاشات الواردات. صف المرتجع يُكتب بالمسار القائم (`refund_finish`) نفسه، ولا يُكتب لدفعة إضافية.
- **`staff_set_fulfillment`** (6 → 7 معاملات): المستهلكون — مسار اللوحة، `audit-proofs`، `verify-refunds`، `verify-review-fixes`، `stage8-local-refund.sql`، اختبارات المراحل 7 و8 و9، `stage-08-rollback.sql`. الاستدعاءات بالموضع (6 معاملات) تُحل إلى الجديدة بقيمة `false`. اختبار المرحلة 7 لا يُشغَّل بعد B أصلاً.
- **`refund_begin`** (7 → 9): المسار، `refunds.ts`، الاختبارات أعلاه، `stage-08-rollback.sql` (يرفض أصلاً ما دام تصحيح 8 مطبّقاً، وتراجع 9 يرفض ما دامت C مطبّقة).
- **اختبارات معتمدة صارت تعرف C** (الدرس 42) لأنها تؤكد ما يزيله الإصلاح: `fabric_store_payments.sql` §5 (فاتورة جديدة فور الرفض)، `fabric_store_refunds.sql` (فاعل غير موجود في `users`؛ تقدّم طلبات test؛ إلغاء وصفحة مفتوحة؛ استرداد جديد بعد الإغلاق)، `fabric_store_reconciliation.sql` (الفاعل وتجهيز طلب test). الفاعل صار مديراً فعّالاً يُقرأ من `public.users`. **تنجح قبل C وبعدها وبعد تراجعها** (`verify-stages`).
- **ترتيب النشر:** الهجرة **قبل** الكود — `GET` لوحة الطلبات يقرأ الأعمدة الجديدة. الإجراءات العادية (تجهيز، استرداد) تعمل على الحالتين لأن المعاملات الجديدة لا تُرسل إلا عند استعمالها.
- **بيئة الإنتاج:** بعد النشر، `sk_test_` على Production يُرفض (الـwebhook وبدء الدفع يردان «غير متاح») ما لم يُضبط `FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION=true`. المالكة تختبر على الإنتاج بمفتاح test الآن.

## 6. الاختبارات

| الأداة | النتيجة |
|---|---|
| `supabase/tests/fabric_store_money_guards.sql` (جديد، آمن على الحي) | يفشل قبل C عند الحالة 0؛ PASS بعدها |
| `verify-stages` (كامل، مع التزامن) | exit 0: كل اختبارات المراحل قبل B وبعدها، ثم C: يفشل اختبارها قبلها، الترميز المشوّه مرفوض بلا أثر، بصمة مختلفة مرفوضة، التطبيق مرتين، اختبارات 5/6/8/8-محلي/9/A/B/C بعدها PASS، تراجعا 9 وB يرفضان، تراجع C يرفض بلا إعلان ومع استرداد معلّق ثم يعيد الدوال السبع حرفياً، اختبارا 8 و9 بعد التراجع PASS، إعادة C بعده PASS |
| `verify-payments` | exit 0 (+ سيناريوا الدفعة C، وفحص مفتاح test على الإنتاج) |
| `verify-confirm` | exit 0 (يطبّق الآن 7 → 9 ثم C) |
| `verify-refunds` | exit 0 — 17 سيناريو (13 السابقة + 4 للدفعة C) |
| `verify-reconcile` | exit 0 |
| `rollback-cycle`، `verify-finance-rls`، `verify-review-fixes` | exit 0 |
| `audit-proofs` | AUD-03/04/05/06 تفشل (أُغلقت)؛ AUD-01/02 تفشل منذ A وB |

## 7. الطفرات

**31/31 كُشفت** (26 SQL عبر `verify-stages` + 5 TS عبر `verify-payments`/`verify-refunds`). خمس طفرات خرجت في التشغيل الجماعي بلا سطر ✘ (تشغيل تزامن مع أدوات أخرى على الجهاز)؛ أُعيدت كل واحدة منفردة وسبب كشفها أدناه (الدرس 11: السبب لا الفشل).

| المجموعة | الطفرة | سبب الكشف (أول سطر ✘) |
|---|---|---|
| C | a test order moves without the flag (AUD-06) | fix C SQL test (live-safe): FAILED -> TEST FAILED: no flag: expected status test_order but got: {"status": "ok", "released_holds": 0, "ful |
| C | the test-order flag works for any actor (AUD-06) | fix C SQL test (live-safe): FAILED -> TEST FAILED: flag from a non-admin: expected status forbidden but got: {"status": "ok", "released_ho |
| C | the dashboard trial on a test order is not logged (AUD-06) | fix C SQL test (live-safe): FAILED -> TEST FAILED: the dashboard trial on a test payment is logged *(أُعيد منفرداً)* |
| C | cancelling while the payment page is open (AUD-05) | stage 8 SQL test after C (live-safe): FAILED -> TEST FAILED: cancel with the page open: expected status payment_in_progress but got: {"sta *(أُعيد منفرداً)* |
| C | a payable declined page does not block cancelling (AUD-05) | fix C SQL test (live-safe): FAILED -> TEST FAILED: cancel with a payable declined page: expected status payment_in_progress *(أُعيد منفرداً)* |
| C | a declined invoice gets a second invoice beside it (AUD-05) | fix C SQL test (live-safe): FAILED -> TEST FAILED: «ادفعي» again: expected status existing but got: {"status": "created", "attempt_id": "2 |
| C | a declined invoice about to end is still handed out (AUD-05) | fix C SQL test (live-safe): FAILED -> TEST FAILED: the old page is about to end: expected status invoice_closing but got: {"status": "exis |
| C | an external refund is not detected (AUD-03) | fix C SQL test (live-safe): FAILED -> TEST FAILED: a refund outside the system is flagged and alerted: {"status": "already_paid", "order_i |
| C | our own refund in flight counts as external (AUD-03) | fix C SQL test (live-safe): FAILED -> TEST FAILED: our own refund in flight is not an external refund: {"status": "already_paid", "order_i |
| C | Moyasar's refunded amount is not kept (AUD-03) | fix C SQL test (live-safe): FAILED -> TEST FAILED: a refund outside the system is flagged and alerted: {"status": "already_paid", "order_i |
| C | refund_begin trusts the actor id (AUD-12) | fix C SQL test (live-safe): FAILED -> TEST FAILED: not an admin: expected status forbidden but got: {"status": "started", "refund_id": "1b |
| C | refund_close_unconfirmed trusts the actor id (AUD-12) | fix C SQL test (live-safe): FAILED -> TEST FAILED: close: not an admin: expected status forbidden but got: {"status": "ok"} |
| C | record_external trusts the actor id (AUD-03/12) | fix C SQL test (live-safe): FAILED -> TEST FAILED: record it: not an admin: expected status forbidden but got: {"status": "ok", "refund_id |
| C | record_external accepts any amount (AUD-03) | fix C SQL test (live-safe): FAILED -> TEST FAILED: record it: another amount: expected status amount_mismatch but got: {"status": "ok", "r |
| C | an extra payment may be refunded in part (AUD-04) | fix C SQL test (live-safe): FAILED -> TEST FAILED: part of it: expected status extra_full_only but got: {"status": "started", "refund_id": |
| C | refunding an extra payment changes the order's payment status (AUD-04) | fix C SQL test (live-safe): FAILED -> TEST FAILED: refunding the extra payment leaves the order paid by B, with no return row |
| C | a new refund after a closed sent one needs no reference (AUD-08) | stage 8 SQL test after C (live-safe): FAILED -> TEST FAILED: a new refund after the decision, no support reference: expected status suppor |
| C | an extra payment is not alerted (AUD-04) | fix C SQL test (live-safe): FAILED -> TEST FAILED: an extra payment is an alert |
| C | a payment on a cancelled order is not alerted (AUD-04) | fix C SQL test (live-safe): FAILED -> TEST FAILED: a payment on a cancelled order is an alert |
| C | an unrecorded external refund is not alerted (AUD-03) | fix C SQL test (live-safe): FAILED -> TEST FAILED: a refund outside the system is flagged and alerted: {"status": "already_paid", "order_i |
| C | the old set_fulfillment is kept beside the new one | stage 8 local refund test after C: FAILED -> function public.fabric_store_staff_set_fulfillment(uuid, unknown, unknown, unknown, unknown,  |
| C | the old refund_begin is kept beside the new one | stage 8 SQL test after C (live-safe): FAILED -> function public.fabric_store_refund_begin(uuid, uuid, unknown, bigint, text, boolean, uuid |
| C | a browser role may record an external refund | fix C SQL test (live-safe): FAILED -> TEST FAILED: authenticated can execute public.fabric_store_refund_record_external(…) *(أُعيد منفرداً)* |
| C | the external reference can be rewritten | fix C SQL test (live-safe): FAILED -> TEST FAILED: the external reference was rewritten *(أُعيد منفرداً)* |
| C | functions we did not read are replaced (no fingerprint check, fix C) | fix C replaced a refund_finish it did not read |
| C | encoding self-check removed (fix C) | garbled fix C migration was APPLIED |
| ts:moyasar.ts | (fix C) a test key is accepted on the production deployment | configuration refuses what it must: Expected values to be strictly equal: |
| ts:payments.ts | (fix C) the closing-invoice answer is generic | (fix C) declined, the old page about to end, then ended: wait, then a new invoice: The input did not match the regular expression /تنتهي خ |
| ts8:refunds.ts | (fix C) the extra payment is not passed to the database | (fix C, AUD-04) a second payment on another invoice: refunded in full with one call; the sale untouched: Expected values to be strictly eq |
| ts8:refunds.ts | (fix C) Moyasar support's reference is not passed | (fix C, AUD-08) after a sent refund was closed, a new one needs Moyasar support's reference; a late execution is flagged: {"ok":false,"htt |
| ts8:refunds.ts | (fix C) recording trusts the typed amount instead of asking Moyasar | (fix C, AUD-03) a partial refund in the Moyasar dashboard: flagged, recorded without a call, then refunds work: Expected values to be stri |

## 8. التراجع — `fixes/FIX-C-rollback.sql`

مولَّد من ملفات الهجرات نفسها: يعيد `begin_payment` (B)، `staff_set_fulfillment` و`refund_begin` و`refund_finish` (المرحلة 8)، `apply_payment` و`refund_close_unconfirmed` (تصحيح 8)، `staff_alerts` (المرحلة 9) **حرفياً** ويفحص بصماتها في آخره؛ ويحذف التوقيعين الجديدين و`record_external` وفحص المدير وtrigger المرجعين.

- **يرفض** ما لم تُعلَن في الجلسة `set local fabric_store.rollback_c_ack = 'payments-and-refunds-disabled';` (يعيد فتح الثغرات الست؛ التراجع الأول دائماً إطفاء المفتاحين).
- **يرفض** مع بصمة لا تطابق نسخ C، ومع أي استرداد معلّق (نسخة المرحلة 8 من `refund_finish` كانت ستكتب مرتجعاً للمبيعة على استرداد دفعة إضافية)، ومع صفحة دفع قابلة للدفع — بعد قفل الجدولين `nowait`.
- **يبقى عمداً:** الأعمدة الثلاثة وقيودها وصفوف الاسترداد المسجّلة بها (مال رُدّ فعلاً، سجل تدقيق).
- تراجع المرحلة 9 وتراجع B يرفضان الآن ما دامت C مطبّقة (الترتيب C ← B ← A ← 9).
- بعد التراجع يُعاد نشر الكود السابق أو يبقى الحالي: الإجراءات العادية تعمل (لا تُرسل المعاملات الجديدة)، وما يحتاج C يُرفض من القاعدة.

## 9. خطة التطبيق للمالكة

1. SQL Editor ← لصق `20261005120000_fabric_store_money_guards.sql` ← تشغيل (أي وقت).
2. لصق `supabase/tests/fabric_store_money_guards.sql` ← آخر صف `PASS fabric_store money guards (…)`.
3. (يُستحسن) `fabric_store_refunds.sql` و`fabric_store_reconciliation.sql` — صارا يعرفان C؛ لم يُشغَّلا على الحي بعد (HANDOFF §7).
4. **ثم** نشر الكود.
5. Vercel (Production): `FABRIC_STORE_ALLOW_TEST_ON_PRODUCTION=true` ما دام المفتاح `sk_test_` والتجارب جارية؛ يُحذف قبل الإطلاق.
6. تجربتان بمفتاح test (للبندين «للتحقق» في التقرير):
   - **بطاقة مرفوضة ثم إعادة:** «ادفعي» ← بطاقة test مرفوضة ← ارجعي واضغطي «إعادة محاولة الدفع» ⇒ تفتح **الصفحة نفسها**؛ ادفعي ببطاقة ناجحة ⇒ يُعتمد الطلب (يثبت أن فاتورة ميسر تقبل محاولة ثانية).
   - **استرداد جزئي من لوحة ميسر test** على دفعة test: بعده سجّلي من لوحة ميسر حالة الدفعة وحقل «المسترد»، وأرسلي رقم الطلب — أتحقق قراءةً أن الطلب رُفع للمراجعة وظهر «استرداد خارج النظام لم يُسجَّل» (يحتاج مفتاح المطابقة أو وصول webhook)، ثم سجّليه من صفحة الطلب.

## 10. ما لم يُتحقق منه

- سلوك ميسر الحقيقي في البندين أعلاه (المحاكي مبني من التوثيق).
- **استرداد خارجي كامل قبل القص:** يُسجَّل `refunded` بلا إلغاء ولا إعادة قماش آلياً (`record_external` لا يعيد قماشاً، و`restock_return` يشترط القص، و«إلغاء» طلب مسترد كامل مرفوض `refund_required`). يبقى الطلب «لم يُجهَّز» مسترداً والقماش مخصوماً حتى تصحيح يدوي في المخزون. حالة نادرة (رد من لوحة ميسر خلاف التعليمات)؛ لم تُعالج في هذه الدفعة.
- **دفعتان ناجحتان على الفاتورة نفسها** (`overpaid` على المحاولة نفسها): لا يوجد لها رد من النظام (الاسترداد يستهدف `provider_payment_id` للمحاولة) — ميسر لا يقبل عادةً دفعة ثانية لفاتورة مدفوعة؛ تبقى علامة المراجعة وحدها كما كانت.
- واجهة اللوحة الجديدة لم تُجرَّب في متصفح (tsc وeslint فقط).
