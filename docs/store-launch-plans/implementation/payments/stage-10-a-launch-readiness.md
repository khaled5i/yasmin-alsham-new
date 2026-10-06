Written for: المراجع الآلي

# المرحلة 10 — الجزء A: جرد جاهزية الإطلاق

التاريخ: 6 أكتوبر 2026، بتوقيت الرياض. النسخة 1. **النتيجة: الجزء A منفّذ؛ تفعيل البيع الحقيقي غير منجز وتوجد موانع موثقة.**

## 1. نطاق التكليف وقرار تجاوز التجارب

المالكة طلبت تنفيذ `STAGE-10-PROMPT.md`، وأكدت نشر الهجرة E وإتمام إعدادات جوجل وعدم وجود تعليقات من المراجع. استوضحت عن تجارب test المطلوبة في G3؛ أجابت إنها لم تُجرَّب وليس لديها وقت، ثم وجّهت صراحةً: «لا تتقيد بهذا الشرط ابددا بتنفيذ الخطة».

نُفّذ الجزء A بعد تسجيل تجاوز **إلزام G3 فقط**، دون وصف التجارب بالناجحة. لم يُفترض إذن بتجاوز بوابة الأمن G6 أو كتابة الإنتاج أو تغيير إعدادات/مفاتيح Vercel أو إتمام دفعة وفاتورة واسترداد حقيقية أو فتح المتجر للعموم. لا أجزاء B–F في هذا التسليم.

## 2. الملفات والتغطية

- `LAUNCH-CHECKLIST.md`: يغطي بوابات G1–G6، المتطلبات السبعة «قبل أول بيع» من الخطة 04، كل عناصر صف المرحلة 10 من HANDOFF §6، وجميع صفوف HANDOFF §7 (H01–H27)، مع دليل/نقص ومسؤول وموعد إغلاق نسبي.
- `HANDOFF.md` و`fixes/FIX-STATUS.md`: إضافة حالة حالية مؤرخة وتصحيح وصف «الكود ينتظر النشر / E تنتظر التطبيق»، مع إبقاء التقارير السابقة كتاريخ. لم يُعدّل تقرير المراجع المستقل.
- هذا التقرير: دليل مستقل قابل لإعادة الفحص، وحدود التحقق وخطة التراجع عن الوثائق.

## 3. أدلة الإنتاج الحالية — قراءة فقط

فُحص Vercel والمشروع `qbbijtyrikhybgszzbjz` بين نحو 15:35 و15:45 بتوقيت الرياض. استُخدمت metadata وSELECT للكتالوج وعدّ مجمّع فقط، لا صفوف عملاء ولا صورهم ولا دوال تغيّر حالة.

### النشر والقراءة العامة

| الفحص | النتيجة |
|---|---|
| Vercel project | `yasmin-alsham-new2`، `prj_yfI0cIST6V6CEbquloqKLfQCiaxB` |
| نشر الإنتاج | `dpl_DPPjRb9dAwK7zk1LfhoSkTrQYj1T`، READY، production، منطقة iad1 |
| SHA | `df0e3c720983e6a352b0561ad6f37a4b3f602d25` = HEAD الحالي؛ C/D/E موجودة فيه |
| ربط النطاق | alias يشمل `www.yasmin-alsham.fashion` و`yasmin-alsham.fashion`؛ النطاقان verified، وapex يحوّل إلى www |
| GET `/fabrics/` | 200؛ `X-Frame-Options: DENY`، `X-Content-Type-Options: nosniff`، `Referrer-Policy: strict-origin-when-cross-origin`، CSP Report-Only موجودة |
| HEAD مجهول لـfabrics | قائمة المصدر `FABRIC_PUBLIC_COLUMNS` (49 عموداً)، active + available + deleted_at is null: 200، Content-Range `0-415/416`، بلا جسم أو تنزيل صفوف |
| الصفحات | sales-terms، shipping-policy، return-policy، privacy-policy، fabrics/order، fabrics/payment/return: كلها 200؛ حارس `ga-disable` موجود في HTML |
| بيانات المنشأة | الاسم والسجل في الصفحات المفحوصة؛ VAT ظاهر في الشروط/الشحن/الاسترجاع والتذييل المفحوص. لا مقارنة مع وثائق رسمية |
| حدود المتصفح | محاولة إنشاء IAB رفضت لأن المتصفح غير متاح؛ inventory: browsers=[] وapps=[]. لا فحص بصري أو جلسة إدارة أو جوال فعلي. 200 وHEAD لا يثبتان ظهور القائمة أو صلاحية الشاشات |

### بصمات C/D/E وصلاحياتها

حُسبت بصمات المصدر من أجسام `create or replace function … as $$…$$` بعد توحيد CRLF إلى LF، وقورنت بـ`md5(replace(prosrc,E'\r\n',E'\n'))` على الحي. النتائج التالية متطابقة:

| الدفعة | الدالة | MD5 |
|---|---|---|
| C | private.fabric_store_guard_refund_batch_c | `479f0c26cd9273c572b80bb9cb760c10` |
| C | private.fabric_store_actor_is_admin | `2bb3f74aae519386a9b34f502c6f643f` |
| C | public.fabric_store_begin_payment | `473981a63b6bad888d09387cd3007512` |
| C | public.fabric_store_staff_set_fulfillment | `7881b262985db9cac3f2e7e96cb019b5` |
| C | public.fabric_store_apply_payment | `409ccff40230a97c87746ac94d849a43` |
| C | public.fabric_store_refund_begin | `3d48074794f708dbaf67087f9e283f8e` |
| C | public.fabric_store_refund_finish | `0e6d1c21e280876e68ae2af8bcc0ec61` |
| C | public.fabric_store_refund_close_unconfirmed | `c9f8fa22045b74f78d348999da316fad` |
| C | public.fabric_store_refund_record_external | `2dc9b1bdcb841fe1787fd9b1f843e11a` |
| C | public.fabric_store_staff_alerts | `e2b2ab019bc598894c0cc9fd3b042c77` |
| D | private.fabric_store_guard_address | `68f6ef6edfbd526af49fa36d92194618` |
| D | public.fabric_store_due_reconciliation | `beab268fdfdd468c4e702aaf92299b51` |
| E | public.fabric_store_purge_addresses | `7e9dc8df2aaaffff0c6d0b8e003c7ebc` |

purge D القديمة (`3af727…`) استُبدلت بـE، وهذا اختلاف مقصود لا drift. جسم E المقروء يرفض NULL أو أقل من interval 90 days قبل UPDATE. **لم تُستدعَ الدالة حتى بمدة صفرية**. EXECUTE للـRPCs العامة المفحوصة للخدمة وحدها، لا anon/authenticated؛ الحارسان ومساعد المدير الخاص غير ممنوحة للأدوار الثلاثة. fulfillment السباعية وrefund_begin التساعية هما التوقيعان اللذان أعادهما جرد الاسم.

القراءة أثبتت أيضاً:

- `create_checkout` بصمة B: `a50962d6f5a166c8ea8a7361c2827551`؛ begin_payment الآن C.
- A: RLS على income/expenses، anon SELECT=false، authenticated TRUNCATE=false؛ can_access_finance_branch بصمتها `dcbefbdead421cd4078e9fe6a7df58b6`؛ 13 unchecked لا EXECUTE لـanon/authenticated/service_role.
- fabrics: 54 عموداً، 49 مقروءة لـanon. grants العمود لا يُخلط بمنح الجدول.
- confirm_order(uuid)، due_outbox(text[],integer,uuid)، resolve_review(uuid,uuid,text,jsonb) موجودة ومغلقة عن المتصفح. لم تُقارن كل أجسام المراحل الأقدم بالمصدر في هذا الفحص.
- triggers income المفحوصة مفعّلة، بما فيها protect_online_sale وsync_fabric_sale_inventory؛ لم تُنفّذ مبيعة لاختبارها.
- سياسات users/workers المقيدة وحارسا prevent_user_self_reactivation/prevent_worker_self_escalation موجودة ومفعلة؛ عبارة HANDOFF القديمة «ترحيلات 20260920120* لم تطبق» لا تصف الحي الحالي.
- عدّ مجمّع FS-100269: طلب واحد paid، محاولة test واحدة معتمدة، بلا income. دليل تاريخي جزئي، لا إثبات جديد لتجارب C/E أو للـwebhook وحده.

### سجل الترحيلات

A/B مسجلتان بالأرقام `20261003101953` و`20261003102028` و`20261003102058`. المراحل 2/3/4 و8/تصحيحها/9 موجودة في السجل بالأرقام المعروفة. **C/D/E ليست مسجلة بالأرقام المصدرية في السجل المقروء**؛ أجسامها الفعلية تثبت التطبيق من SQL Editor. لا يُسجّل اسم هجرة ولا تُعاد ولا يُشغّل db push بهذا العمل.

### البيئة — metadata بلا أسرار

نُودي `filter_project_envs(decrypt=false)` ونُقّحت النتيجة داخل التنفيذ إلى الاسم والنطاق والنوع فقط. لم تُطلب قيم حساسة أو يُطبع سر أو يُكتب إلى ملف.

مدرج في Production: `MOYASAR_SECRET_KEY`، `MOYASAR_WEBHOOK_SECRET`، `CRON_SECRET`، `FABRIC_STORE_ACCESS_SECRET`، `FABRIC_STORE_CHECKOUT_ENABLED`، `NEXT_PUBLIC_FABRIC_STORE_CHECKOUT_ENABLED`، و`ALOSTAZ_API_TOKEN` (الأخير يشمل Preview أيضاً). **نوع مفتاح ميسر test/live غير معلوم** وقيم التفعيل الحساسة غير مقروءة.

مفتاحا ORDERS مدرجان لـPreview وحده. مفاتيح PAYMENTS وREFUNDS وRECONCILE وALOSTAZ الخاصة بالمتجر وإذنا ALLOW_LIVE_PAYMENTS/ALLOW_TEST_ON_PRODUCTION غير مدرجة في النتيجة. الافتراضي false في المصدر؛ هذا ليس تدقيقاً لكل متغير build/runtime داخل النشر أو إعداد حساب ميسر. تهيئة C قرار المالكة لاحقاً.

## 4. G6 — المخاطر الأمنية المفتوحة وحدود تصنيفها

| المرجع | الدليل الحالي | الحكم وحدوده |
|---|---|---|
| SEC-06 | package-lock يقفل Next.js 15.3.6؛ المشروع App Router | مانع عالٍ معروف ضمن الخطة: النشرة الرسمية تحدد إصلاح خط 15.3 عند 15.3.8 لتلك الثغرات. ليس ادعاء أن 15.3.8 آخر إصدار آمن اليوم؛ اختيار تحديث حالي يحتاج مراجعة النشرات واختبار انحدار مستقل. لا استغلال حي. [نشرة Next.js](https://nextjs.org/blog/security-update-2025-12-11) |
| SEC-05 | `src/app/api/translate-text/route.ts`: POST يتحقق من مفتاح الخدمة والمدخلات ثم ينادي OpenAI، دون هوية/حصة؛ لا middleware/proxy ظاهر في جرد المصادر | حماية المصدر المنشور غير مكتملة. لا نداء مكلف على الإنتاج، ولا إثبات استغلال أو قيمة المفتاح أو نفي دفاع خارجي؛ يلزم إغلاق/تقييد قبل الحكم بسلامة الإطلاق |
| SEC-04 | SELECT لـstorage.buckets: order-images عامة، product-images عامة | يلزم تصنيف order-images ومعالجة الخاص كما في الخطة. لم تُفتح صورة أو تُستخرج أسماء ملفات؛ لا يُقال إن كل محتوياتها حساسة أو إن الكتالوج يجب جعله خاصاً |
| جرد الأدوار/الاستعادة | HANDOFF الأمني يذكرهما كعمل باقٍ، ولا دليل قبول حديث | لا يثبت وجود السياسات وحده عزل كل فئة أو نجاح الاستعادة؛ يُسجل نقص إثبات لا اختراق مثبت |

Security Advisors الحالي: RLS بلا policy 23 (INFO)، search_path 33 (WARN)، anon SECURITY DEFINER 11 (WARN)، authenticated SECURITY DEFINER 47 (WARN)، حماية كلمات المرور المسرّبة مطفأة (WARN). ليست هذه أعداد ثغرات حرجة/عالية مستقلة؛ تحتاج مراجعة الأجسام والاستخدام، وبعضها مقصود. لا يوجد تصنيف ERROR في النتائج، وهذا **لا يغلق G6**.

مراجع المعالجة: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)، [anon EXECUTE](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)، [authenticated EXECUTE](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)، [RLS بلا سياسة](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)، [حماية كلمات المرور](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## 5. التحقق المحلي في هذه الجلسة

| الفحص | النتيجة / الحد |
|---|---|
| `node scripts/db-local/verify-privacy-ts.cjs` | exit 0، 9/9: رموز التتبع، privacy/GA/history، الترويسات المصدرية، مفاتيح التنبيه، deadlines، تأكيد كتابة علامة sending. mocks ومحاكاة vm، لا GA أو متصفح حي |
| `verify-review-fixes.cjs` | exit 0 بعد ضبط NODE_PATH للاعتماديات خارج المشروع، ومنفذ محلي 54358. ثلاث مجموعات PASS: فاتورة fail-closed والمحل/المختلط والشحن؛ صلاحيات وتجهيز وحسم stale/refreshed؛ نقص المخزون → مراجعة → إعادة محاولة → مبيعة وخصم واحد. Postgres محلي وبيانات مصطنعة؛ لا ميسر/الأستاذ الحقيقيين |
| تعثر إعداد أولي | أول نداء verify-review-fixes رفض missing embedded-postgres لأن NODE_PATH لم يُضبط؛ ليس فشل سلوك. صُحح إلى `$env:TEMP/ys-db-local/node_modules` دون تثبيت أو تعديل package/lockfile |
| TSC/ESLint/بقية الأدوات | لم تُعد في هذا الجزء لأن التغييرات وثائق فقط؛ العدد 38 في FIX-05 نتيجة سابقة، لا نتيجة تشغيل جديدة هنا |
| diff/ترميز الوثائق | يُتحقق قبل التسليم بـgit diff --check وبحث فقد العربية في الملفات المكتوبة |

## 6. أثر المحل والمستهلكون والتراجع

لا تعديل تطبيق أو SQL أو منطق فواتير/صندوق/واردات/حارس مخزون؛ لا مستهلك مالي تغير. التغييرات وثائق محلية للمراجعة فقط. وقت البدء كان العمل نظيفاً؛ ظهرت أثناء الجلسة تغييرات أخرى في invoice-pdf وprint-tailoring-receipt وalostaz-client، تُترك كما هي ولا تُختبر كجزء من هذا التسليم. أي تغييرات إضافية من العمل الموازي خارج النطاق محفوظة كذلك.

التراجع: إزالة ملفي قائمة الجاهزية والتقرير المحليين أو تصحيح محتواهما، وإزالة ملاحظتي الحالة المؤرختين من HANDOFF/FIX-STATUS فقط. لا تراجع قاعدة أو إعدادات أو استعادة نسخة بيانات مطلوبة، ولا git reset/checkout عام.

## 7. نقاط المراجعة والخطوة التالية

على المراجع التأكد أن تجاوز G3 مسجل بإفادة صريحة ولا يُكتب PASS؛ أن كل H01–H27 ومتطلبات الخطة 04 وصف المرحلة 10 مغطاة؛ أن E تُقارن بجسم المصدر الحالي لا بتعليق التطبيق؛ أن غياب هجرة في registry لا يُخلط بغياب كائنها؛ أن إعدادات الإنتاج لا تُفترض من Preview؛ وأن الموانع الأمنية والتجارية والبصرية لا تُغلق بمجرد READY أو نجاح mocks.

قبل B: حسم الناقل/المناطق/التكلفة ومدة التجهيز، تأكيد المحاسب للإجراء القائم وتسوية الرسوم والدائن، تأكيد عرض ميسر والحد/الوسائل وقرار Apple Pay، ومطابقة الهوية الظاهرة مع الملف المعتمد. لا تُعاد الأسئلة عن قرارات القص والخزنة والأدوار المحسومة. الجزء A انتهى؛ الانتقال للجزء التالي بتوجيه المالكة كما في STAGE-10-PROMPT §4.
