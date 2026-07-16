# وثيقة متطلبات المنتج (PRD)
## إعادة تصميم الصفحة الرئيسية — ياسمين الشام

**الإصدار:** 1.0  
**الحالة:** جاهزة للمراجعة والاعتماد  
**تاريخ الإعداد:** 13 يوليو 2026  
**المنصة:** موقع ياسمين الشام — Next.js، بتوجه Mobile First  
**لغة الواجهة الأساسية:** العربية، من اليمين إلى اليسار  
**المالك التجاري:** ياسمين الشام  

---

## 1. الملخص التنفيذي

تهدف هذه الوثيقة إلى إعادة بناء الصفحة الرئيسية لموقع ياسمين الشام كتجربة رقمية فاخرة ومعاصرة، مصممة أولًا لشاشات الجوال، وتقدم نشاط العلامة من خلال قسمين تجاريين رئيسيين فقط:

1. **قسم التفصيل:** قسم دعائي وإقناعي يشرح قيمة التفصيل لدى ياسمين الشام، يعرض الحرفة وجودة التنفيذ، ويوفر مساحات واضحة لإضافة صور وفيديوهات الأعمال المنفذة. الهدف منه تحويل الزائرة المهتمة إلى تواصل مباشر مع فريق التفصيل عبر واتساب.
2. **قسم متجر الأقمشة:** واجهة متجر تعرض الأقمشة المميزة والمتاحة، مع الاسم والسعر بالمتر والفئة وحالة التوفر، وتنقل الزائرة إلى صفحة المنتج أو إلى الاستفسار عبر واتساب وفق آلية المتجر الحالية.

التجربة الجديدة يجب أن تبدو كدار أزياء رقمية ذات هوية واضحة، لا كقالب متجر وردي تقليدي. ويجب أن تجمع بين الطابع الدمشقي الراقي، والتصوير السينمائي للحرفة، وسهولة التسوق الحديثة.

لا يشمل هذا المشروع أي قسم لحجز الدور أو حجز الموعد، ولا يجب أن يظهر أي زر أو رسالة تسويقية مرتبطة بذلك داخل الصفحة الرئيسية الجديدة.

يجب ان تبقى هذه الازرار مخفية داخل القائمة المنسدلة بشكل ماشبه للقائمة المنسدلة الموجودة حاليا 

---

## 2. خلفية المنتج والمشكلة الحالية

### 2.1 الوضع الحالي

الصفحة الرئيسية الحالية تتكون من:

- Hero يغطي الشاشة على الجوال.
- قسم للفساتين أو التصاميم الجاهزة.
- قسم للأقمشة المميزة.
- Footer.
- تمرير إجباري بنمط Snap Scroll على الجوال، بحيث يشغل كل قسم شاشة كاملة.

### 2.2 المشكلات المطلوب حلها

- لا تشرح الصفحة الحالية خدمة التفصيل كحرفة أو تجربة ذات قيمة.
- قسم التفصيل يبدو كقسم منتجات، وليس كقسم دعائي يقنع الزبونة بجودة المشغل.
- قسم التفصيل ومتجر الأقمشة يستخدمان الشكل البصري نفسه تقريبًا، فلا يظهر الفرق بين العالمين.
- التدرجات الوردية والبطاقات المستديرة والحركات الزخرفية المتكررة تقلل الإحساس بالفخامة.
- بطاقات الجوال الطويلة جدًا تحجب معلومات المنتج ولا تشجع على المقارنة.
- التمرير الإجباري لكل الأقسام يجعل استكشاف المتجر أبطأ وأقل مرونة.
- الصفحة لا تستفيد من الفيديو والحركة لرواية قصة العلامة والحرفة.
- نسخة سطح المكتب لا تقدم Banner أو حملة بصرية بالحضور المتوقع من علامة أزياء.
- قائمة التنقل الرئيسية مزدحمة مقارنة بالهدف التجاري الأساسي للصفحة.
- لا توجد بنية محتوى واضحة لإضافة صور دعائية لأعمال التفصيل بصورة مستقلة عن منتجات المتجر.

---

## 3. رؤية المنتج

### 3.1 الرؤية

إنشاء صفحة رئيسية تشعر الزائرة منذ اللحظة الأولى بأنها دخلت عالم ياسمين الشام: عالم يبدأ بالقماش، يمر بالحرفة، وينتهي بفستان مصنوع بعناية لها.

### 3.2 الفكرة الإبداعية المركزية

> **من القماش… نصنع حكايتك**

### 3.3 الوعد البصري

يجب أن تكون التجربة:

- فاخرة من دون مبالغة.
- دافئة وإنسانية، وليست باردة أو تقنية.
- تحريرية وسينمائية، مثل صفحات حملات الأزياء.
- واضحة وسهلة على الجوال.
- مختلفة بصريًا بين التفصيل والأقمشة، مع بقائهما تحت هوية واحدة.

### 3.4 العنصر الذي يجب أن تتذكره الزائرة

انتقال بصري متصل يبدأ بحركة الخيط والقماش في قسم التفصيل، ثم يتحول إلى ملمس قماش قريب يقود إلى المتجر. هذه الحركة هي التوقيع البصري للصفحة.

---

## 4. أهداف المشروع

### 4.1 أهداف تجارية

- زيادة اقتناع الزائرات بخدمة التفصيل وجودة التنفيذ.
- زيادة النقرات على التواصل عبر واتساب من قسم التفصيل.
- زيادة الانتقال من الصفحة الرئيسية إلى صفحات الأقمشة.
- زيادة الاستفسارات عن الأقمشة عبر واتساب.
- رفع القيمة المتصورة للعلامة وجعلها أقرب إلى دار أزياء متخصصة.

### 4.2 أهداف تجربة المستخدم

- توضيح نشاط العلامة خلال أول خمس ثوانٍ.
- تمكين الزائرة من اختيار «التفصيل» أو «الأقمشة» مباشرة.
- عرض أعمال التفصيل بطريقة بصرية مقنعة وسريعة.
- عرض معلومات كافية عن القماش قبل فتح صفحة المنتج.
- تقليل الخطوات للوصول إلى واتساب أو صفحة تفاصيل القماش.
- توفير تجربة مريحة على الهواتف الصغيرة والكبيرة.

### 4.3 أهداف تقنية

- الحفاظ على سرعة تحميل جيدة رغم استخدام الفيديو.
- الاستفادة من البنية الحالية في Next.js وSupabase وFramer Motion وEmbla.
- عدم كسر صفحات الأقمشة أو لوحة الإدارة أو البيانات الحالية.
- إنشاء مكونات قابلة لإعادة الاستخدام والصيانة.
- دعم حالات بطء الاتصال، وفشل الفيديو، وعدم توفر المنتجات.

---

## 5. مؤشرات النجاح (KPIs)

يتم قياس خط أساس قبل الإطلاق، ثم مقارنة النتائج بعد 30 يومًا من النشر.

### 5.1 مؤشرات التحويل

- نسبة النقر على زر واتساب الخاص بالتفصيل.
- نسبة النقر على «شاهدي أعمالنا».
- نسبة الانتقال من الرئيسية إلى `/fabrics`.
- نسبة فتح صفحات تفاصيل الأقمشة من الرئيسية.
- نسبة النقر على استفسار واتساب للأقمشة.

### 5.2 مؤشرات التفاعل

- نسبة مشاهدة 50% و90% من فيديو الـHero.
- متوسط عمق التمرير في الصفحة.
- نسبة التفاعل مع معرض أعمال التفصيل.
- نسبة السحب أو التنقل بين الأقمشة المميزة.
- معدل الخروج من الصفحة الرئيسية.

### 5.3 مؤشرات الأداء

- LCP عند الشريحة 75 أقل من أو يساوي 2.5 ثانية على الجوال.
- INP عند الشريحة 75 أقل من أو يساوي 200 مللي ثانية.
- CLS أقل من أو يساوي 0.1.
- عدم تحميل فيديوهات الأقسام البعيدة قبل اقترابها من الشاشة.

---

## 6. الجمهور المستهدف

### 6.1 العميلة الأساسية — الباحثة عن التفصيل

- تبحث عن فستان سهرة أو مناسبة أو تصميم خاص.
- تريد رؤية جودة العمل الحقيقي قبل التواصل.
- تهتم بالتفاصيل والملاءمة والثقة أكثر من السعر فقط.
- غالبًا تصل من إنستغرام أو تيك توك أو رابط واتساب.
- تستخدم الجوال في أغلب الوقت.

**احتياجها الرئيسي:** أن تقتنع بأن ياسمين الشام قادرة على تنفيذ فستان أنيق بجودة موثوقة.

### 6.2 عميلة متجر الأقمشة

- تبحث عن قماش محدد أو تستكشف خيارات لمناسبة.
- تريد رؤية اللون والملمس والسعر بالمتر والتوفر.
- تحتاج إلى فتح صور وفيديوهات القماش قبل الاستفسار.
- قد لا تعرف الاسم الفني للقماش، لذلك تحتاج فئات واضحة وصورًا قوية.

**احتياجها الرئيسي:** الوصول بسرعة إلى قماش مناسب ومعرفة معلوماته الأساسية ثم الاستفسار عنه.

### 6.3 الزائرة الاستكشافية

- تعرف العلامة من محتوى اجتماعي أو توصية.
- لم تقرر بعد هل تريد تفصيلًا أم قماشًا.
- تحتاج إلى فهم واضح للنشاطين من الصفحة الأولى.

---

## 7. نطاق المشروع

### 7.1 داخل النطاق

- إعادة تصميم الصفحة الرئيسية بالكامل.
- Header جديد ومبسط للصفحة الرئيسية.
- Hero سينمائي بفيديو وصورة Poster بديلة.
- بوابة واضحة إلى القسمين الرئيسيين.
- قسم دعائي متكامل للتفصيل.
- معرض صور لأعمال التفصيل مع أماكن قابلة لإضافة المحتوى.
- قسم أقمشة مميزة مرتبط بالبيانات الحالية.
- Banner أو حملة بصرية للأقمشة.
- Footer متوافق مع الهوية الجديدة.
- دعم الجوال والتابلت وسطح المكتب.
- حالات التحميل والخطأ وعدم وجود محتوى.
- التحليلات الأساسية للأحداث المهمة.
- تحسينات الأداء وإتاحة الوصول وSEO المرتبطة بالصفحة.

### 7.2 خارج النطاق

- حجز الدور.
- حجز المواعيد.
- أي CTA باسم «احجزي دورك» أو «احجزي موعدًا».
- بناء سلة شراء جديدة للأقمشة.
- بناء دفع إلكتروني أو Checkout.
- إعادة تصميم لوحة الإدارة.
- إعادة تصميم جميع صفحات الموقع الداخلية.
- تغيير قاعدة بيانات الأقمشة الحالية إلا إذا احتاج التنفيذ حقولًا اختيارية بسيطة.
- إنشاء تطبيق جوال جديد.

### 7.3 آلية التحويل المعتمدة

- **التفصيل:** التواصل عبر واتساب برسالة مسبقة التعبئة.
- **الأقمشة:** فتح صفحة تفاصيل القماش ثم الاستفسار عبر واتساب، مع إمكانية توفير زر استفسار مباشر من البطاقة إذا تم اعتماده.
- لا يتم وصف تجربة الأقمشة على أنها دفع إلكتروني كامل ما دامت عملية الشراء تنتهي بالاستفسار.

---

## 8. مبادئ التصميم الحاكمة

1. **الجوال أولًا:** يتم اعتماد التصميم على عرض 390 بكسل أولًا، ثم توسيعه للشاشات الأكبر.
2. **قصّة قبل البطاقات:** تبدأ الصفحة بقصة العلامة والحرفة قبل عرض شبكة المنتجات.
3. **عالمين واضحين:** التفصيل عاطفي وسينمائي؛ متجر الأقمشة واضح وتجاري.
4. **صورة حقيقية فوق الزخرفة:** صور الأعمال والقماش أهم من الأيقونات والقلوب والنجوم.
5. **حركة ذات معنى:** كل حركة تشرح انتقالًا أو توجه الانتباه، لا لمجرد الزينة.
6. **معلومة كافية قبل النقر:** بطاقة القماش تعرض الاسم والسعر والتوفر.
7. **مساحات هادئة:** الفخامة تأتي من التباين والمساحة والطباعة الدقيقة، لا من كثرة المؤثرات.
8. **تحميل تدريجي:** الصورة تظهر أولًا، ثم الفيديو عند الجاهزية.
9. **النص جزء من الهوية:** رسائل قصيرة وواثقة، بلا فقرات تسويقية طويلة في الواجهة.

---

## 9. الاتجاه البصري المعتمد

### 9.1 اسم الاتجاه

**دمشق المعاصرة — Contemporary Damascus Atelier**

### 9.2 المزاج

- فخم.
- دافئ.
- تحريري.
- أنثوي من دون مبالغة طفولية.
- حرفي وملموس.

### 9.3 لوحة الألوان المقترحة

| الدور | اللون | القيمة المقترحة | الاستخدام |
|---|---|---:|---|
| عنابي العلامة | Burgundy | `#6B1726` | الشعار، العناوين المهمة، CTA الأساسي |
| عنابي داكن | Deep Wine | `#3B1018` | الخلفيات السينمائية والفوتر |
| عاجي دافئ | Warm Ivory | `#F6F0E8` | الخلفية الأساسية |
| رملي | Sand | `#D8C5AE` | الحدود والخلفيات الثانوية |
| وردي غباري | Dusty Rose | `#C98E94` | لمسات محدودة مرتبطة بالهوية الحالية |
| فحمي دافئ | Warm Charcoal | `#211B19` | النصوص الأساسية |
| ذهبي مطفأ | Muted Gold | `#B99A68` | تفاصيل دقيقة فقط، لا يستخدم كتدرج واسع |
| أبيض | White | `#FFFFFF` | بطاقات المتجر والمساحات النقية |

### 9.4 قواعد استخدام اللون

- يمنع استخدام التدرج الوردي–البنفسجي الحالي كلغة أساسية للصفحة.
- يستخدم العنابي كلون حاسم، لا كلون يغطي جميع العناصر.
- لا تزيد اللمسات الذهبية عن 5% من المساحة المرئية.
- قسم التفصيل يمكن أن ينتقل بين العاجي والعنابي الداكن.
- متجر الأقمشة يعتمد خلفية عاجية أو بيضاء لرفع وضوح المنتجات والأسعار.

### 9.5 الخطوط

**الخيار المجاني المقترح:**

- العناوين التحريرية: `Noto Naskh Arabic` بوزن 600 أو 700.
- النصوص والأزرار والمعلومات: `IBM Plex Sans Arabic` بوزن 400–600.

**الخيار الاحترافي عند توفر ترخيص:**

- عائلة عربية من 29LT مثل Zarid أو Bukra، مع اختيار وزن Display للعناوين وText للنصوص.

### 9.6 أحجام الطباعة المبدئية

| العنصر | الجوال | سطح المكتب |
|---|---:|---:|
| عنوان Hero | 40–52px | 72–104px |
| عنوان قسم رئيسي | 32–40px | 56–72px |
| عنوان بطاقة | 18–22px | 22–28px |
| نص أساسي | 16–18px | 18–20px |
| معلومات منتج | 14–16px | 15–17px |
| زر رئيسي | 16–18px | 17–19px |

يجب ضبط الأحجام باستخدام `clamp()` حيث يناسب، مع اختبار الأسطر العربية الطويلة.

### 9.7 الأشكال والمساحات

- نصف قطر البطاقات: 16–24px، وليس كل عنصر على شكل كبسولة.
- الأزرار الأساسية يمكن أن تكون بزوايا 12–16px بدل الاستدارة الكاملة.
- شبكة تباعد تعتمد مضاعفات 4px.
- المسافة بين الأقسام على الجوال: 72–104px.
- المسافة بين الأقسام على سطح المكتب: 120–180px.
- تجنب الظلال الثقيلة؛ تستخدم حدود رقيقة وظلال ناعمة جدًا.

---

## 10. بنية الصفحة الجديدة

### 10.1 التسلسل العام

```text
Header مبسط
└── Hero سينمائي: هوية العلامة + مدخلان واضحان
    ├── الانتقال إلى التفصيل
    └── الانتقال إلى متجر الأقمشة

قسم التفصيل الدعائي
├── بيان القيمة
├── فيلم قصير للحرفة
├── لماذا التفصيل لدينا؟
├── معرض أعمالنا
├── مراحل صنع الفستان
└── CTA واتساب للتفصيل

انتقال بصري: كل فستان يبدأ بقماش

قسم متجر الأقمشة
├── عنوان ووصف مختصر
├── فئات سريعة
├── أقمشة مميزة من قاعدة البيانات
├── Banner تشكيلة/حملة
└── CTA عرض جميع الأقمشة

شريط ثقة وتواصل
Footer
```

### 10.2 قاعدة التمرير

- يمكن إبقاء Hero بارتفاع `100svh` أو `min(100svh, 920px)`.
- لا يستخدم Snap Scroll الإجباري بعد Hero.
- بقية الصفحة تستخدم تمريرًا طبيعيًا.
- يمكن استخدام Snap أفقي خفيف داخل Carousels المنتجات فقط.

---

## 11. متطلبات Header والتنقل

### 11.1 Header الجوال

يتكون من:

- زر قائمة مختصر.
- شعار ياسمين الشام في المنتصف أو جهة اليمين حسب التوازن البصري.
- زر متجر/بحث أو زر تواصل واحد فقط في الجهة المقابلة.

السلوك:

- شفاف فوق Hero.
- يتحول إلى خلفية عاجية شبه معتمة بعد التمرير.
- لا يختفي بالكامل أثناء التمرير؛ يمكن تصغير ارتفاعه.
- ارتفاع منطقة النقر لا يقل عن 44px.

### 11.2 Header سطح المكتب

التنقل الأساسي الظاهر:

- التفصيل.
- متجر الأقمشة.
- الشعار.
- تواصل معنا.

يمكن وضع الروابط الخدمية الأخرى الموجودة في الموقع داخل قائمة ثانوية أو Footer، لكن لا تتحول إلى أقسام رئيسية في الصفحة.

### 11.3 عناصر ممنوعة

- «احجزي دورك».
- «احجزي موعدًا».
- أي رابط يوحي بأن الحجز جزء من تدفق الصفحة الرئيسية.

---

## 12. متطلبات Hero السينمائي

### 12.1 الهدف

إيصال هوية العلامة، وإظهار أن الموقع يقدم التفصيل والأقمشة، وتوجيه الزائرة إلى المسار الصحيح خلال ثوانٍ.

### 12.2 المحتوى

**العنوان المقترح:**

> من القماش… نصنع حكايتك

**النص الداعم:**

> تفصيل يليق بك، وأقمشة اختيرت لتبدأ منها كل التفاصيل.

**الأزرار:**

- `اكتشفي التفصيل` — تمرير إلى قسم التفصيل.
- `تسوقي الأقمشة` — تمرير إلى متجر الأقمشة أو فتح `/fabrics` حسب النسخة المعتمدة.

### 12.3 الوسائط

- فيديو مستقل للجوال بنسبة 9:16.
- فيديو مستقل لسطح المكتب بنسبة 16:9.
- Poster مطابق لكل فيديو بصيغة WebP أو AVIF.
- لا يستخدم قص تلقائي لفيديو سطح المكتب لإنتاج نسخة الجوال.
- لا يضاف النص أو الشعار داخل الفيديو نفسه؛ تتم إضافتهما كعناصر HTML حقيقية.

### 12.4 السلوك

- `autoplay`, `muted`, `loop`, `playsInline`.
- يبدأ بصورة Poster.
- عند تفعيل تقليل الحركة، لا يعمل الفيديو تلقائيًا وتبقى صورة Poster.
- عند تفعيل توفير البيانات أو فشل الفيديو، تبقى الصورة دون خطأ مرئي.
- طبقة تدرج داكنة محسوبة خلف النص فقط.
- النص والأزرار في الثلث السفلي على الجوال.
- لا يتم تشغيل صوت تلقائي إطلاقًا.

### 12.5 متطلبات القبول

- يظهر العنوان والزرّان دون انتظار تحميل الفيديو.
- النص مقروء فوق جميع لقطات الفيديو.
- لا يتجاوز الفيديو ميزانية الحجم المحددة في قسم الأداء.
- لا يحدث تغير تخطيط عند انتقال Poster إلى الفيديو.

---

## 13. بوابة القسمين

### 13.1 الهدف

تأكيد أن ياسمين الشام تقدم نشاطين واضحين فقط، وإتاحة اختيار سريع بعد Hero.

### 13.2 التخطيط

على الجوال:

- بطاقتان كبيرتان فوق بعض.
- كل بطاقة بنسبة قريبة من 4:5 أو بارتفاع 65–75svh.
- تظهر بداية البطاقة التالية لتشجيع التمرير.

على سطح المكتب:

- لوحتان متجاورتان أو تكوين غير متماثل بنسبة 55/45.

### 13.3 بطاقة التفصيل

- صورة أو فيديو لعملية التنفيذ أو فستان من الأعمال.
- عنوان: `تفصيل ياسمين الشام`.
- وصف: `فستان يبدأ من تفاصيلك وينفذ بعناية في مشغلنا.`
- CTA: `اكتشفي الحرفة`.

### 13.4 بطاقة الأقمشة

- فيديو Macro للقماش أو صورة تشكيلة.
- عنوان: `متجر الأقمشة`.
- وصف: `تشكيلة مختارة للمناسبات والتصاميم المميزة.`
- CTA: `تصفحي المتجر`.

---

## 14. قسم التفصيل الدعائي

### 14.1 الهدف التجاري

إقناع الزبونة بجودة التفصيل وتحويلها إلى تواصل مباشر، وليس بيع فستان جاهز أو تقديم نظام حجز.

### 14.2 الرسالة الرئيسية

**العنوان المقترح:**

> نصنع فستانًا يحمل تفاصيلك

**النص المقترح:**

> من اختيار القماش ورسم الفكرة إلى آخر غرزة، ننفذ كل فستان بعناية توازن بين أناقة التصميم ودقة المقاس وجودة التشطيب.

### 14.3 وحدات القسم

#### أ. لوحة الحرفة

- فيديو قصير 6–8 ثوانٍ أو صورة كبيرة.
- لقطة قريبة للخياطة أو التطريز أو تشكيل القماش على المانيكان.
- عبارة قصيرة على طرف الصورة، لا فوق مركز العمل.

#### ب. نقاط الإقناع

ثلاث نقاط فقط:

1. **تصميم يراعي شخصيتك:** يتم التعامل مع كل فستان كعمل مستقل.
2. **تنفيذ دقيق:** اهتمام بالمقاس، البطانة، القص والتشطيب.
3. **اختيار متكامل:** إمكانية بدء الفكرة من تشكيلة الأقمشة المتوفرة لدينا.

يمنع استخدام بطاقات أيقونات عامة. الأفضل استخدام أرقام تحريرية كبيرة، خطوط رفيعة وصور تفاصيل.

#### ج. مراحل صنع الفستان

المراحل الدعائية المقترحة:

1. **الفكرة:** فهم الشكل المطلوب والمناسبة والتفضيلات.
2. **القماش والتفاصيل:** اختيار الخامة واللون والتطريز المناسب.
3. **التنفيذ:** القص والخياطة وضبط التفاصيل.
4. **اللمسة الأخيرة:** مراجعة التشطيب وإظهار الفستان بصورته النهائية.

هذه المراحل للتعريف والإقناع فقط، ولا تحتوي على حجز موعد أو دور.

#### د. معرض أعمالنا

معرض مخصص لصور أعمال التفصيل، منفصل تمامًا عن منتجات الأقمشة.

المتطلبات:

- 6 صور كحد أدنى عند الإطلاق.
- 12 صورة مفضلة لإعطاء تنوع مناسب.
- دعم صورة رأسية 4:5 كصيغة أساسية.
- دعم صورة أفقية 3:2 للحملات.
- دعم عنوان اختياري لكل عمل.
- دعم وصف اختياري لا يتجاوز سطرين.
- دعم ترتيب يدوي.
- دعم تمييز عمل أو عملين كصور كبيرة.
- فتح Lightbox عند النقر.
- تنقل بالسحب على الجوال.
- Alt text عربي لكل صورة.
- عدم إظهار أسعار داخل معرض التفصيل.

**تخطيط الجوال:**

- صورة رئيسية كبيرة.
- شريط أفقي لأعمال إضافية، بطاقة بعرض 72–82vw.
- إظهار جزء من البطاقة التالية.

**تخطيط سطح المكتب:**

- Editorial Grid غير متماثلة.
- صورة كبيرة بعرض عمودين، وصور أصغر حولها.
- عدم استخدام شبكة متساوية من أربع بطاقات فقط.

#### هـ. CTA التفصيل

**العنوان:**

> لديك فكرة لفستانك؟

**النص:**

> شاركينا فكرتك عبر واتساب، وسيساعدك فريق ياسمين الشام في الخطوة التالية.

**الزر الأساسي:** `تواصلي مع قسم التفصيل`  
**الزر الثانوي:** `شاهدي المزيد من أعمالنا` — يظهر فقط إذا وجدت صفحة مستقلة للأعمال.

رسالة واتساب المقترحة:

> مرحبًا، أرغب في الاستفسار عن تفصيل فستان لدى ياسمين الشام.

### 14.4 نموذج بيانات معرض التفصيل

يقترح إنشاء مصدر محتوى مستقل باسم `tailoringShowcase`، ولا يعاد استخدام منتجات `shopStore` كحل دائم.

```ts
type TailoringShowcaseItem = {
  id: string
  title?: string
  description?: string
  imageUrl: string
  thumbnailUrl?: string
  alt: string
  aspectRatio?: 'portrait' | 'landscape' | 'square'
  isFeatured: boolean
  displayOrder: number
  isActive: boolean
}
```

### 14.5 مراحل إدارة المحتوى

- **الإطلاق الأول:** ملف إعدادات واضح أو بيانات ثابتة منظمة، بحيث يمكن استبدال الصور من مجلد محدد بسهولة.
- **مرحلة لاحقة اختيارية:** جدول Supabase وواجهة إدارة لرفع وترتيب صور الأعمال.

إنشاء لوحة إدارة جديدة ليس جزءًا إلزاميًا من هذا الإصدار.

---

## 15. الانتقال بين التفصيل والأقمشة

### 15.1 الهدف

ربط النشاطين بقصة واحدة، ومنع الإحساس بالانتقال المفاجئ إلى متجر منفصل.

### 15.2 التنفيذ البصري

- فيديو Macro بعرض كامل لحركة قماش تحت إضاءة جانبية.
- الجملة تظهر تدريجيًا:

> كل فستان استثنائي يبدأ بقماش استثنائي

- خلفية تنتقل من العنابي الداكن إلى العاجي.
- مدة الحركة المرئية 4–6 ثوانٍ.
- لا يوجد زر داخل الانتقال.
- في وضع تقليل الحركة تستخدم صورة ثابتة.

---

## 16. قسم متجر الأقمشة

### 16.1 الهدف التجاري

عرض تشكيلة مختارة، وإيصال الزائرة بسرعة إلى تفاصيل القماش أو الاستفسار عنه، مع الحفاظ على البيانات والآلية الحالية للمتجر.

### 16.2 العنوان والمقدمة

**العنوان:** `متجر الأقمشة`  
**النص:** `خامات مختارة بعناية لتناسب فساتين السهرة والمناسبات والتصاميم الخاصة.`

### 16.3 الفئات السريعة

تعرض كشرائح أفقية قابلة للسحب، ويتم تكوينها من الفئات الموجودة فعلًا في البيانات. أمثلة فقط:

- جديد.
- مطرز.
- سادة.
- سهرة.
- دانتيل.
- حرير.

لا تظهر فئة فارغة، ولا تثبت أسماء لا توجد لها منتجات.

### 16.4 مصدر المنتجات

يتم استخدام بيانات `fabricStore` الحالية.

معيار العرض في الرئيسية:

- `is_featured = true`.
- `is_available = true`.
- `is_active = true` إن كان الحقل مطبقًا في الاستعلام.
- من 4 إلى 8 منتجات بحد أقصى في الصفحة الرئيسية.

### 16.5 بطاقة القماش

يجب أن تعرض:

- الصورة أو الفيديو الأساسي.
- اسم القماش.
- الفئة.
- السعر بالمتر أو «السعر عند الطلب».
- السعر بعد الخصم والسعر السابق عند وجود عرض.
- حالة التوفر.
- Badge للخصم عند وجوده.
- رابط إلى صفحة التفاصيل.

اختياري حسب المساحة:

- الألوان المتاحة كعينات صغيرة.
- عبارة «مناسب لـ» بقيمة واحدة فقط.

لا تعرض بطاقة الرئيسية:

- وصفًا طويلًا.
- جميع المواصفات التقنية.
- تعليمات العناية.
- زر سلة غير عامل.

### 16.6 نسب الصور

- النسبة الأساسية: 4:5.
- يمنع استخدام 9:16 كالنسبة الافتراضية لبطاقات المتجر.
- تستخدم `object-fit: cover` مع نقطة تركيز قابلة للضبط مستقبلًا.
- الفيديو داخل البطاقة يعمل فقط عندما تكون البطاقة نشطة وقريبة من الشاشة.

### 16.7 تخطيط الجوال

- Carousel أفقي.
- عرض البطاقة 76–82vw.
- فراغ 12–16px بين البطاقات.
- يظهر جزء من البطاقة التالية.
- النص والسعر أسفل الصورة، وليس فوقها.
- السحب لا يتعارض مع التمرير الرأسي.

### 16.8 تخطيط سطح المكتب

- 4 بطاقات في الصف على الشاشات الواسعة.
- أو تكوين تحريري: منتج مميز كبير + ثلاثة منتجات أصغر.
- Hover بسيط يكشف الصورة الثانية أو يشغل فيديو قصير.
- لا يستخدم تكبير البطاقة بالكامل بدرجة تسبب تحرك الشبكة.

### 16.9 CTA المتجر

- الزر الأساسي: `عرض جميع الأقمشة` → `/fabrics`.
- الرابط داخل البطاقة: `/fabrics/[id]`.
- يمكن إضافة `استفسري عن هذا القماش` داخل Quick View أو صفحة التفاصيل عبر واتساب.
- لا يضاف Checkout أو زر «أضيفي للسلة» ما لم يتم بناء عملية شراء كاملة في مشروع مستقل.

### 16.10 حالات المتجر

#### التحميل

- Skeleton بنفس نسبة البطاقة النهائية 4:5.
- لا يظهر Spinner كبير في منتصف الصفحة إذا أمكن عرض Skeleton.

#### عدم وجود أقمشة مميزة

- تظهر رسالة قصيرة: `تصفحّي أحدث الأقمشة المتوفرة في المتجر.`
- يظهر زر `/fabrics`.
- لا يترك فراغ كبير أو قسم شاشة كاملة فارغ.

#### الخطأ

- رسالة هادئة غير تقنية.
- زر إعادة المحاولة.
- رابط مباشر لفتح متجر الأقمشة عند استمرار الخطأ.

#### منتج غير متوفر

- لا يظهر ضمن المنتجات المميزة في الرئيسية.
- إذا تغيرت حالته بعد التحميل، تظهر طبقة «غير متوفر» ويعطل CTA المباشر للاستفسار إن لزم.

---

## 17. Banner حملة الأقمشة

### 17.1 الهدف

منح المتجر لحظة بصرية كبيرة مشابهة لحملات العلامات العالمية، وكسر تكرار بطاقات المنتجات.

### 17.2 المحتوى

- فيديو أو صورة بعرض كامل.
- عنوان موسمي قابل للتغيير، مثل: `تشكيلة المناسبات`.
- وصف من سطر واحد.
- CTA: `اكتشفي التشكيلة`.

### 17.3 موضعه

- بعد Carousel الأقمشة المميزة وقبل نهاية القسم.
- يمكن نقله قبل المنتجات في الحملات الموسمية المهمة.

### 17.4 قواعده

- لا يضاف نص داخل ملف الفيديو.
- يجب ألا تعتمد قابلية القراءة على لون لقطة واحدة.
- يوفر Poster مستقل.
- المحتوى النصي قابل للتعديل دون إعادة إنتاج الفيديو.

---

## 18. شريط الثقة والتواصل

شريط مختصر قبل Footer يحتوي على ثلاث رسائل فقط، مثل:

- تفصيل بعناية في كل مرحلة.
- أقمشة مختارة للمناسبات.
- تواصل مباشر عبر واتساب.

يمكن إضافة الموقع الجغرافي ورقم التواصل، لكن دون تحويل الشريط إلى قسم خدمات ثالث.

---

## 19. Footer

### 19.1 المحتوى

- الشعار بنسخة أحادية اللون.
- رابط التفصيل داخل الصفحة.
- رابط متجر الأقمشة.
- واتساب.
- الموقع/الخريطة.
- حسابات التواصل.
- سياسة الخصوصية والشروط.
- حقوق النشر.

### 19.2 التصميم

- خلفية عنابية داكنة أو فحمية دافئة.
- نص عاجي.
- مساحات واسعة.
- لا يستخدم تدرج وردي–بنفسجي.

---

## 20. تجربة الجوال التفصيلية

### 20.1 نقاط القياس الأساسية

- 320px.
- 360px.
- 390px — نقطة التصميم الأساسية.
- 430px.
- 768px.
- 1024px.
- 1440px.

### 20.2 Safe Areas

- احترام `env(safe-area-inset-top)` و`env(safe-area-inset-bottom)`.
- عدم وضع CTA ملاصقًا لأسفل الشاشة في أجهزة iPhone.

### 20.3 اللمس

- الحد الأدنى لمنطقة النقر 44×44px.
- فراغ لا يقل عن 8px بين الأهداف التفاعلية المتجاورة.
- عدم الاعتماد على Hover لإظهار معلومة أساسية.

### 20.4 التمرير

- لا يوجد Snap رأسي إجباري بعد Hero.
- Carousels تدعم السحب وتعرض البطاقة التالية جزئيًا.
- لا يتم تعطيل Bounce الطبيعي إلا عند فتح Modal.

### 20.5 النص

- لا يزيد عنوان Hero على ثلاثة أسطر عند 320px.
- الأزرار لا تلتف إلى سطرين في 360px فأكثر.
- يتم اختبار النصوص العربية مع تكبير الخط 200%.

---

## 21. نظام الحركة والموشن

### 21.1 مبادئ الحركة

- الحركة الرئيسية تحدث عند فتح الصفحة وعند الانتقال بين العالمين.
- لا تستخدم عناصر تدور باستمرار مثل النجوم أو القلوب.
- الحركة هادئة وبطيئة نسبيًا، وتعكس نعومة القماش.
- لا تتحرك عناصر كثيرة في الوقت نفسه.

### 21.2 حركات مقترحة

- Reveal متدرج لعنوان Hero خلال 600–900ms.
- Fade + Y بمقدار 16–24px للعناوين عند دخول الشاشة.
- Parallax خفيف جدًا للصور الكبيرة، لا يتجاوز 4–6%.
- تحريك خط رفيع يشبه الخيط بين مراحل التفصيل.
- انتقال لون الخلفية بين التفصيل والأقمشة.
- Crossfade بين صور بطاقات المنتجات.

### 21.3 إعدادات الوصول

عند `prefers-reduced-motion: reduce`:

- إيقاف تشغيل فيديوهات الخلفية تلقائيًا.
- إلغاء Parallax.
- تحويل الحركات إلى Fade قصير أو ظهور مباشر.
- الإبقاء على كل وظائف الصفحة قابلة للاستخدام.

---

## 22. مكتبة برومبتات إنتاج الفيديو بالذكاء الاصطناعي

### 22.1 قواعد عامة قبل الإنتاج

- ينتج كل فيديو بنسختين مستقلتين عند الحاجة: 9:16 للجوال و16:9 لسطح المكتب.
- لا يتم وضع شعار أو نص عربي داخل الفيديو؛ يضاف الشعار والنص برمجيًا في الموقع.
- يمنع الاعتماد على الذكاء الاصطناعي لإعادة رسم شعار ياسمين الشام، لأن الحروف والشكل قد يتشوهان.
- يفضل تجنب الوجوه الواضحة لتقليل التشوهات البصرية.
- يجب طلب حركة كاميرا بطيئة وثابتة.
- يجب طلب عدم وجود Watermark أو نصوص أو علامات تجارية.
- الألوان المرجعية: عنابي عميق، عاجي دافئ، وردي غباري، ذهبي مطفأ.
- يتم إخراج Master عالي الجودة، ثم ضغط نسخة الويب لاحقًا.

### 22.2 Prompt 01 — Hero للجوال

**الاستخدام:** خلفية افتتاحية للجوال.  
**النسبة:** 9:16.  
**المدة:** 8–10 ثوانٍ.  
**الحركة:** Loop ناعم يمكن أن يعود إلى البداية دون قفزة واضحة.

```text
A cinematic vertical luxury couture atelier film, 9:16 composition designed for a premium Arabic fashion brand website. Begin with an extreme macro shot of warm ivory silk moving softly under controlled studio light, then transition to a burgundy thread passing through fabric, a precise sewing machine needle creating a clean seam, a close-up of delicate hand-finished embroidery, and finally a modest elegant evening gown on a dress form inside a refined warm atelier. Deep burgundy, warm ivory, dusty rose, muted antique gold color palette. Soft directional lighting, rich fabric texture, shallow depth of field, calm graceful movement, editorial luxury fashion campaign, timeless and handcrafted, no faces, no visible brand, no text. Keep the upper center and lower third visually calm and uncluttered for website logo, headline and buttons. Slow stabilized camera, seamless visual transitions, realistic materials, premium cinematic color grade, 24 fps, 8 to 10 seconds, seamless loop.
```

**Negative Prompt:**

```text
text, letters, logo, watermark, subtitles, distorted hands, extra fingers, deformed sewing tools, warped mannequin, plastic fabric, excessive glitter, fantasy particles, neon colors, purple gradient, fast cuts, camera shake, busy background, visible face, bridal veil, low resolution, oversharpening, flicker, abrupt loop
```

#### النسخة الاحترافية المطوّرة — Hero الجوال

**الهدف الإنتاجي:** إنشاء خلفية افتتاحية رأسية تقرأ بوضوح خلف النص العربي والأزرار، وتمنح إحساس دار أزياء حرفية خلال الثواني الأولى من دون أن تنافس محتوى الواجهة.

**Prompt الاحترافي:**

```text
Create a production-ready cinematic vertical homepage hero film for “Yasmin Al-Sham,” a refined contemporary Damascus couture atelier. Format: true native 9:16 vertical composition, 1080x1920 delivery framing, 24 fps, exactly 10 seconds, silent, seamless loop, designed specifically as a full-screen mobile website background behind live Arabic HTML typography and CTA buttons.

VISUAL NARRATIVE AND TIMING:
0.0–2.0 seconds — Begin with an extreme macro view of warm ivory silk moving in one slow, controlled wave under soft directional window light. The textile must show authentic fibers, fine weave, natural weight, subtle tension, and physically believable folds. The opening movement should be calm enough to serve as the visual anchor for a seamless loop.
2.0–4.0 seconds — Use a refined match cut through a fabric fold into a close macro shot of a single deep-burgundy couture thread passing cleanly through ivory fabric. Show only the thread, needle, fabric, and a small section of the machine mechanism; avoid visible hands unless they are perfectly natural and anatomically correct. The stitch line must be straight, precise, and professionally finished.
4.0–6.5 seconds — Transition through the burgundy thread into a close inspection of restrained hand-finished embroidery and subtle beadwork. The detailing should feel expensive and artisanal, never glittery, bridal, costume-like, or excessive. Preserve realistic scale, consistent motifs, stable bead placement, and believable textile physics.
6.5–9.0 seconds — Slowly reveal a finished modest evening gown on a professional dress form inside a warm contemporary atelier. The gown should have an elegant structured silhouette, refined coverage, sophisticated tailoring, and restrained dusty-rose or warm-ivory detailing. Keep the dress form slightly above center and slightly left of the mobile frame so it does not collide with the Arabic content area.
9.0–10.0 seconds — Let a foreground fold of warm ivory silk pass gently across the lens and return the composition, lighting direction, fabric position, and motion to the same visual state as the first frame, creating a clean seamless loop without a visible cut.

COMPOSITION FOR THE LIVE WEBSITE UI:
- Reserve the top 12–14% as a calm, low-detail zone for the transparent mobile header.
- Keep the lower 38–42%, especially the lower-right and center-right areas, visually quiet, darker, and low contrast for the Arabic headline, supporting sentence, and two CTA buttons.
- Do not place the gown, embroidery focal point, sewing needle, high-contrast highlights, or fast movement behind the lower-third text-safe zone.
- Maintain useful visual information around the center and upper-left while allowing object-fit: cover to crop up to 6% from any edge on smaller devices.
- Keep all essential objects inside the central 82% safe area.

ART DIRECTION:
Contemporary Damascus atelier warmth without literal arches, mosaics, tourist motifs, or ornate palace decoration. Editorial luxury fashion campaign, quiet confidence, intimate craftsmanship, timeless and tactile. Palette: deep wine and burgundy shadows (#3B1018 and #6B1726), warm ivory (#F6F0E8), restrained dusty rose (#C98E94), sand (#D8C5AE), and no more than a trace of muted antique gold (#B99A68). Soft side light, gentle falloff, controlled highlights, rich but natural blacks, subtle cinematic grain, premium realistic color grade, stable white balance, realistic materials, no artificial glossy skin or plastic textile appearance.

CAMERA AND MOTION:
Use a stabilized slow macro slider and very gentle dolly movement. Simulate high-end 50mm and 85mm macro fashion cinematography with controlled shallow depth of field that still preserves important textile detail. Motion must remain graceful and readable at mobile size. No handheld movement, no aggressive rack focus, no rapid edits, no dramatic zoom, no floating particles. Ensure temporal consistency across every frame: the mannequin, stitch line, bead pattern, room geometry, fabric color, and light direction must not morph or drift.

OUTPUT CONSTRAINTS:
No generated text, no Arabic or Latin letters, no signage, no logo, no monogram, no watermark, no subtitles, no audio, no visible brand name. Do not bake the website headline, buttons, gradient, or interface elements into the video. Provide a clean master suitable for later H.264 MP4 and VP9 WebM compression, with enough tonal detail to remain readable beneath a dark HTML gradient overlay.
```

**Negative Prompt الاحترافي:**

```text
any text, Arabic letters, Latin letters, typography, logo, monogram, signage, watermark, subtitles, UI elements, buttons, visible brand name, readable sewing-machine label, face, eyes, visible model, exposed body, bridal veil, wedding scene, crown, fantasy palace, literal Damascus landmarks, mosaic overload, ornamental clutter, purple-magenta gradient, neon colors, bright cyan, excessive gold, glitter storm, sparkles, floating dust particles, smoke, fog, liquid fabric, metallic foil fabric, plastic satin, cheap polyester shine, rubber texture, low-detail textile, changing embroidery pattern, crawling beadwork, duplicated beads, melting thread, broken needle, bent sewing machine, impossible stitch direction, malformed mannequin, asymmetric dress form, extra limbs, distorted fingers, extra fingers, disembodied hands, abrupt cuts, fast montage, camera shake, whip pan, crash zoom, aggressive rack focus, heavy motion blur, flicker, exposure pumping, white-balance shift, color breathing, temporal morphing, unstable room geometry, oversharpening, crushed blacks, clipped highlights, low resolution, compression artifacts, noisy shadows, frame interpolation artifacts, abrupt loop, mismatched first and last frame
```

**إعدادات مقترحة:** استخدم Seed ثابتًا عند توفره، وولّد 3–4 محاولات، واختر النسخة التي تحافظ على منطقة النص السفلية هادئة وعلى تطابق أول وآخر إطار.

### 22.3 Prompt 02 — Hero لسطح المكتب

**الاستخدام:** Banner افتتاحي عريض.  
**النسبة:** 16:9.  
**المدة:** 8–10 ثوانٍ.

```text
A wide cinematic luxury couture atelier campaign, 16:9, composed for a premium fashion website hero banner. On the right side, refined macro details of ivory and dusty rose fabric being shaped and stitched; in the center, a slow elegant movement of fabric flowing across a cutting table; on the left side, a finished modest evening gown on a dress form in a warm contemporary atelier. Deep burgundy shadows, warm ivory walls, muted gold metal details, soft natural directional light, tactile realistic textiles, editorial high-fashion photography, sophisticated Damascus-inspired warmth without literal ornaments. Keep a large calm negative-space area in the center-right for Arabic headline and CTA buttons. Slow dolly movement, shallow depth of field, seamless transitions, no faces, no logos, no text, no watermark, 24 fps, 8 to 10 seconds, loop-friendly ending matching the opening fabric movement.
```

**Negative Prompt:** استخدم Negative Prompt الخاص بالفيديو الأول.

#### النسخة الاحترافية المطوّرة — Hero سطح المكتب

**الهدف الإنتاجي:** إنتاج Banner عريض يضع الحرفة والفستان في الجهة اليسرى، ويترك الجهة اليمنى مساحة هادئة ومظلمة نسبيًا للنص العربي والأزرار في التخطيط الفعلي للموقع.

**Prompt الاحترافي:**

```text
Create a production-ready wide cinematic homepage hero film for “Yasmin Al-Sham,” a premium contemporary Damascus couture atelier. Format: native 16:9 landscape composition, 1920x1080 master framing, 24 fps, exactly 10 seconds, silent, seamless loop, built specifically as a full-bleed desktop website background behind live right-aligned Arabic HTML typography and CTA buttons.

CORE COMPOSITION:
- Place the finished modest couture gown and the most recognizable atelier subject in the left third of the frame, never in the right-side text area.
- Use the center-left region for macro craftsmanship details, flowing fabric, the cutting table, and transitions.
- Reserve the rightmost 40–44% of the frame as intentional negative space: low-detail warm atelier wall, softly shadowed ivory fabric, or deep-wine tonal falloff suitable for a large Arabic headline, supporting copy, and buttons.
- Keep the top 12% calm for the transparent desktop header and navigation.
- Keep all essential visual subjects inside the central 86% so responsive object-fit: cover may crop the outer edges without losing the dress or craftsmanship.
- No high-contrast lamp, embroidery highlight, hand, needle, or moving fabric may pass behind the right-side text-safe zone.

VISUAL SEQUENCE:
0.0–2.0 seconds — Open with a wide, quiet atelier composition. A modest finished evening gown stands on a professional dress form in the left third. Warm ivory architecture and deep-burgundy shadows establish a refined, contemporary atmosphere. The right side remains calm and darker, with subtle texture but no subject.
2.0–4.0 seconds — A slow dolly reveals ivory and dusty-rose fabric being shaped across a cutting table in the center-left. The cloth moves with authentic weight and friction, without floating or behaving like liquid. Use a gentle fold passing through the foreground as a natural transition.
4.0–6.0 seconds — Move into precise macro couture details: a deep-burgundy thread forming a clean seam, a restrained embroidery motif, and a careful fabric drape. Maintain professional tool geometry and continuous material identity. Keep these close details entirely on the left half.
6.0–8.5 seconds — Return gradually to the wider composition, revealing the finished gown again with soft side light tracing the silhouette. The right-side negative space remains stable and readable throughout.
8.5–10.0 seconds — Use the same foreground fabric movement and camera position as the opening to return to an identical first-frame composition, exposure, color balance, and subject placement for a seamless loop.

ART DIRECTION:
Luxury editorial fashion cinematography with contemporary Damascus warmth expressed through material, restraint, light, and craftsmanship rather than literal historic decoration. Deep wine (#3B1018), burgundy (#6B1726), warm ivory (#F6F0E8), dusty rose (#C98E94), sand (#D8C5AE), and very restrained muted antique gold (#B99A68). Soft directional daylight, subtle tungsten warmth in practical lights, tactile realistic textiles, controlled highlights, gentle shadow detail, elegant tonal separation, subtle film grain, no glossy commercial showroom look.

CAMERA AND TEMPORAL QUALITY:
Slow stabilized dolly and macro slider movement only. Premium 35mm wide editorial framing transitioning to 85mm macro detail, with natural perspective and moderate depth separation. Keep the horizon and architecture stable. No fast cuts, no sweeping crane move, no dramatic zoom, no orbit around the mannequin. Preserve complete temporal consistency: dress silhouette, embroidery motif, thread color, dress-form proportions, lamps, walls, table edges, reflections, and lighting direction must not morph between frames.

WEBSITE-SPECIFIC OUTPUT:
The video must remain visually balanced when covered by a subtle HTML grain layer and a dark right-side gradient. Do not generate any title, Arabic calligraphy, English letters, logo, monogram, watermark, signage, subtitle, audio, CTA, interface control, or embedded graphic. The film should function as atmospheric background media, not as a self-contained advertisement. Deliver a clean high-quality master suitable for H.264 MP4 and VP9 WebM compression.
```

**Negative Prompt الاحترافي:**

```text
text, Arabic letters, English letters, logo, monogram, signage, watermark, subtitles, interface, buttons, centered subject blocking copy, gown on the right side, busy right-side background, bright right-side lamp behind text, high-contrast embroidery behind text, object crossing the text-safe zone, visible face, fashion model, exposed body, bridal veil, wedding stage, palace interior, literal Syrian monument, mosaic wall, baroque overload, excessive ornament, purple gradient, neon lighting, excessive pink, excessive gold, glitter, particles, smoke, fog, liquid cloth, levitating fabric, plastic textile, metallic foil, incorrect fabric weight, changing dress design, changing sleeve length, morphing mannequin, warped architecture, crooked cutting table, duplicated tools, bent scissors, broken needle, extra hands, extra fingers, malformed fingers, floating hand, unreadable fake labels, fast cuts, camera shake, whip pan, orbit shot, aggressive zoom, flicker, exposure pumping, color shift, unstable shadows, moving walls, crawling embroidery, texture swimming, frame blending, ghosting, oversharpening, crushed shadows, blown highlights, low resolution, compression blocks, abrupt loop, unmatched opening and closing frames
```

**إعدادات مقترحة:** ولّد النسخة الأفقية مستقلة عن الجوال، وثبّت موضع الفستان في الثلث الأيسر، ثم اختبر لقطة ثابتة من الفيديو مع العنوان العربي قبل اعتماد النتيجة.

### 22.4 Prompt 03 — فيلم الحرفة في قسم التفصيل

**الاستخدام:** لوحة الحرفة داخل قسم التفصيل.  
**النسبة:** 4:5 للجوال والبطاقات، ويمكن إنتاج 16:9 لسطح المكتب.  
**المدة:** 6–8 ثوانٍ.

```text
An intimate couture craftsmanship film focused on precise dressmaking details. Macro shot of tailor's chalk marking a clean line on warm ivory fabric, professional scissors cutting slowly along the line, a sewing machine needle forming an exact seam with deep burgundy thread, delicate bead embroidery being inspected, and fabric being carefully draped on a dress form. Premium real atelier atmosphere, calm deliberate hands, modest luxury eveningwear, realistic textile physics, warm ivory and deep burgundy palette, soft side lighting, shallow depth of field, elegant editorial framing, slow controlled camera, no face, no text, no logo, no watermark, 24 fps, 6 to 8 seconds.
```

**Negative Prompt:**

```text
extra fingers, distorted hands, unsafe scissor position, warped needle, messy workspace, text, logo, watermark, cheap polyester shine, harsh light, fast motion, jump cuts, glitter effects, fantasy particles, visible face, mannequin deformation, flicker
```

#### النسخة الاحترافية المطوّرة — فيلم الحرفة

**الهدف الإنتاجي:** تقديم دليل بصري هادئ ومقنع على جودة التنفيذ، مع إبقاء أسفل اليمين صالحًا لعبارة «لا نتبع التفاصيل… نصنعها» وأعلى اليسار صالحًا للتسمية العمودية داخل لوحة الحرفة.

**Prompt الاحترافي:**

```text
Create an intimate, production-ready couture craftsmanship film for the tailoring-story section of a premium Arabic fashion website. Primary format: 4:5 portrait, 1080x1350, 24 fps, exactly 8 seconds, silent, loop-friendly. Optional alternate master: 16:9 using the same art direction but independently composed. The film will appear inside a large editorial panel with live Arabic text over the lower-right corner and a small vertical label at the upper-left.

WEBSITE COMPOSITION AND SAFE AREAS:
- Keep the lower-right 34% dark, calm, and low-detail for a large two-line Arabic statement.
- Keep the upper-left 12% free from hands, tools, bright highlights, or critical detail for a vertical label.
- Place the active craft action across the center-left and upper-middle of the frame.
- Keep hands and tools inside the central 76% to survive responsive cropping.
- The visual hierarchy must read immediately on a phone: one clear action at a time, large textile detail, restrained background.

SHOT FLOW:
0.0–1.5 seconds — Macro view of tailor’s chalk drawing one precise, continuous guideline across warm-ivory fabric on a clean professional cutting table. Show authentic chalk dust in a restrained, realistic amount. The line must remain straight and stable.
1.5–3.0 seconds — A pair of professional tailoring shears makes one slow, safe, controlled cut exactly along the chalk line. Show only one anatomically correct hand if needed, with natural grip, correct finger count, realistic wrist posture, and safe blade orientation. The cut edge must remain clean and physically consistent.
3.0–4.5 seconds — Match cut to a sewing-machine needle forming a precise seam with deep-burgundy thread. The presser foot, feed dogs, needle, fabric movement, and stitch direction must operate mechanically correctly. The stitch length and thread path must stay consistent across frames.
4.5–6.0 seconds — Close inspection of restrained bead embroidery and lining finish. One natural hand gently checks the beadwork once; beads and motifs remain fixed, symmetrical where appropriate, and securely attached.
6.0–7.5 seconds — Fabric is carefully draped on a professional dress form in the center-left, revealing a refined section of a modest evening-gown silhouette. End by returning through an ivory fabric fold that visually matches the opening textile position for a soft loop.

ART DIRECTION AND REALISM:
Authentic working couture atelier, immaculate but lived-in, never sterile and never messy. Deep wine and burgundy accents, warm ivory fabric, dusty-rose undertones, sand-colored work surface, tiny muted-gold highlights only in metal tools. Soft directional side light with subtle practical warmth, realistic skin tone if a hand appears, accurate textile weight, visible weave, natural seam tension, controlled shallow depth of field, cinematic editorial framing, calm deliberate pace. The result should communicate patience, accuracy, and hand-finished quality rather than generic luxury decoration.

CAMERA:
Stabilized macro slider, 85–100mm macro lens look, moderate depth of field so the working point and nearby textile remain legible. Use match cuts motivated by the burgundy thread or ivory fold. No handheld shake, no rapid montage, no extreme slow-motion artifacts, no focus hunting. Maintain consistent table geometry, tool shape, hand anatomy, fabric identity, embroidery pattern, and lighting direction.

OUTPUT RESTRICTIONS:
No face, no customer identity, no body, no spoken dialogue, no audio, no generated text, no logo, no watermark, no brand signage. Do not include booking imagery, measuring-session signage, price tags, product labels, interface graphics, or decorative particles. Keep the footage suitable beneath a dark lower gradient added by the website.
```

**Negative Prompt الاحترافي:**

```text
text, letters, logo, watermark, subtitles, price tag, booking sign, visible face, customer, full person, exposed body, extra hands, extra fingers, missing fingers, fused fingers, elongated fingers, reversed wrist, disembodied hand, changing hand anatomy, unsafe scissor handling, scissors cutting toward hand, bent scissors, duplicated scissors, warped needle, multiple needles, broken presser foot, impossible machine motion, thread passing through solid metal, reversed stitch direction, floating chalk, excessive chalk dust, crooked seam, changing stitch length, crawling embroidery, duplicated beads, melting beads, inconsistent fabric pattern, liquid fabric, plastic fabric, cheap polyester shine, messy floor, dirty table, cluttered workshop, fantasy atelier, glitter, sparks, floating particles, harsh top light, neon color, purple gradient, flicker, exposure pumping, focus breathing, focus hunting, camera shake, jump cuts, fast motion, warped dress form, changing mannequin proportions, oversharpening, low resolution, temporal morphing, compression artifacts, abrupt ending
```

**إعدادات مقترحة:** إذا فشلت الأداة في الحفاظ على اليد والأدوات، أنشئ كل لقطة على حدة لمدة 1.5–2 ثانية ثم اجمعها في المونتاج بدل توليد التسلسل كاملًا دفعة واحدة.

### 22.5 Prompt 04 — لحظة كشف الفستان النهائي

**الاستخدام:** صورة متحركة كبيرة قبل معرض الأعمال أو داخله.  
**النسبة:** 9:16 أو 4:5.  
**المدة:** 6 ثوانٍ.

```text
A refined reveal of a finished modest couture evening gown on a dress form in a warm contemporary atelier. Start with an extreme close-up of hand-finished embroidery and subtle beadwork, then slowly pull back to reveal the full elegant silhouette. The gown uses dusty rose and warm ivory tones with restrained detailing, realistic fabric weight and folds, premium tailoring, clean hem and precise structure. Soft window light with deep burgundy shadows, muted antique gold accents in the room, editorial luxury fashion campaign, calm stabilized camera, no person, no face, no text, no logo, no watermark, 24 fps, 6 seconds.
```

#### النسخة الاحترافية المطوّرة — كشف الفستان النهائي

**الهدف الإنتاجي:** لقطة تحريرية عمودية تصلح كبطل بصري قبل معرض الأعمال أو كعمل مميز داخله، وتعرض جودة القصّة والتشطيب من التفاصيل إلى الصورة الكاملة من دون قص الحاشية أو تشويه المانيكان.

**Prompt الاحترافي:**

```text
Create a production-ready editorial reveal of one finished modest couture evening gown for the tailoring showcase of a premium Arabic fashion atelier website. Format: native 4:5 portrait, 1080x1350, with an optional independently composed 9:16 version, 24 fps, exactly 6 seconds, silent, elegant and loop-friendly. The dress must remain the same garment in every frame with no change in color, neckline, sleeves, embroidery, silhouette, hem, or construction.

SHOT DESIGN:
0.0–1.6 seconds — Begin on an extreme macro detail of hand-finished embroidery at the bodice or cuff. Show fine thread tension, restrained beadwork, clean lining, precise edge finishing, and authentic fabric weave. The motif must be elegant and consistent, not overly ornate.
1.6–3.2 seconds — Execute a very slow stabilized pull-back, revealing the relationship between embroidery, seam construction, structured waist, and the drape of the skirt. The transition must be continuous with no morphing or hidden garment swap.
3.2–5.4 seconds — Complete the reveal of the full modest evening-gown silhouette on a professional dress form. Use refined coverage, a structured modest neckline, elegant long or three-quarter sleeves if visible, balanced proportions, natural fabric weight, precise waist construction, clean hem, and restrained dusty-rose with warm-ivory detailing. The entire dress, including the hem and a small breathing margin below it, must remain inside frame.
5.4–6.0 seconds — Hold the final silhouette long enough to read clearly, while a soft foreground fold or controlled light falloff prepares a transition back to the opening macro texture if the clip is looped.

COMPOSITION FOR THE SHOWCASE:
- Center the dress form slightly left of center to create subtle editorial asymmetry.
- Keep the upper-right 20% calm for an optional live title or gallery indicator.
- Preserve at least 8% safe margin around the shoulders, sleeves, widest skirt point, and hem.
- Use a clean atelier background with architectural lines that frame the gown without competing with it.
- The final wide view must remain legible when cropped into both a large 4:5 feature tile and a narrower mobile carousel card.

ART DIRECTION:
Contemporary Damascus atelier expressed through warm materiality and restraint: warm ivory walls, deep-burgundy shadow accents, dusty-rose couture textile, sand-toned floor, and minimal muted-antique-gold metal details. Soft window light from one side, delicate rim light separating the silhouette, natural shadow detail, subtle cinematic grain, realistic textile response, editorial luxury photography, quiet confidence. Avoid bridal styling, princess fantasy, costume drama, excessive sparkle, and generic pink showroom aesthetics.

CAMERA AND CONSISTENCY:
Use a stabilized 85mm fashion-editorial lens look with a slow optical or physical pull-back, no digital zoom. Maintain straight vertical architecture, realistic perspective, stable dress-form proportions, and consistent light direction. The embroidery pattern, bead count, seam placement, fabric color, sleeve construction, dress-form neck, and room geometry must remain temporally identical throughout.

OUTPUT RESTRICTIONS:
No person, no model, no face, no customer, no text, no letters, no logo, no watermark, no signage, no price, no audio, no UI, no generated brand mark. Deliver a clean master suitable for extracting a matching WebP poster and for later web compression.
```

**Negative Prompt الاحترافي:**

```text
text, Arabic letters, Latin letters, logo, watermark, signage, price, visible person, model, face, skin, exposed body, bridal veil, wedding bouquet, crown, tiara, princess costume, ball-room fantasy, excessive train, exaggerated corset, transparent bodice, plunging neckline, sleeveless revealing dress, inconsistent modesty, changing neckline, changing sleeves, changing gown color, shifting embroidery, crawling beads, duplicated motifs, disappearing seam, asymmetric accidental construction, warped hem, cropped hem, cropped shoulder, floating dress, malformed mannequin, human-shaped mannequin face, extra torso, tilted dress form, plastic satin, metallic foil, liquid folds, weightless fabric, excessive glitter, sparkle particles, harsh spotlight, neon pink, purple gradient, busy background, crooked architecture, camera shake, fast zoom, jump cut, hidden garment swap, temporal morphing, exposure flicker, color shift, focus hunting, oversharpening, low resolution, compression artifacts, abrupt ending
```

**إعدادات مقترحة:** استخدم صورة مرجعية للفستان الحقيقي عندما يكون الهدف عرض عمل منفذ؛ وإذا كان الفستان مولدًا بالكامل فيجب اعتباره مادة دعائية لا توثيقًا لعمل حقيقي.

### 22.6 Prompt 05 — انتقال القماش بين القسمين

**الاستخدام:** الانتقال من التفصيل إلى متجر الأقمشة.  
**النسبة:** 16:9 Master مع نسخة 9:16.  
**المدة:** 5–6 ثوانٍ.  
**مهم:** يجب أن تكون الحركة قابلة للتكرار Loop.

```text
Extreme macro cinematic study of luxurious fabric moving like a slow wave under soft directional light. Begin in deep burgundy velvet texture, transition smoothly through the folds into warm ivory silk with a subtle dusty rose undertone, ending on a calm clean fabric surface. Hyper-realistic textile fibers, elegant slow motion, tactile detail, minimal composition, premium fashion campaign, soft highlights, deep controlled shadows, no objects, no hands, no text, no logo, no watermark. Leave the center visually calm for an Arabic sentence overlay. Seamless loop, slow fluid motion, 24 fps, 5 to 6 seconds.
```

**Negative Prompt:**

```text
liquid, smoke, plastic, metallic foil, excessive sparkle, fantasy particles, text, logo, watermark, harsh reflections, neon colors, fast wave, camera shake, flicker, low texture detail
```

#### النسخة الاحترافية المطوّرة — انتقال القماش بين القسمين

**الهدف الإنتاجي:** إنشاء توقيع بصري يربط عالم التفصيل الداكن بعالم متجر الأقمشة العاجي، مع مركز هادئ للنص وحلقة قابلة للتكرار فعليًا من دون اختلاف لوني مفاجئ بين أول وآخر إطار.

**Prompt الاحترافي:**

```text
Create a production-ready full-width macro textile transition film connecting a deep-burgundy couture story section to a warm-ivory fabric-store section on a premium Arabic fashion website. Produce two independently composed masters: native 16:9 at 1920x1080 for desktop and native 9:16 at 1080x1920 for mobile. Duration exactly 6 seconds, 24 fps, silent, perfectly seamless loop. This is an abstract but physically realistic study of fabric only—no people, no tools, no garments, no objects.

LOOP-SAFE VISUAL STRUCTURE:
The first and last frames must be visually identical: the same diagonal two-tone fold, with deep burgundy velvet occupying the upper-left and outer edges while warm-ivory silk emerges softly through the lower-right. Maintain identical fold geometry, lighting angle, camera position, exposure, and color distribution at the loop boundary.

0.0–1.5 seconds — Begin on the established two-tone fold. A single slow wave travels through deep-burgundy velvet from the upper-left toward the center. Show dense realistic velvet pile, soft directional highlights, deep controlled shadows, and natural inertia.
1.5–3.5 seconds — The moving fold turns over naturally and reveals warm-ivory silk beneath it, with only a restrained dusty-rose undertone appearing along the transition edge. The center becomes calmer and lighter, visually suggesting the move from atelier storytelling into the fabric store. The transformation must happen through physical folding and changing surface orientation, not through color morphing, smoke, liquid, or a digital dissolve.
3.5–5.0 seconds — The ivory silk settles into a broad, quiet surface while a burgundy edge remains visible as the visual link between both sections. Soft side light travels once across the weave, revealing authentic fibers without harsh specular glare.
5.0–6.0 seconds — A returning outer fold recreates the exact opening two-tone arrangement and motion direction, completing a seamless cyclic movement. The return must feel like the same fabric wave continuing, not like reverse playback or a visible reset.

COMPOSITION FOR WEBSITE TEXT:
- Reserve the central 54–60% as a low-detail, low-contrast text-safe zone for the centered Arabic sentence “كل فستان استثنائي يبدأ بقماش استثنائي,” which will be added in HTML.
- Keep the most active folds and brightest highlights near the outer thirds.
- For 16:9, allow safe cropping of 7% at the left and right edges.
- For 9:16, keep the central message area calm from approximately 28% to 66% of frame height and avoid a strong fold directly behind the text.
- The lower 18% should gradually feel warmer and lighter so the next ivory store section follows naturally, while the exact first/last frame remains loop-compatible.

MATERIAL AND ART DIRECTION:
Hyper-realistic burgundy velvet and warm-ivory silk with clearly distinct material behavior: velvet absorbs light with a dense soft pile; silk carries a restrained directional sheen and fine weave. Palette limited to deep wine (#3B1018), burgundy (#6B1726), warm ivory (#F6F0E8), and a very subtle dusty rose (#C98E94). Minimal, tactile, premium editorial fashion campaign, soft lateral studio light, fine shadow detail, elegant tonal transitions, subtle cinematic grain. No decorative objects and no artificial particles.

CAMERA AND MOTION:
Locked or near-locked macro camera with an 85–100mm macro-lens look. Movement comes primarily from one physically believable fabric wave and a very subtle light travel. No pan, orbit, zoom, handheld movement, or changing focal length. Maintain stable weave density, fiber direction, fold topology, material identity, and color across every frame. The center must remain readable beneath a soft HTML gradient.

OUTPUT RESTRICTIONS:
No text, no letters, no logo, no watermark, no brand mark, no subtitles, no audio, no garment, no hand, no sewing tool, no jewelry, no UI. Deliver clean masters suitable for extracting a matching static WebP poster and for H.264 MP4 and VP9 WebM compression.
```

**Negative Prompt الاحترافي:**

```text
text, Arabic letters, Latin letters, logo, watermark, brand mark, subtitle, garment, dress, mannequin, hand, person, tool, needle, scissors, jewelry, beads, sequins, decorative object, liquid, water, paint, ink, smoke, fog, cloud, fire, metallic foil, plastic sheet, rubber, leather, fur, excessive sparkle, glitter, fantasy particles, neon colors, cyan, violet, purple gradient, harsh reflections, blown highlights, black crushed shadows, low texture detail, fake fibers, changing weave, crawling texture, velvet turning into silk by color morph, digital dissolve, melting material, weightless cloth, floating fabric, multiple chaotic waves, fast motion, reverse-playback look, camera shake, zoom, pan, orbit, focus hunting, shallow focus hiding the weave, flicker, exposure pumping, white-balance shift, unstable fold geometry, temporal morphing, ghosting, frame interpolation artifacts, center clutter, bright highlight behind text, low resolution, oversharpening, compression blocks, visible loop seam, mismatched first and last frame, abrupt color jump
```

**إعدادات مقترحة:** استخدم إطار البداية نفسه كمرجع لإطار النهاية إن كانت الأداة تدعم Keyframes، واختبر الحلقة بتكرار الفيديو ثلاث مرات متتالية قبل اعتماده.

### 22.7 Prompt 06 — Banner حملة متجر الأقمشة

**الاستخدام:** Banner «تشكيلة المناسبات».  
**النسبة:** 16:9 ونسخة 4:5 للجوال.  
**المدة:** 6–8 ثوانٍ.

```text
A premium fabric collection campaign displayed as an elegant editorial still life in motion. Several luxurious fabrics arranged in sculptural flowing folds: warm ivory embroidered tulle, deep burgundy satin, dusty rose chiffon, and a restrained muted-gold beaded textile. Slow light travels across the textures while the fabrics move almost imperceptibly from a soft studio breeze. Clean warm ivory background, sophisticated composition, high-end fashion material campaign, realistic embroidery and weave, calm negative space on the right for Arabic campaign title and CTA, no people, no text, no brand, no logo, no watermark, stabilized camera, 24 fps, 6 to 8 seconds.
```

#### النسخة الاحترافية المطوّرة — Banner حملة الأقمشة

**الهدف الإنتاجي:** إنتاج لحظة حملة تجارية كبيرة بعد بطاقات المنتجات، مع ترتيب الخامات في أعلى ويسار المشهد وإبقاء أسفل اليمين صالحًا لعنوان الحملة والوصف والرابط في التخطيط الفعلي.

**Prompt الاحترافي:**

```text
Create a production-ready premium fabric-collection campaign film for a full-width banner on an Arabic luxury textile-store website. Produce two independently composed versions: native 16:9 at 1920x1080 for desktop and native 4:5 at 1080x1350 for mobile. Duration exactly 8 seconds, 24 fps, silent, loop-friendly. The film must function behind live right-aligned Arabic HTML campaign copy placed in the lower-right corner.

PRODUCT-STILL-LIFE COMPOSITION:
- Arrange four distinct luxury textiles as a sculptural editorial still life concentrated in the upper-left and center-left: warm-ivory embroidered tulle, deep-burgundy satin, dusty-rose chiffon, and one restrained muted-gold beaded textile.
- Preserve clear physical separation between the materials so viewers can recognize differences in transparency, weave, drape, embroidery, sheen, and weight.
- Reserve the lower-right 38% as calm, darker, low-detail negative space for the Arabic eyebrow, campaign title, one-line description, and CTA link.
- Keep the top 12% visually quiet enough for responsive cropping and avoid placing the brightest highlight at either edge.
- For the 4:5 version, stack the fabrics diagonally from upper-left to center while protecting the lower-right copy area; do not crop an existing 16:9 composition.

MOTION PLAN:
0.0–2.0 seconds — Establish the complete still life with a slow, almost imperceptible camera push. The textiles rest naturally with believable gravity and contact shadows.
2.0–5.5 seconds — A broad, soft band of side light travels once from left to center, revealing each material in sequence: the fine embroidery and transparency of ivory tulle, the deep controlled sheen of burgundy satin, the airy layered drape of dusty-rose chiffon, and the restrained sparkle of muted-gold beadwork. Fabric movement should be minimal—only a slight edge response to a gentle studio breeze, never enough to alter the arrangement.
5.5–8.0 seconds — The light and tiny fabric motion settle back toward the opening state, returning to the same composition and tonal balance for a smooth loop.

MATERIAL ACCURACY:
Every textile must behave according to its real properties. Tulle is fine, semi-transparent, and embroidered with stable motifs. Satin is heavier with broad, controlled highlights, not mirror-like. Chiffon is lightweight and layered but not smoky or liquid. Beaded textile has physically attached, consistently placed beadwork with restrained muted-gold reflection. No material may change color, pattern, transparency, or weave during the clip.

ART DIRECTION:
High-end editorial material campaign, contemporary and warm rather than bridal or decorative. Clean warm-ivory studio environment, deep-wine shadow accents, dusty rose used as a secondary tone, muted gold below 5% of visible area. Soft directional key light, large diffused fill, realistic contact shadows, controlled highlights, subtle grain, accurate color, premium tactile detail. Elegant asymmetry and generous breathing room, no generic ecommerce tabletop layout.

CAMERA AND CONSISTENCY:
Use a stabilized 70–85mm editorial still-life lens look with a very slow dolly-in of no more than 2–3%. No orbit, no top-down spin, no rapid parallax, no abrupt rack focus. Maintain stable embroidery patterns, bead placement, fabric edges, shadow direction, background color, and arrangement across all frames. Keep the lower-right copy-safe zone visually stable throughout.

OUTPUT RESTRICTIONS:
No person, no hand, no model, no mannequin, no dress, no product label, no price, no text, no Arabic or Latin letters, no logo, no watermark, no brand signage, no UI, no button, no audio. Do not bake in the campaign title or CTA. Deliver a clean master suitable for a matching WebP poster and web compression.
```

**Negative Prompt الاحترافي:**

```text
text, Arabic letters, Latin letters, logo, watermark, price tag, product label, button, UI, person, hand, face, model, mannequin, finished dress, wedding scene, bridal styling, bouquet, crown, fantasy palace, excessive decoration, generic ecommerce product grid, symmetrical catalog layout, cluttered lower-right area, subject behind copy, bright highlight behind text, excessive gold, gold covering large area, glitter storm, sequins everywhere, floating particles, smoke, fog, liquid chiffon, plastic satin, metallic foil, rubber fabric, fake tulle, changing embroidery, crawling pattern, duplicated beads, disappearing beads, unstable transparency, changing color, magenta cast, purple gradient, neon colors, harsh light, clipped highlights, crushed shadows, fabric levitation, chaotic wind, fast movement, orbit camera, spinning tabletop, rapid zoom, camera shake, focus hunting, flicker, exposure pumping, unstable shadows, temporal morphing, low resolution, oversharpening, compression artifacts, abrupt loop
```

**إعدادات مقترحة:** اعتمد نسخة الأقمشة كحملة مزاجية لا كمرجع لمنتج بعينه؛ صور المنتجات وأسعارها في البطاقات يجب أن تبقى مأخوذة من الأقمشة الحقيقية.

### 22.8 Prompt 07 — حلقة زخرفية للخيط

**الاستخدام:** عنصر صغير أو خلفية بين مراحل التفصيل، وليس Hero مستقلًا.  
**النسبة:** 1:1 بخلفية شفافة إن كانت الأداة تدعم ذلك، أو خلفية عاجية موحدة.  
**المدة:** 3–4 ثوانٍ.

```text
A single deep burgundy couture thread moves gracefully across a warm ivory background, forming one elegant flowing curve inspired by the silhouette of a long evening gown without forming any logo or letters, then relaxing back into its starting position. Minimal luxury motion design, precise smooth path, soft realistic thread fibers, subtle shadow, no particles, no text, no logo, no watermark, centered composition, seamless loop, 3 to 4 seconds.
```

#### النسخة الاحترافية المطوّرة — حلقة الخيط الزخرفية

**الهدف الإنتاجي:** عنصر موشن صغير وهادئ يربط مراحل التفصيل بصريًا من دون أن يبدو شعارًا أو حرفًا أو زخرفة جاهزة، ويعمل فوق الخلفية العاجية من دون جذب الانتباه بعيدًا عن النص.

**Prompt الاحترافي:**

```text
Create a minimal production-ready couture-thread motion loop for a refined Arabic fashion website. Format: native 1:1 square, 1080x1080 master, 24 fps, exactly 4 seconds, silent, perfectly seamless. Preferred output: true transparent alpha background if the generation tool and export pipeline support clean alpha; otherwise use one perfectly uniform warm-ivory background (#F6F0E8) with no texture, vignette, or color variation.

ANIMATION:
Begin with one continuous deep-burgundy couture thread (#6B1726) resting in a gentle horizontal curve across the central area. The thread must have realistic fine fibers, consistent thickness, a subtle soft contact shadow, and no visible needle.

0.0–1.2 seconds — The right end lifts slightly and travels in one smooth, controlled motion, as if guided by a precise invisible hand outside the frame. The rest of the thread responds with believable tension and drag.
1.2–2.6 seconds — The moving thread forms one elegant open S-curve loosely inspired by the long flow and waist transition of an evening-gown silhouette. It must remain an abstract curve only: never a recognizable dress drawing, logo, monogram, Arabic letter, Latin letter, number, heart, flower, crown, or infinity symbol.
2.6–4.0 seconds — The curve relaxes along the same physical path into the exact opening position, with identical thread placement, tension, shadow, and end orientation for a seamless loop. The return should feel like natural thread relaxation, not reversed footage.

COMPOSITION:
- Keep the entire thread inside the central 78% safe area with at least 11% clear margin on every side.
- Use only one thread and one continuous unbroken line.
- Limit the maximum height of the curve to approximately 42% of frame height so surrounding process text remains dominant.
- Keep motion slow and readable at small display sizes between 120 and 320 CSS pixels.
- No end of the thread may leave the frame, point directly at UI text, or create a closed emblem shape.

LOOK AND MOTION QUALITY:
Quiet refined minimalism, accurate couture-thread fibers, matte deep-burgundy color, subtle realistic shadow, precise spline-like motion with organic inertia and no mechanical bounce. The thread must not stretch, split, multiply, melt, glow, sparkle, or change thickness. Background or alpha must remain perfectly stable across frames. Use gentle ease-in-out timing and preserve full temporal consistency.

OUTPUT RESTRICTIONS:
No text, no calligraphy, no letters, no numbers, no logo, no brand mark, no watermark, no particles, no needle, no hand, no fabric, no decorative border, no audio. Deliver a clean master that can be exported as WebM with alpha when supported, or as a standard video over the exact ivory website background.
```

**Negative Prompt الاحترافي:**

```text
text, Arabic calligraphy, Arabic letter, Latin letter, number, logo, monogram, brand mark, signature, watermark, dress icon, literal gown outline, heart, infinity symbol, flower, rose, crown, star, bow, closed emblem, multiple threads, braided thread, rope, cable, wire, ribbon, yarn ball, needle, pin, scissors, hand, fabric background, textured background, gradient background, vignette, background color shift, visible alpha fringe, white halo, black halo, hard shadow, glowing thread, neon burgundy, glitter, sparkles, particles, dust, smoke, liquid motion, melting thread, stretching thread, changing thickness, broken thread, disappearing end, thread leaving frame, tangled knot, chaotic motion, bounce, overshoot, jitter, camera movement, zoom, rotation of canvas, flicker, temporal morphing, low resolution, jagged edges, compression artifacts, mismatched first and last frame, visible loop seam
```

**إعدادات مقترحة:** اختبر العنصر بالحجم الذي سيظهر به فعليًا، لأن التفاصيل الدقيقة جدًا التي تبدو جميلة عند 1080px قد تختفي كليًا داخل الواجهة.

### 22.9 Prompt 08 — فيديو Macro اختياري لبطاقات الأقمشة

**الاستخدام:** فيديو قصير لمنتج قماش عند عدم توفر تصوير حقيقي.  
**ملاحظة:** يفضل دائمًا تصوير القماش الحقيقي لأن الذكاء الاصطناعي قد يغير لونه أو نقشته.

```text
Product-accurate macro video of [FABRIC TYPE AND COLOR], showing the real weave, embroidery pattern and transparency under neutral soft studio light. A gloved hand gently lifts one edge once to demonstrate drape and weight, then releases it. Static camera, clean warm-white background, true-to-life color, no color shifts, no added decoration, no text, no logo, no watermark, no face, 4:5 composition, 4 to 5 seconds, 24 fps.
```

#### النسخة الاحترافية المطوّرة — فيديو Macro لبطاقة قماش

**الهدف الإنتاجي:** إنشاء فيديو منتج قصير داخل بطاقة 4:5 يوضح اللون والنقشة والشفافية والانسياب بدقة، مع إلزام الأداة بالصورة المرجعية وعدم اختراع تفاصيل تجارية غير موجودة.

**بيانات يجب تعبئتها قبل الاستخدام:**

```text
[FABRIC COMMERCIAL NAME]
[FABRIC TYPE]
[EXACT COLOR NAME]
[REFERENCE COLOR VALUE OR LAB/RGB IF AVAILABLE]
[WEAVE OR EMBROIDERY DESCRIPTION]
[TRANSPARENCY: opaque / semi-sheer / sheer]
[WEIGHT: light / medium / heavy]
[SURFACE: matte / low sheen / satin sheen]
[REFERENCE IMAGE OR REAL PRODUCT VIDEO]
```

**Prompt الاحترافي:**

```text
Create a product-accurate macro demonstration video of [FABRIC COMMERCIAL NAME], a [FABRIC TYPE] in [EXACT COLOR NAME], using the supplied real reference image or reference footage as the single authoritative source for color, weave, embroidery, motif scale, transparency, sheen, and edge finish. Format: native 4:5 portrait, 1080x1350, 24 fps, exactly 5 seconds, silent, static camera, loop-friendly. This video will fill the media area of an ecommerce fabric card; all product name, category, price, discount, and availability information will appear below it as live HTML and must not be generated inside the video.

ACCURACY REQUIREMENTS:
- Match the reference color under neutral lighting without warming, cooling, saturating, or beautifying it. Target [REFERENCE COLOR VALUE OR LAB/RGB IF AVAILABLE] when supplied.
- Reproduce the exact weave or embroidery described as [WEAVE OR EMBROIDERY DESCRIPTION], at the same motif scale, repeat spacing, density, thread color, and orientation as the reference.
- Preserve the real transparency level: [TRANSPARENCY], the real weight: [WEIGHT], and the real surface response: [SURFACE].
- Do not add beads, sequins, metallic thread, lace, print, border, gradient, sparkle, or decorative motif that is not visible in the reference.
- If the model cannot reproduce the product accurately, produce no final commercial asset; the result must be treated only as a placeholder pending comparison with the real fabric.

SHOT AND ACTION:
0.0–1.0 seconds — Start on the fabric resting naturally across a clean warm-white seamless surface. Show a representative area of the weave or embroidery in clear focus. The initial state must be suitable as the card poster.
1.0–3.2 seconds — One clean neutral-gray or white cotton-gloved hand enters slowly from the side edge, gently lifts one corner only once by approximately 8–12 centimeters, and holds briefly to demonstrate authentic drape, weight, reverse-side appearance, and transparency. The grip must be anatomically correct and must not cover the representative motif.
3.2–4.5 seconds — The hand releases the edge once. The fabric falls and settles naturally according to its stated weight, without bouncing unnaturally, changing pattern, or floating.
4.5–5.0 seconds — The hand exits completely and the fabric returns as closely as physically possible to the opening resting composition for a soft loop.

COMPOSITION FOR THE PRODUCT CARD:
- Fill the frame with the real fabric while preserving a small warm-white border or background area sufficient to read the edge and transparency.
- Keep the representative weave or embroidery centered inside the central 70% safe area.
- Do not place a hand or fold over the most important motif for more than one second.
- Keep all important detail visible after object-fit: cover and allow up to 5% crop on every edge.
- Use moderate depth of field so both the lifted edge and the central surface retain useful product information; avoid cinematic blur that hides texture.

LIGHTING AND CAMERA:
Use color-controlled neutral studio light around 5000–5600K, high color-rendering quality, soft diffused key light at approximately 45 degrees, gentle neutral fill, and no colored practical lights. Lock exposure, white balance, focus, and camera position. Use an 85–100mm macro-lens look with realistic perspective and no wide-angle distortion. Include subtle contact shadows and accurate highlights appropriate to the material, with no clipping or crushed dark detail.

TEMPORAL CONSISTENCY:
The fabric color, motif, weave, transparency, edge, and background must remain identical in every frame. The glove must remain one consistent hand with correct anatomy. No pattern crawling, color breathing, motif regeneration, texture swimming, changing transparency, or geometry morphing is permitted.

OUTPUT RESTRICTIONS:
No text, no numbers, no price, no Arabic or Latin letters, no logo, no watermark, no label, no packaging, no ruler, no face, no skin, no jewelry, no nail polish, no decorative props, no audio. Deliver a clean master suitable for H.264 MP4, VP9 WebM, and extraction of a matching WebP poster.
```

**Negative Prompt الاحترافي:**

```text
wrong color, color shift, warmer color, cooler color, increased saturation, beautified color, inaccurate white balance, changing color between frames, invented weave, invented pattern, altered motif scale, altered repeat spacing, added embroidery, removed embroidery, added lace, added beads, added sequins, added metallic thread, added glitter, added print, added border, added gradient, changing transparency, fake transparency, changing sheen, plastic surface, metallic foil, liquid fabric, smoke-like chiffon, incorrect weight, floating cloth, unrealistic bounce, texture swimming, crawling pattern, temporal morphing, duplicated motif, broken repeat, blurred product detail, excessive shallow depth of field, overexposure, crushed shadows, harsh reflection, colored lighting, mixed lighting, dirty background, clutter, props, flowers, scissors, ruler, label, packaging, text, Arabic letters, Latin letters, price, logo, watermark, bare hand, skin, nail polish, rings, bracelet, extra fingers, missing fingers, fused fingers, distorted glove, multiple hands, hand covering motif, camera movement, zoom, pan, focus hunting, exposure pumping, flicker, low resolution, oversharpening, compression artifacts, visible loop jump
```

**إعدادات مقترحة:** لا يعتمد هذا الفيديو للبيع إلا بعد عرضه بجانب القماش الحقيقي تحت إضاءة محايدة وموافقة المسؤول عن المنتج على اللون والنقشة والشفافية.

**تنبيه:** لا يعتمد هذا البرومبت لتمثيل منتج حقيقي للبيع إلا بعد مقارنة الفيديو بالقماش الفعلي والتأكد من دقة اللون والنقشة والشفافية.

---

## 23. مواصفات ملفات الوسائط

### 23.1 بنية الملفات المقترحة

```text
public/media/home/
├── hero/
│   ├── hero-mobile.webm
│   ├── hero-mobile.mp4
│   ├── hero-mobile-poster.webp
│   ├── hero-desktop.webm
│   ├── hero-desktop.mp4
│   └── hero-desktop-poster.webp
├── tailoring/
│   ├── craft-film.webm
│   ├── craft-film.mp4
│   ├── craft-poster.webp
│   ├── final-reveal.webm
│   ├── final-reveal.mp4
│   └── showcase/
│       ├── work-01.webp
│       ├── work-02.webp
│       └── ...
├── transitions/
│   ├── fabric-transition-mobile.webm
│   ├── fabric-transition-desktop.webm
│   └── fabric-transition-poster.webp
└── fabrics/
    ├── campaign-mobile.webm
    ├── campaign-desktop.webm
    └── campaign-poster.webp
```

### 23.2 ميزانية الملفات

| الملف | الحد المستهدف |
|---|---:|
| Hero الجوال WebM | 3–4 MB |
| Hero الجوال MP4 | 4–5 MB |
| Hero سطح المكتب WebM | 5–7 MB |
| Hero سطح المكتب MP4 | 7–9 MB |
| فيديو قسم داخلي | 2–4 MB |
| فيديو انتقال | 2–3 MB |
| Poster | 120–250 KB |
| صورة معرض 4:5 | 150–350 KB |
| Thumbnail | 30–80 KB |

### 23.3 الترميز

- WebM/VP9 أو AV1 عند ملاءمة دعم المتصفحات.
- MP4/H.264 كنسخة توافق.
- `preload="metadata"` للفيديوهات الداخلية.
- Hero يمكن أن يستخدم `preload="auto"` بحذر بعد تحميل Poster، أو استراتيجية مخصصة حسب اختبار الأداء.
- جميع الصور WebP أو AVIF مع أبعاد معروفة.

---

## 24. خطة الصور الدعائية لأعمال التفصيل

### 24.1 قائمة اللقطات المطلوبة

لإطلاق مقنع، يفضل تجهيز:

- صورتين كاملتين لفستانين مختلفين بنسبة 4:5.
- صورتين قريبتين للتطريز والتشطيب.
- صورة جانبية توضح القصة والقصّة.
- صورة خلفية للفستان.
- صورة لمرحلة التنفيذ على المانيكان.
- صورة للقماش قبل القص.
- صورة أفقية واحدة للمشغل أو الحملة.
- صورة رئيسية واحدة عالية التأثير لافتتاح قسم التفصيل.

### 24.2 قواعد التصوير

- خلفيات نظيفة وموحدة قدر الإمكان.
- إضاءة ناعمة من اتجاه واحد.
- عدم استخدام فلاتر تغير لون القماش.
- ترك مساحة فارغة في بعض الصور لوضع النص.
- تصوير تفاصيل حقيقية، لا صور AI فقط.
- الحصول على موافقة واضحة عند ظهور عميلة أو وجهها.

### 24.3 Placeholder قبل توفر الصور

- تستخدم مساحات ذات نسب ثابتة مع صور مؤقتة معنونة بوضوح.
- لا يستخدم نفس الفستان في جميع المواضع.
- لا تنشر صور مؤقتة تحتوي Watermark خاص بأداة ذكاء اصطناعي.

---

## 25. استراتيجية المحتوى والنصوص

### 25.1 نبرة العلامة

- واثقة.
- دافئة.
- دقيقة.
- مختصرة.
- لا تستخدم المبالغة مثل «الأفضل على الإطلاق» دون دليل.

### 25.2 عبارات معتمدة مبدئيًا

| الموضع | النص المقترح |
|---|---|
| Hero | من القماش… نصنع حكايتك |
| Hero داعم | تفصيل يليق بك، وأقمشة اختيرت لتبدأ منها كل التفاصيل. |
| قسم التفصيل | نصنع فستانًا يحمل تفاصيلك |
| معرض الأعمال | من أعمال ياسمين الشام |
| انتقال | كل فستان استثنائي يبدأ بقماش استثنائي |
| المتجر | متجر الأقمشة |
| CTA التفصيل | تواصلي مع قسم التفصيل |
| CTA المتجر | عرض جميع الأقمشة |

### 25.3 نصوص ممنوعة

- احجزي دورك.
- احجزي موعدًا.
- موعد القياس، إذا كان يقود إلى نظام الحجز غير المستخدم.
- أضيفي للسلة، ما لم توجد سلة أقمشة كاملة وفعالة.
- اشتري الآن، إذا كانت العملية تنتهي بالاستفسار فقط.

---

## 26. المتطلبات الوظيفية

| الرقم | المتطلب | الأولوية |
|---|---|---|
| HOME-001 | عرض فيديو Hero متجاوب مع Poster بديل | Must |
| HOME-002 | توفير CTA واضح للتفصيل وCTA لمتجر الأقمشة | Must |
| HOME-003 | منع ظهور أي CTA للحجز أو الدور | Must |
| HOME-004 | تمرير سلس إلى القسم المحدد | Must |
| HOME-005 | عرض قسم دعائي مستقل للتفصيل | Must |
| HOME-006 | توفير معرض أعمال تفصيل قابل لإضافة الصور وترتيبها | Must |
| HOME-007 | فتح صور الأعمال في Lightbox ودعم السحب | Should |
| HOME-008 | توفير CTA واتساب برسالة تفصيل مسبقة | Must |
| HOME-009 | عرض الأقمشة المميزة من البيانات الحالية | Must |
| HOME-010 | عرض اسم القماش والسعر بالمتر والتوفر | Must |
| HOME-011 | دعم الخصومات في بطاقة القماش | Must |
| HOME-012 | ربط بطاقة القماش بصفحة التفاصيل | Must |
| HOME-013 | عرض فئات سريعة مبنية على البيانات المتاحة | Should |
| HOME-014 | عرض حالات التحميل والخطأ والبيانات الفارغة | Must |
| HOME-015 | إيقاف فيديوهات الأقسام خارج الشاشة | Must |
| HOME-016 | دعم `prefers-reduced-motion` | Must |
| HOME-017 | تسجيل أحداث التحويل الأساسية | Must |
| HOME-018 | دعم RTL الكامل وكل نقاط القياس المحددة | Must |
| HOME-019 | إبقاء الروابط الخدمية غير الرئيسية خارج بنية القسمين | Should |
| HOME-020 | عدم إضافة سلة أو Checkout وهمي | Must |

---

## 27. المتطلبات غير الوظيفية

### 27.1 الأداء

- تحميل الوسائط الداخلية Lazy Loading.
- استخدام `IntersectionObserver` لتشغيل الفيديو وإيقافه.
- عدم تنزيل نسختي فيديو الجوال وسطح المكتب معًا.
- استخدام `poster` دائمًا.
- تحديد أبعاد جميع الصور لمنع CLS.
- عدم تحويل الصفحة كلها إلى Client Component إذا أمكن؛ تستخدم Client Islands للحركة والمعارض.
- تقليل عدد مستمعي Scroll، واستخدام Motion/IntersectionObserver بدل تحديث React state في كل إطار.
- عدم استخدام `will-change` على كل عناصر الصفحة.

### 27.2 الإتاحة

- تباين النص 4.5:1 على الأقل للنص العادي.
- تباين 3:1 للنص الكبير والعناصر الرسومية الأساسية.
- Focus مرئي لجميع الروابط والأزرار.
- ترتيب لوحة المفاتيح منطقي.
- زر إغلاق واضح للـLightbox.
- إغلاق Modal بزر Escape.
- منع التركيز خارج Modal أثناء فتحه.
- Alt text وصفي للصور.
- الفيديو الزخرفي لا يحتاج ترجمة إذا لم يحتو كلامًا، ويجب اعتباره غير دلالي للقارئ الآلي.

### 27.3 الأمان والخصوصية

- روابط واتساب تستخدم `noopener noreferrer` عند الفتح في تبويب جديد.
- عدم تضمين بيانات عميلات في أسماء الصور أو Alt text.
- عدم نشر صورة عميلة دون موافقتها.
- عدم تسجيل محتوى رسالة واتساب كبيانات تحليلية.

### 27.4 التوافق

- آخر إصدارين من Chrome وSafari وEdge وFirefox.
- Safari على iOS أولوية مرتفعة بسبب autoplay وSafe Area.
- WebView الخاص بتطبيق Capacitor إن كانت الصفحة مستخدمة داخله.

---

## 28. SEO والمشاركة الاجتماعية

### 28.1 العنوان والوصف

يتم تحديث Metadata لتصف النشاطين بوضوح:

**Title مقترح:**

> ياسمين الشام | تفصيل فساتين ومتجر أقمشة في الخبر

**Description مقترح:**

> اكتشفي تفصيل ياسمين الشام وتصفحي تشكيلة الأقمشة المختارة لفساتين السهرة والمناسبات في الخبر.

### 28.2 بنية العناوين

- H1 واحد في Hero.
- H2 لقسم التفصيل.
- H2 لمتجر الأقمشة.
- H3 للوحدات الفرعية.

### 28.3 البيانات المنظمة

- الحفاظ على `ClothingStore` أو اختيار نوع أكثر دقة بعد مراجعة SEO.
- إضافة `ItemList` اختياري للأقمشة المميزة إن كان المحتوى Server Rendered.
- تحديث صورة Open Graph بصورة حملة حقيقية بدقة 1200×630.
- عدم استخدام صورة تحتوي علامة توليد AI أو شعار منخفض الدقة.

---

## 29. التحليلات والأحداث

الأحداث المقترحة:

| الحدث | وقت الإرسال | الخصائص |
|---|---|---|
| `home_view` | عند عرض الرئيسية | device_type, source |
| `hero_video_start` | بدء تشغيل الفيديو | variant, connection_type |
| `hero_video_50` | مشاهدة 50% | variant |
| `hero_cta_click` | النقر على أحد مساري Hero | destination: tailoring/fabrics |
| `tailoring_gallery_view` | دخول معرض الأعمال للشاشة | item_count |
| `tailoring_work_open` | فتح صورة عمل | item_id, position |
| `tailoring_whatsapp_click` | نقر واتساب التفصيل | placement |
| `fabric_card_view` | ظهور البطاقة بنسبة 50% | fabric_id, position |
| `fabric_card_click` | فتح تفاصيل القماش | fabric_id, position |
| `fabric_category_click` | اختيار فئة | category |
| `fabrics_all_click` | فتح المتجر الكامل | placement |
| `fabric_whatsapp_click` | استفسار واتساب | fabric_id, placement |

قواعد:

- لا ترسل أرقام هواتف أو نص الرسائل.
- تمنع الأحداث المكررة عند إعادة التصيير.
- يتم توثيق أسماء الأحداث في ملف واحد.

---

## 30. البنية التقنية المقترحة

### 30.1 مكونات الصفحة

```text
HomePage
├── HomeHeader
├── CinematicHero
├── BusinessGateway
│   ├── TailoringGatewayCard
│   └── FabricsGatewayCard
├── TailoringStory
│   ├── CraftFilm
│   ├── TailoringValuePoints
│   ├── TailoringProcess
│   ├── TailoringShowcase
│   └── TailoringWhatsAppCTA
├── FabricTransition
├── FeaturedFabricStore
│   ├── FabricCategoryChips
│   ├── FeaturedFabricCarousel
│   ├── FabricCard
│   └── FabricCampaignBanner
├── TrustStrip
└── Footer
```

### 30.2 استراتيجية Server/Client

- الصفحة والغلاف النصي والمحتوى الثابت: Server Components قدر الإمكان.
- الفيديو التفاعلي، Carousel، Lightbox، وتتبع الظهور: Client Components صغيرة.
- تحميل بيانات الأقمشة مرة واحدة، مع تجنب طلبات متكررة من كل مكون.
- يمكن إبقاء Zustand في المرحلة الأولى، لكن يفضل تمرير بيانات المنتجات المميزة من الخادم إذا سمحت بنية Supabase الحالية.

### 30.3 إعادة استخدام البنية الحالية

- استخدام بيانات `fabricStore` وحقول الأقمشة الحالية.
- استخدام `isVideoFile` للوسائط.
- الاستفادة من Embla للـCarousel.
- الاستفادة من Framer Motion للحركات الأساسية مع تقليل نطاقه.
- إعادة استخدام رابط واتساب الحالي بعد توحيد الرقم التجاري المعتمد.

### 30.4 ملاحظة رقم واتساب

توجد أرقام مختلفة في أجزاء من المشروع. قبل التنفيذ يجب اعتماد رقم رسمي واحد لكل من:

- استفسارات التفصيل.
- استفسارات الأقمشة.

إذا كان الرقم نفسه، يحفظ في إعداد مركزي واحد بدل كتابته داخل المكونات.

---

## 31. حالات الواجهة العامة

### 31.1 JavaScript غير متاح

- يظهر Poster Hero والنص والروابط الأساسية.
- تظهر صور أعمال التفصيل.
- تظهر روابط المتجر الأساسية إن كانت البيانات Server Rendered.

### 31.2 اتصال بطيء

- تظهر الصور قبل الفيديو.
- لا يوجد Loader يغطي الصفحة.
- تبقى أزرار التنقل والتواصل فعالة.

### 31.3 فشل صورة

- Placeholder يحمل ألوان الهوية ونسبة الصورة نفسها.
- لا تستخدم صورة الشعار القديمة كصورة بديلة لكل منتج.

### 31.4 فشل فيديو

- يبقى Poster.
- لا تظهر أيقونة فيديو مكسور.
- لا يعاد التحميل في حلقة لا نهائية.

---

## 32. معايير القبول النهائية

### 32.1 الصفحة والهوية

- [ ] الصفحة تعرض نشاطين رئيسيين فقط: التفصيل ومتجر الأقمشة.
- [ ] لا يظهر أي عنصر للحجز أو الدور.
- [ ] Hero يستخدم فيديو/Poster متجاوبًا ونصًا حقيقيًا فوقه.
- [ ] الهوية لا تعتمد على التدرج الوردي–البنفسجي الحالي.
- [ ] التصميم يعمل من 320px إلى 1440px دون Overflow أفقي.

### 32.2 التفصيل

- [ ] قسم التفصيل دعائي وليس شبكة منتجات للبيع.
- [ ] يوجد معرض أعمال مستقل يحتوي ستة مواضع صور على الأقل.
- [ ] يمكن ترتيب الصور وتحديد Featured.
- [ ] الصور تفتح في Lightbox وتدعم السحب على الجوال.
- [ ] يوجد CTA واتساب واضح للتفصيل.
- [ ] لا تظهر أسعار في معرض أعمال التفصيل.

### 32.3 الأقمشة

- [ ] يتم جلب الأقمشة المميزة والمتاحة من المصدر الحالي.
- [ ] البطاقة تعرض الاسم والفئة والسعر بالمتر والتوفر.
- [ ] الخصم يظهر بصورة صحيحة.
- [ ] كل بطاقة تفتح صفحة تفاصيل القماش الصحيحة.
- [ ] زر «عرض جميع الأقمشة» يفتح `/fabrics`.
- [ ] لا يوجد زر سلة أو شراء يوحي بدفع إلكتروني غير موجود.

### 32.4 الفيديو والأداء

- [ ] توجد نسخة جوال ونسخة سطح مكتب لكل فيديو أساسي.
- [ ] Poster يظهر فورًا.
- [ ] فيديوهات خارج الشاشة متوقفة.
- [ ] وضع تقليل الحركة يعمل.
- [ ] لا يتم تحميل نسختي Hero معًا.
- [ ] Core Web Vitals تحقق الميزانية المستهدفة أو توجد قائمة موثقة بأسباب الاستثناء.

### 32.5 الإتاحة والجودة

- [ ] جميع الأزرار قابلة للاستخدام بلوحة المفاتيح.
- [ ] Focus واضح.
- [ ] التباين مطابق للحد الأدنى.
- [ ] الصور لها Alt text.
- [ ] Lightbox يغلق بزر Escape ويحجز التركيز.
- [ ] لا توجد أخطاء Console في المسار الطبيعي.

---

## 33. خطة التنفيذ المرحلية

### المرحلة 0 — اعتماد المحتوى والهوية

**المخرجات:**

- اعتماد لوحة الألوان.
- اعتماد الخطوط.
- اعتماد النصوص.
- اعتماد أرقام واتساب.
- اختيار صور أعمال التفصيل.
- إنتاج الفيديوهات من البرومبتات.

**شرط الانتقال:** توفر Posters وصورتين حقيقيتين على الأقل من أعمال التفصيل.

### المرحلة 1 — الهيكل ونظام التصميم

**المخرجات:**

- Tokens للألوان والطباعة والمسافات.
- Header الجديد.
- هيكل الصفحة والأقسام.
- حالات الاستجابة الأساسية.

### المرحلة 2 — Hero وبوابة القسمين

**المخرجات:**

- Hero متجاوب.
- Poster fallback.
- CTA للتفصيل والأقمشة.
- بوابة القسمين.
- دعم reduced motion.

### المرحلة 3 — قسم التفصيل

**المخرجات:**

- قصة الحرفة.
- نقاط الإقناع.
- مراحل التنفيذ.
- معرض الأعمال.
- Lightbox.
- CTA واتساب.

### المرحلة 4 — متجر الأقمشة

**المخرجات:**

- جلب المنتجات المميزة.
- بطاقات 4:5.
- السعر والخصم والتوفر.
- الفئات السريعة.
- Banner الحملة.
- حالات الخطأ والتحميل والفراغ.

### المرحلة 5 — الأداء والتحليلات وSEO

**المخرجات:**

- ضغط الوسائط.
- Lazy loading وتشغيل الفيديو حسب الظهور.
- Metadata وOpen Graph.
- أحداث التحليلات.
- فحص Core Web Vitals.

### المرحلة 6 — QA والإطلاق

**المخرجات:**

- اختبار أجهزة ومقاسات متعددة.
- اختبار Safari iOS.
- اختبار واتساب والروابط.
- اختبار البيانات الفارغة والأخطاء.
- مقارنة بصرية مع التصميم المعتمد.
- إطلاق تدريجي ومراقبة المؤشرات.

---

## 34. خطة الاختبار

### 34.1 اختبار بصري

- 320×568.
- 360×800.
- 390×844.
- 430×932.
- 768×1024.
- 1024×768.
- 1440×900.

### 34.2 اختبار وظيفي

- CTA Hero للتفصيل.
- CTA Hero للأقمشة.
- تمرير القسمين.
- فتح وإغلاق معرض الصور.
- السحب داخل Carousel.
- فتح صفحة منتج.
- فتح واتساب برسالة صحيحة.
- عدم وجود رابط للحجز أو الدور.

### 34.3 اختبار بيانات

- صفر منتجات مميزة.
- منتج واحد.
- أكثر من ثمانية منتجات.
- منتج بسعر صفر أو بدون سعر.
- منتج عليه خصم.
- منتج أصبح غير متوفر.
- منتج صورته فيديو.
- صورة أو فيديو برابط مكسور.

### 34.4 اختبار الشبكة

- Fast 4G.
- Slow 4G.
- Offline بعد تحميل الصفحة.
- Data Saver عند توفر إمكانية الاختبار.

---

## 35. المخاطر وخطط الحد منها

| الخطر | التأثير | المعالجة |
|---|---|---|
| فيديوهات كبيرة تبطئ Hero | مرتفع | نسخ منفصلة، ضغط، Poster، ميزانية حجم واضحة |
| فيديو AI يشوه الحرفة أو القماش | مرتفع | مراجعة بشرية، تجنب تمثيل منتج حقيقي دون مطابقة |
| نقص صور أعمال حقيقية | مرتفع | إطلاق بمعرض أصغر عالي الجودة بدل صور كثيرة ضعيفة |
| خلط معرض التفصيل مع منتجات جاهزة | متوسط | مصدر بيانات مستقل وتسميات واضحة |
| أرقام واتساب غير موحدة | مرتفع | إعداد مركزي ورقم معتمد قبل الإطلاق |
| استمرار Snap Scroll القديم | متوسط | إزالته من الأقسام بعد Hero واختبار التمرير |
| ازدحام Header بالروابط القديمة | متوسط | إظهار النشاطين فقط ووضع البقية في قائمة ثانوية/Footer |
| عدم دقة ألوان القماش في AI | مرتفع | تصوير المنتج الحقيقي هو المصدر الأساسي |
| تشغيل عدة فيديوهات في وقت واحد | متوسط | IntersectionObserver وإيقاف الفيديو خارج الشاشة |

---

## 36. قائمة المواد المطلوبة من مالك المشروع

### إلزامية قبل الإطلاق

- [ ] رقم واتساب الرسمي لقسم التفصيل.
- [ ] رقم واتساب الرسمي لقسم الأقمشة.
- [ ] 6–12 صورة حقيقية لأعمال التفصيل.
- [ ] موافقة استخدام الصور المنشورة.
- [ ] شعار بصيغة SVG أو PNG شفافة عالية الدقة.
- [ ] Hero للجوال + Poster.
- [ ] Hero لسطح المكتب + Poster.
- [ ] فيديو انتقال القماش + Poster.
- [ ] اعتماد النصوص النهائية.

### مفضلة

- [ ] فيديو الحرفة.
- [ ] فيديو كشف فستان نهائي.
- [ ] فيديو حملة الأقمشة.
- [ ] صورة Open Graph للحملة.
- [ ] أسماء أو أوصاف قصيرة لبعض أعمال التفصيل.

---

## 37. القرارات المعتمدة في هذا PRD

1. الصفحة الرئيسية تحتوي على قسمين تجاريين رئيسيين فقط.
2. التفصيل قسم دعائي لإقناع الزبونة، وليس متجر فساتين جاهزة.
3. أعمال التفصيل لها معرض صور مستقل قابل للتوسعة.
4. متجر الأقمشة يعتمد بيانات المنتجات الحالية.
5. التحويل الحالي للأقمشة هو صفحة التفاصيل والاستفسار عبر واتساب.
6. لا يتم بناء سلة أو دفع إلكتروني ضمن هذا المشروع.
7. لا يوجد حجز دور أو حجز موعد في الصفحة الجديدة.
8. الفيديوهات يتم إنتاجها خارج الموقع ثم إضافتها كملفات محسنة.
9. النص والشعار لا يدمجان داخل الفيديو.
10. تمرير الأقسام بعد Hero طبيعي، وليس Snap Scroll إجباريًا.

---

## 38. أسئلة يجب حسمها قبل بدء التنفيذ

هذه الأسئلة لا تمنع اعتماد الاتجاه العام، لكنها يجب أن تحسم في المرحلة 0:

1. هل يستخدم قسم التفصيل وقسم الأقمشة رقم واتساب واحدًا أم رقمين؟
2. هل يوجد رابط مستقل حالي أو مستقبلي لعرض جميع أعمال التفصيل؟
3. هل صور أعمال التفصيل ستدار أولًا من ملف ثابت أم مطلوب ربطها بـSupabase من الإصدار الأول؟
4. ما الفئات الحقيقية التي تريد إبرازها في متجر الأقمشة؟
5. هل عبارة «من القماش… نصنع حكايتك» معتمدة، أم توجد عبارة رسمية للعلامة؟
6. هل يوجد خط عربي مرخص للعلامة أم نعتمد الخطوط المجانية المقترحة؟

---

## 39. تعريف الاكتمال (Definition of Done)

يعد المشروع مكتملًا عندما:

- تنفذ جميع متطلبات Must.
- تعتمد الصفحة بصريًا على الجوال أولًا ثم سطح المكتب.
- تضاف وسائط نهائية أو Posters نهائية معتمدة.
- يعمل قسم التفصيل كمسار دعائي واضح وينتهي بواتساب.
- يعرض متجر الأقمشة بيانات صحيحة من المصدر الحالي.
- لا يوجد أي أثر لقسم حجز الدور أو الموعد.
- تنجح اختبارات الوظائف والاستجابة والإتاحة الأساسية.
- يتم قياس الأداء وتوثيق نتائجه.
- تسجل أحداث التحليلات من دون بيانات شخصية.
- يراجع مالك المشروع النصوص والصور وأرقام التواصل ويعتمدها قبل النشر.
