-- ============================================================================
-- متجر الأقمشة الإلكتروني — جداول الطلبات والدفع والحجز
-- المرحلة 2 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- ما تفعله هذه الهجرة:
--   • تُنشئ 9 جداول جديدة بالبادئة fabric_store_ وتسلسلاً لرقم الطلب.
--   • المال بالهللة (bigint) والأطوال بالسنتيمتر (integer). لا أرقام عشرية.
--   • القاعدة تتحقق بنفسها من اتساق المبالغ مع عقد التسعير في
--     src/lib/fabric-store/pricing.ts (نفس معادلات التقريب نصف للأعلى).
--   • حالة الدفع منفصلة عن حالة التنفيذ، وكل انتقال مسموح مذكور صراحة:
--     لا يعود «مدفوع» إلى «فشل»، ولا يغيّر الموظف حالة الدفع، ولا يُجهَّز
--     طلب لم يُدفع أو تحت المراجعة. وكل تغيير حالة يُسجَّل في سجل تدقيق.
--
-- ما لا تفعله:
--   • لا تعدّل أي جدول أو دالة أو سياسة قائمة. مبيعات المحل والمخزون والأستاذ
--     لا تتأثر. (مراجع FK الجديدة إلى income وfabric_inventory
--     وfabric_inventory_colors تقفلها لحظياً أثناء إنشاء الجداول الفارغة فقط.)
--   • لا تحجز مخزوناً ولا تنشئ طلبات: الدوال التي تفعل ذلك في المراحل 3 و4.
--
-- الأمان:
--   • RLS مفعّل على كل الجداول بلا سياسات، وكل الصلاحيات مسحوبة من anon
--     وauthenticated. الوصول من مسارات الخادم بمفتاح service_role فقط.
--   • صلاحيات service_role نفسها مقيّدة حيث يجب ألا يتغيّر السجل:
--     أسطر الطلب وسجل التدقيق إضافة وقراءة فقط.
--   • الافتراضي في مخطط public يمنح anon وauthenticated كل الصلاحيات على أي
--     جدول أو تسلسل جديد؛ لذلك السحب هنا صريح لكل كائن.
--
-- التشغيل: يطبّقها المالك بنفسه، ويُفضَّل خارج ساعات عمل المحل: إنشاء مراجع FK
-- إلى income ومخزون الأقمشة يوقف الكتابة عليها حتى تنتهي الهجرة (ثوانٍ). مهلة
-- القفل أدناه تُفشلها بلا أي أثر بدل أن تنتظر خلف مبيعة جارية؛ تُعاد ببساطة.
-- التحقق بعدها: supabase/tests/fabric_store_orders_schema.sql (داخل معاملة تُلغى).
-- ============================================================================

set local lock_timeout = '5s';

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- رقم الطلب الظاهر: FS-100001 فصاعداً، من تسلسل لا يعيد استخدام رقم أبداً.
-- (لا lpad: في Postgres يقصّ الأطول من الطول المحدد، فيتكرر الرقم بعد 999999.)
-- ---------------------------------------------------------------------------

create sequence public.fabric_store_order_number_seq as bigint minvalue 1 start with 1;

-- ---------------------------------------------------------------------------
-- 1) الطلبات
-- ---------------------------------------------------------------------------

create table public.fabric_store_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null
    default ('FS-' || (100000 + nextval('public.fabric_store_order_number_seq'))::text),

  -- وصول الزائر: رمز عشوائي لا تُخزَّن منه إلا بصمته (sha256، 32 بايت).
  access_token_hash bytea not null,
  access_expires_at timestamptz not null,

  -- مفتاح عدم التكرار من المتصفح + بصمة المدخلات: نفس المفتاح بمدخلات
  -- مختلفة يُرفض (المرحلة 4).
  checkout_key uuid not null,
  request_fingerprint bytea not null,

  -- بيانات العميلة (الحد الأدنى). الهاتف بصيغة دولية E.164.
  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  -- الاستلام
  delivery_method text not null,
  delivery_option_code text,
  delivery_option_label text,

  -- المبالغ بالهللة
  currency text not null default 'SAR',
  vat_basis_points integer not null,
  items_net_halalas bigint not null,
  shipping_net_halalas bigint not null default 0,
  shipping_vat_halalas bigint not null default 0,
  vat_halalas bigint not null,
  total_halalas bigint not null,

  -- الحالات: الدفع منفصل عن التنفيذ
  payment_status text not null default 'pending',
  fulfillment_status text not null default 'unfulfilled',
  payment_due_at timestamptz not null,
  paid_attempt_id uuid,
  paid_at timestamptz,
  income_id uuid,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  needs_review boolean not null default false,
  review_reason text,

  -- إصدارات السياسات التي وافقت عليها العميلة لحظة الطلب
  terms_version text not null,
  returns_policy_version text not null,
  privacy_policy_version text not null,
  policies_accepted_at timestamptz not null,
  marketing_opt_in boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fabric_store_orders_order_number_key unique (order_number),
  constraint fabric_store_orders_checkout_key_key unique (checkout_key),
  constraint fabric_store_orders_access_token_hash_key unique (access_token_hash),
  constraint fabric_store_orders_paid_attempt_id_key unique (paid_attempt_id),
  constraint fabric_store_orders_income_id_key unique (income_id),

  constraint fabric_store_orders_order_number_format
    check (order_number ~ '^FS-[0-9]{6,}$'),
  constraint fabric_store_orders_access_token_hash_size
    check (octet_length(access_token_hash) = 32),
  constraint fabric_store_orders_request_fingerprint_size
    check (octet_length(request_fingerprint) = 32),
  constraint fabric_store_orders_access_window
    check (access_expires_at > created_at),
  constraint fabric_store_orders_payment_window
    check (payment_due_at > created_at),

  constraint fabric_store_orders_customer_name
    check (char_length(btrim(customer_name)) between 2 and 120),
  constraint fabric_store_orders_customer_phone
    check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint fabric_store_orders_customer_email
    check (
      customer_email is null
      or (char_length(customer_email) <= 254
          and customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    ),

  constraint fabric_store_orders_delivery_method
    check (delivery_method in ('shipping', 'pickup')),
  constraint fabric_store_orders_delivery_option_code
    check (delivery_option_code is null or delivery_option_code ~ '^[a-z0-9_]{1,40}$'),
  constraint fabric_store_orders_delivery_option_label
    check (delivery_option_label is null or char_length(delivery_option_label) <= 200),

  constraint fabric_store_orders_currency check (currency = 'SAR'),
  constraint fabric_store_orders_vat_basis_points check (vat_basis_points between 0 and 10000),
  constraint fabric_store_orders_amounts_non_negative
    check (items_net_halalas >= 0 and shipping_net_halalas >= 0
           and shipping_vat_halalas >= 0 and vat_halalas >= 0),
  -- السقف التقني للطلب الواحد = FABRIC_MAX_ORDER_TOTAL_HALALAS (مليون ريال).
  constraint fabric_store_orders_total_range
    check (total_halalas > 0 and total_halalas <= 100000000),
  constraint fabric_store_orders_total_sum
    check (total_halalas = items_net_halalas + shipping_net_halalas + vat_halalas),
  -- الضريبة على مجموع الطلب (البنود + الشحن) بتقريب نصف للأعلى — computeFabricOrderTotals.
  constraint fabric_store_orders_vat_rule
    check (vat_halalas = ((items_net_halalas + shipping_net_halalas) * vat_basis_points + 5000) / 10000),
  constraint fabric_store_orders_shipping_vat_within_vat
    check (shipping_vat_halalas <= vat_halalas),
  constraint fabric_store_orders_pickup_without_shipping
    check (delivery_method = 'shipping' or (shipping_net_halalas = 0 and shipping_vat_halalas = 0)),

  constraint fabric_store_orders_payment_status
    check (payment_status in ('pending', 'authorized', 'paid', 'failed', 'partially_refunded', 'refunded')),
  constraint fabric_store_orders_fulfillment_status
    check (fulfillment_status in ('unfulfilled', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled')),
  -- لا تجهيز ولا شحن ولا تسليم لمال لم يُحصَّل (المسترد كلياً يبقى صالحاً لطلب سُلِّم ثم رُدّ).
  constraint fabric_store_orders_fulfillment_requires_payment
    check (fulfillment_status in ('unfulfilled', 'cancelled')
           or payment_status in ('paid', 'partially_refunded', 'refunded')),
  constraint fabric_store_orders_fulfillment_matches_delivery
    check (not (delivery_method = 'pickup' and fulfillment_status = 'shipped')
           and not (delivery_method = 'shipping' and fulfillment_status = 'ready_for_pickup')),
  constraint fabric_store_orders_paid_fields
    check ((payment_status in ('paid', 'partially_refunded', 'refunded'))
           = (paid_at is not null and paid_attempt_id is not null)),
  constraint fabric_store_orders_income_after_payment
    check (income_id is null or paid_at is not null),
  constraint fabric_store_orders_delivered_at
    check ((fulfillment_status = 'delivered') = (delivered_at is not null)),
  constraint fabric_store_orders_cancelled_at
    check ((fulfillment_status = 'cancelled') = (cancelled_at is not null)),
  constraint fabric_store_orders_cancel_reason
    check (cancel_reason is null or char_length(cancel_reason) <= 300),
  constraint fabric_store_orders_review_reason
    check ((not needs_review or review_reason is not null)
           and (review_reason is null or char_length(review_reason) <= 500)),
  constraint fabric_store_orders_policy_versions
    check (char_length(terms_version) between 1 and 40
           and char_length(returns_policy_version) between 1 and 40
           and char_length(privacy_policy_version) between 1 and 40)
);

create index fabric_store_orders_payment_status_idx
  on public.fabric_store_orders (payment_status, created_at desc);
create index fabric_store_orders_fulfillment_status_idx
  on public.fabric_store_orders (fulfillment_status, created_at desc);
create index fabric_store_orders_needs_review_idx
  on public.fabric_store_orders (created_at desc) where needs_review;
create index fabric_store_orders_pending_due_idx
  on public.fabric_store_orders (payment_due_at) where payment_status = 'pending';
create index fabric_store_orders_customer_phone_idx
  on public.fabric_store_orders (customer_phone);

comment on table public.fabric_store_orders is
  'طلبات متجر الأقمشة الإلكتروني. مستقلة تماماً عن طلبات التفصيل (orders). الكتابة من الخادم فقط.';
comment on column public.fabric_store_orders.access_token_hash is
  'بصمة sha256 لرمز وصول الزائر العشوائي. الرمز نفسه لا يُخزَّن. رقم الطلب أو الهاتف وحده لا يخوّل.';
comment on column public.fabric_store_orders.checkout_key is
  'مفتاح عدم التكرار من المتصفح لكل محاولة إتمام طلب. إعادة الإرسال بنفس المفتاح تعيد نفس الطلب.';
comment on column public.fabric_store_orders.request_fingerprint is
  'بصمة sha256 للمدخلات المطبَّعة. نفس checkout_key بمدخلات مختلفة يُرفض.';
comment on column public.fabric_store_orders.vat_halalas is
  'ضريبة الطلب كله (البنود + الشحن) مقرّبة مرة واحدة نصف للأعلى. = مجموع ضريبة الأسطر + shipping_vat_halalas.';
comment on column public.fabric_store_orders.payment_status is
  'pending → authorized/paid/failed · authorized → paid/failed · failed → paid (دفعة متأخرة ناجحة؛ تُراجع) · paid → partially_refunded/refunded · partially_refunded → refunded. يغيّرها المزود أو النظام فقط.';
comment on column public.fabric_store_orders.fulfillment_status is
  'unfulfilled → preparing/cancelled · preparing → unfulfilled/ready_for_pickup/shipped/cancelled · ready_for_pickup → delivered/cancelled · shipped → delivered. يغيّرها الموظف أو النظام فقط.';
comment on column public.fabric_store_orders.paid_attempt_id is
  'محاولة الدفع التي سدّدت الطلب. محاولة ناجحة ثانية لنفس الطلب = دفع زائد يُراجع ويُسترد، لا شحنة ثانية.';
comment on column public.fabric_store_orders.income_id is
  'مبيعة الأقمشة في income التي أنشأها اعتماد الطلب (المرحلة 6). حذفها ممنوع ما دام الطلب مرتبطاً بها.';
comment on column public.fabric_store_orders.needs_review is
  'دفعة متأخرة تعذّر تخصيص مخزونها، أو دفع زائد، أو عدم تطابق مع المزود. لا يُجهَّز الطلب حتى تُحسم.';

-- ---------------------------------------------------------------------------
-- 2) أسطر الطلب — لقطة ثابتة لا تتغير بتغير الكتالوج
-- ---------------------------------------------------------------------------

create table public.fabric_store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fabric_store_orders(id) on delete cascade,
  line_number smallint not null,

  -- مراجع لقطة بلا FK عمداً: حذف القماش أو إعادة مزامنته لا يغيّر تاريخ الطلب.
  fabric_id uuid not null,
  inventory_item_id uuid not null,
  inventory_color_id uuid,
  fabric_code text,
  fabric_name text not null,
  color_name text,
  image_url text,

  -- وحدة البيع والكمية
  purchase_mode text not null,
  piece_length_cm integer,
  quantity_pieces smallint,
  quantity_cm integer,
  stock_consumption_cm integer not null,

  -- التسعير بالهللة (قبل الضريبة) وحصة السطر من ضريبة الطلب
  price_per_meter_halalas bigint not null,
  discount_basis_points integer not null default 0,
  unit_price_halalas bigint not null,
  net_halalas bigint not null,
  vat_halalas bigint not null,
  gross_halalas bigint not null,

  created_at timestamptz not null default now(),

  constraint fabric_store_order_items_order_line_key unique (order_id, line_number),
  constraint fabric_store_order_items_line_number check (line_number between 1 and 40),
  constraint fabric_store_order_items_fabric_code
    check (fabric_code is null or char_length(fabric_code) <= 60),
  constraint fabric_store_order_items_fabric_name
    check (char_length(btrim(fabric_name)) between 1 and 200),
  constraint fabric_store_order_items_color_name
    check (color_name is null or char_length(color_name) <= 60),
  constraint fabric_store_order_items_image_url
    check (image_url is null or (char_length(image_url) <= 1000 and image_url ~ '^https://')),
  constraint fabric_store_order_items_purchase_mode check (purchase_mode in ('meter', 'piece')),
  -- القطعة الكاملة = كل المخزون المتبقي (3 أو 3.5م) وقطعة واحدة فقط؛ تستهلك طولها كاملاً.
  constraint fabric_store_order_items_quantity_shape
    check (
      (purchase_mode = 'piece'
        and piece_length_cm in (300, 350)
        and quantity_pieces = 1
        and quantity_cm is null
        and stock_consumption_cm = piece_length_cm)
      or
      (purchase_mode = 'meter'
        and piece_length_cm is null
        and quantity_pieces is null
        and quantity_cm between 1 and 10000
        and stock_consumption_cm = quantity_cm)
    ),
  -- حد الأمان = FABRIC_MAX_PRICE_PER_METER_HALALAS (مليون ريال للمتر).
  constraint fabric_store_order_items_price_range
    check (price_per_meter_halalas > 0 and price_per_meter_halalas <= 100000000),
  constraint fabric_store_order_items_discount_range
    check (discount_basis_points between 0 and 9999),
  -- نفس getFabricUnitPriceHalalas: بالمتر تقريب سعر المتر بعد الخصم، وبالقطعة
  -- تقريب واحد لسعر المتر بعد الخصم × طول القطعة.
  constraint fabric_store_order_items_unit_price_rule
    check (
      unit_price_halalas > 0
      and unit_price_halalas = case purchase_mode
        when 'piece' then
          (price_per_meter_halalas * (10000 - discount_basis_points) * piece_length_cm + 500000) / 1000000
        else
          (price_per_meter_halalas * (10000 - discount_basis_points) + 5000) / 10000
      end
    ),
  -- نفس computeFabricLineNetHalalas.
  constraint fabric_store_order_items_net_rule
    check (
      net_halalas = case purchase_mode
        when 'piece' then unit_price_halalas * quantity_pieces
        else (unit_price_halalas * quantity_cm + 50) / 100
      end
    ),
  constraint fabric_store_order_items_vat_non_negative check (vat_halalas >= 0),
  constraint fabric_store_order_items_gross_sum check (gross_halalas = net_halalas + vat_halalas)
);

comment on table public.fabric_store_order_items is
  'أسطر الطلب: لقطة للاسم والكود واللون ووحدة البيع والكمية والسعر والخصم. لا تُعدَّل بعد الإنشاء.';
comment on column public.fabric_store_order_items.stock_consumption_cm is
  'ما يُخصم من المخزون بالسنتيمتر: طول القطعة كاملاً، أو الكمية المطلوبة بالمتر.';
comment on column public.fabric_store_order_items.discount_basis_points is
  'نسبة الخصم المطبَّقة بأجزاء العشرة آلاف (25% = 2500).';
comment on column public.fabric_store_order_items.vat_halalas is
  'حصة السطر من ضريبة الطلب بالباقي الأكبر (computeFabricOrderBreakdown). gross = بند فاتورة الأستاذ.';

-- ---------------------------------------------------------------------------
-- 3) عنوان الشحن — وصول خاص ومدة احتفاظ محددة
-- ---------------------------------------------------------------------------

create table public.fabric_store_order_addresses (
  order_id uuid primary key references public.fabric_store_orders(id) on delete cascade,
  recipient_name text,
  recipient_phone text,
  city text,
  district text,
  street text,
  building_number text,
  postal_code text,
  additional_number text,
  short_address text,
  notes text,
  retain_until timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fabric_store_order_addresses_required
    check (
      anonymized_at is not null
      or (recipient_name is not null
          and recipient_phone is not null
          and city is not null
          and (short_address is not null or (district is not null and street is not null)))
    ),
  -- بعد انتهاء مدة الاحتفاظ تُمحى البيانات الشخصية ويبقى السطر (المدينة للإحصاء فقط).
  constraint fabric_store_order_addresses_anonymized_empty
    check (
      anonymized_at is null
      or (recipient_name is null and recipient_phone is null and district is null
          and street is null and building_number is null and postal_code is null
          and additional_number is null and short_address is null and notes is null)
    ),
  constraint fabric_store_order_addresses_recipient_name
    check (recipient_name is null or char_length(btrim(recipient_name)) between 2 and 120),
  constraint fabric_store_order_addresses_recipient_phone
    check (recipient_phone is null or recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint fabric_store_order_addresses_city
    check (city is null or char_length(btrim(city)) between 2 and 60),
  constraint fabric_store_order_addresses_district
    check (district is null or char_length(district) <= 80),
  constraint fabric_store_order_addresses_street
    check (street is null or char_length(street) <= 120),
  constraint fabric_store_order_addresses_building_number
    check (building_number is null or building_number ~ '^[0-9]{4}$'),
  constraint fabric_store_order_addresses_postal_code
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint fabric_store_order_addresses_additional_number
    check (additional_number is null or additional_number ~ '^[0-9]{4}$'),
  constraint fabric_store_order_addresses_short_address
    check (short_address is null or short_address ~ '^[A-Z]{4}[0-9]{4}$'),
  constraint fabric_store_order_addresses_notes
    check (notes is null or char_length(notes) <= 300)
);

create index fabric_store_order_addresses_retention_idx
  on public.fabric_store_order_addresses (retain_until)
  where anonymized_at is null and retain_until is not null;

comment on table public.fabric_store_order_addresses is
  'عنوان الشحن (طلبات الشحن فقط). لا يُحذف: يُمحى محتواه الشخصي بعد retain_until ويبقى السطر.';
comment on column public.fabric_store_order_addresses.short_address is
  'العنوان المختصر في العنوان الوطني (4 أحرف + 4 أرقام).';
comment on column public.fabric_store_order_addresses.retain_until is
  'نهاية مدة الاحتفاظ. تُحدَّد عند انتهاء الطلب (المرحلة 7) وفق سياسة الخصوصية المعتمدة.';

-- ---------------------------------------------------------------------------
-- 4) محاولات الدفع — طلب واحد ومحاولات متعددة
-- ---------------------------------------------------------------------------

create table public.fabric_store_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fabric_store_orders(id) on delete restrict,
  provider text not null,
  environment text not null,
  idempotency_key uuid not null,
  amount_halalas bigint not null,
  currency text not null default 'SAR',
  status text not null default 'created',
  provider_invoice_id text,
  provider_payment_id text,
  checkout_url text,
  expires_at timestamptz not null,
  last_provider_status text,
  last_verified_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fabric_store_payment_attempts_idempotency_key_key unique (idempotency_key),
  constraint fabric_store_payment_attempts_provider check (provider in ('moyasar')),
  constraint fabric_store_payment_attempts_environment check (environment in ('test', 'live')),
  constraint fabric_store_payment_attempts_amount check (amount_halalas > 0),
  constraint fabric_store_payment_attempts_currency check (currency = 'SAR'),
  constraint fabric_store_payment_attempts_status
    check (status in ('created', 'initiated', 'authorized', 'paid', 'failed', 'expired', 'cancelled')),
  constraint fabric_store_payment_attempts_provider_ids
    check ((provider_invoice_id is null or char_length(provider_invoice_id) between 1 and 100)
           and (provider_payment_id is null or char_length(provider_payment_id) between 1 and 100)),
  -- المحاولة المبدوءة لدى المزود لها مرجع عنده، والناجحة لها معرّف الدفعة نفسها.
  constraint fabric_store_payment_attempts_initiated_reference
    check (status not in ('initiated', 'authorized')
           or provider_invoice_id is not null or provider_payment_id is not null),
  constraint fabric_store_payment_attempts_paid_reference
    check (status <> 'paid' or provider_payment_id is not null),
  constraint fabric_store_payment_attempts_checkout_url
    check (checkout_url is null or (checkout_url ~ '^https://' and char_length(checkout_url) <= 1000)),
  constraint fabric_store_payment_attempts_expiry check (expires_at > created_at),
  constraint fabric_store_payment_attempts_texts
    check ((last_provider_status is null or char_length(last_provider_status) <= 40)
           and (failure_code is null or char_length(failure_code) <= 100)
           and (failure_message is null or char_length(failure_message) <= 500))
);

-- دفعة المزود تعتمد محاولة واحدة فقط، ولا تُنسب لطلب آخر.
create unique index fabric_store_payment_attempts_provider_invoice_key
  on public.fabric_store_payment_attempts (provider, environment, provider_invoice_id)
  where provider_invoice_id is not null;
create unique index fabric_store_payment_attempts_provider_payment_key
  on public.fabric_store_payment_attempts (provider, environment, provider_payment_id)
  where provider_payment_id is not null;
-- ضغط «ادفع» مرتين لا يفتح محاولتين: محاولة مفتوحة واحدة لكل طلب.
create unique index fabric_store_payment_attempts_one_open_per_order
  on public.fabric_store_payment_attempts (order_id)
  where status in ('created', 'initiated', 'authorized');
create index fabric_store_payment_attempts_order_idx
  on public.fabric_store_payment_attempts (order_id);
create index fabric_store_payment_attempts_open_expiry_idx
  on public.fabric_store_payment_attempts (expires_at)
  where status in ('created', 'initiated', 'authorized');

alter table public.fabric_store_orders
  add constraint fabric_store_orders_paid_attempt_id_fkey
    foreign key (paid_attempt_id) references public.fabric_store_payment_attempts(id) on delete restrict;
-- مرجع income يُضاف في آخر الهجرة (§ المراجع إلى الجداول العاملة).

comment on table public.fabric_store_payment_attempts is
  'محاولات الدفع. تُحفظ المحاولة (created) قبل الاتصال بالمزود، فانقطاع الرد لا يضيّع أثرها.';
comment on column public.fabric_store_payment_attempts.idempotency_key is
  'مفتاح عدم التكرار لإنشاء المحاولة (ومعرّف given_id لدى ميسر عند استخدام Payments API).';
comment on column public.fabric_store_payment_attempts.status is
  'created → initiated/authorized/paid/failed/expired/cancelled · initiated → authorized/paid/failed/expired/cancelled · authorized → paid/failed/expired/cancelled · failed/expired/cancelled → paid (نجاح متأخر). paid نهائية؛ الاسترداد في fabric_store_refunds.';

-- ---------------------------------------------------------------------------
-- 5) أحداث المزود — سجل فريد يُحفظ قبل أي معالجة
-- ---------------------------------------------------------------------------

create table public.fabric_store_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  environment text not null,
  source text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_invoice_id text,
  provider_payment_id text,
  attempt_id uuid references public.fabric_store_payment_attempts(id) on delete restrict,
  order_id uuid references public.fabric_store_orders(id) on delete restrict,
  payload jsonb not null,
  processing_status text not null default 'received',
  processing_attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,

  constraint fabric_store_payment_events_provider_event_key
    unique (provider, environment, provider_event_id),
  constraint fabric_store_payment_events_provider check (provider in ('moyasar')),
  constraint fabric_store_payment_events_environment check (environment in ('test', 'live')),
  constraint fabric_store_payment_events_source check (source in ('webhook', 'poll', 'return')),
  constraint fabric_store_payment_events_ids
    check (char_length(provider_event_id) between 1 and 200
           and char_length(event_type) between 1 and 60
           and (provider_invoice_id is null or char_length(provider_invoice_id) <= 100)
           and (provider_payment_id is null or char_length(provider_payment_id) <= 100)),
  constraint fabric_store_payment_events_payload
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768),
  constraint fabric_store_payment_events_processing_status
    check (processing_status in ('received', 'processing', 'processed', 'ignored', 'quarantined', 'failed')),
  constraint fabric_store_payment_events_processing_attempts check (processing_attempts >= 0),
  constraint fabric_store_payment_events_processed_at
    check ((processing_status in ('processed', 'ignored')) = (processed_at is not null)),
  constraint fabric_store_payment_events_last_error
    check (last_error is null or char_length(last_error) <= 1000)
);

create index fabric_store_payment_events_pending_idx
  on public.fabric_store_payment_events (received_at)
  where processing_status in ('received', 'processing', 'failed');
create index fabric_store_payment_events_attempt_idx
  on public.fabric_store_payment_events (attempt_id);
create index fabric_store_payment_events_order_idx
  on public.fabric_store_payment_events (order_id);

comment on table public.fabric_store_payment_events is
  'أحداث المزود (webhook) ونتائج الاستعلام منه. الحدث المكرر يصطدم بالمفتاح الفريد فيُعاد النجاح بلا أثر إضافي.';
comment on column public.fabric_store_payment_events.payload is
  'نسخة منقَّحة: بلا بيانات بطاقة ولا secret_token. لا تتغير بعد الحفظ.';
comment on column public.fabric_store_payment_events.processing_status is
  'quarantined = موثوق المصدر لكن المبلغ أو العملة أو البيئة أو الطلب لا يطابق — لا يُعتمد ويُراجع يدوياً.';

-- ---------------------------------------------------------------------------
-- 6) حجوزات المخزون
-- ---------------------------------------------------------------------------

create table public.fabric_store_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fabric_store_orders(id) on delete cascade,
  order_item_id uuid not null references public.fabric_store_order_items(id) on delete cascade,
  -- المراجع إلى المخزون تُضاف في آخر الهجرة (§ المراجع إلى الجداول العاملة).
  -- حذفها متتالٍ، ومع ذلك يمنع حارس المرحلة 3 حذف مخزون له حجز فعّال.
  inventory_item_id uuid not null,
  inventory_color_id uuid,
  quantity_cm integer not null,
  source text not null default 'online_checkout',
  status text not null default 'active',
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- حجز واحد لكل سطر طلب: نفس العملية لا تحجز مرتين.
  constraint fabric_store_stock_reservations_order_item_key unique (order_item_id),
  constraint fabric_store_stock_reservations_quantity check (quantity_cm between 1 and 10000),
  constraint fabric_store_stock_reservations_source check (source in ('online_checkout')),
  constraint fabric_store_stock_reservations_status
    check (status in ('active', 'consumed', 'released', 'expired')),
  constraint fabric_store_stock_reservations_ended
    check ((status = 'active') = (ended_at is null)),
  constraint fabric_store_stock_reservations_end_reason
    check (end_reason is null or char_length(end_reason) <= 200),
  constraint fabric_store_stock_reservations_expiry check (expires_at > created_at),
  -- نافذة الحجز محدودة على مستوى الصف لا في دالة الإنشاء وحدها: تحديث مباشر
  -- (خطأ في خادم الدفع مثلاً) لا يستطيع تجميد قماش المحل ساعات أو سنوات.
  constraint fabric_store_stock_reservations_window
    check (expires_at <= created_at + interval '2 hours')
);

-- المرحلة 3: المتاح = المخزون الفعلي − الحجوزات السارية (active ولم تنتهِ مدتها).
create index fabric_store_stock_reservations_active_color_idx
  on public.fabric_store_stock_reservations (inventory_color_id, expires_at)
  where status = 'active';
create index fabric_store_stock_reservations_active_item_idx
  on public.fabric_store_stock_reservations (inventory_item_id, expires_at)
  where status = 'active' and inventory_color_id is null;
create index fabric_store_stock_reservations_order_idx
  on public.fabric_store_stock_reservations (order_id);
create index fabric_store_stock_reservations_inventory_item_idx
  on public.fabric_store_stock_reservations (inventory_item_id);
create index fabric_store_stock_reservations_inventory_color_idx
  on public.fabric_store_stock_reservations (inventory_color_id);

comment on table public.fabric_store_stock_reservations is
  'حجوزات المخزون أثناء نافذة الدفع. الحجز يحسب ما دام active ولم تنتهِ مدته؛ لا يحتاج مهمة تنظيف ليتوقف.';
comment on column public.fabric_store_stock_reservations.status is
  'active → consumed/released/expired · expired/released → consumed (دفعة متأخرة وجد لها مخزون بعد تحقق ذري).';

-- ---------------------------------------------------------------------------
-- 7) الاستردادات — لا تتجاوز المتحصَّل بعد الاستردادات السابقة
-- ---------------------------------------------------------------------------

create table public.fabric_store_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.fabric_store_orders(id) on delete restrict,
  attempt_id uuid not null references public.fabric_store_payment_attempts(id) on delete restrict,
  idempotency_key uuid not null,
  amount_halalas bigint not null,
  currency text not null default 'SAR',
  reason text not null,
  status text not null default 'pending',
  provider_refund_id text,
  failure_message text,
  -- بلا FK عمداً: حذف حساب موظف لا يُمنع ولا يمحو أثر من نفّذ الاسترداد.
  requested_by uuid not null,
  requested_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint fabric_store_refunds_idempotency_key_key unique (idempotency_key),
  constraint fabric_store_refunds_amount check (amount_halalas > 0),
  constraint fabric_store_refunds_currency check (currency = 'SAR'),
  constraint fabric_store_refunds_reason check (char_length(btrim(reason)) between 3 and 500),
  constraint fabric_store_refunds_status check (status in ('pending', 'succeeded', 'failed')),
  constraint fabric_store_refunds_completed_at
    check ((status = 'pending') = (completed_at is null)),
  constraint fabric_store_refunds_texts
    check ((provider_refund_id is null or char_length(provider_refund_id) between 1 and 100)
           and (failure_message is null or char_length(failure_message) <= 500)
           and (requested_by_label is null or char_length(requested_by_label) <= 200))
);

create unique index fabric_store_refunds_provider_refund_key
  on public.fabric_store_refunds (provider_refund_id)
  where provider_refund_id is not null;
create index fabric_store_refunds_order_idx on public.fabric_store_refunds (order_id);
create index fabric_store_refunds_attempt_idx on public.fabric_store_refunds (attempt_id);

comment on table public.fabric_store_refunds is
  'استرداد المال (كامل أو جزئي) — للمدير فقط (يُفرض في الخادم). pending حتى يؤكده المزود. رد المال لا يعيد القماش للمخزون.';

-- ---------------------------------------------------------------------------
-- 8) صندوق المهام الموثوقة (outbox)
-- ---------------------------------------------------------------------------

create table public.fabric_store_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  dedupe_key text not null,
  order_id uuid references public.fabric_store_orders(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 10,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  -- مفتاح فريد يمنع تكرار الأثر: فاتورة واحدة، إشعار واحد لكل حدث.
  constraint fabric_store_outbox_dedupe_key_key unique (dedupe_key),
  constraint fabric_store_outbox_topic
    check (topic in ('confirm_order', 'alostaz_invoice', 'notify_customer', 'notify_staff', 'verify_attempt', 'refund_sync')),
  constraint fabric_store_outbox_dedupe_key_size check (char_length(dedupe_key) between 3 and 200),
  constraint fabric_store_outbox_payload
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  constraint fabric_store_outbox_status
    check (status in ('pending', 'processing', 'done', 'failed', 'dead')),
  constraint fabric_store_outbox_attempts
    check (attempts >= 0 and max_attempts between 1 and 100 and attempts <= max_attempts),
  constraint fabric_store_outbox_processing_lock
    check (status <> 'processing' or locked_until is not null),
  constraint fabric_store_outbox_completed_at
    check ((status in ('done', 'dead')) = (completed_at is not null)),
  constraint fabric_store_outbox_last_error
    check (last_error is null or char_length(last_error) <= 2000)
);

create index fabric_store_outbox_due_idx
  on public.fabric_store_outbox (run_after)
  where status in ('pending', 'failed');
create index fabric_store_outbox_order_idx on public.fabric_store_outbox (order_id);

comment on table public.fabric_store_outbox is
  'مهام تُنفَّذ بعد الاعتماد (فاتورة الأستاذ، الإشعارات...) مع إعادة محاولة. تُعالَج بمسار مجدول لا بمهمة تنتهي مع الطلب.';

-- ---------------------------------------------------------------------------
-- 9) سجل تدقيق الطلب — إضافة فقط
-- ---------------------------------------------------------------------------

create table public.fabric_store_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.fabric_store_orders(id) on delete cascade,
  event_type text not null,
  from_value text,
  to_value text,
  actor_type text not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default clock_timestamp(),

  constraint fabric_store_order_events_event_type
    check (event_type in ('order_created', 'payment_status', 'fulfillment_status', 'review_flag', 'note')),
  constraint fabric_store_order_events_actor_type
    check (actor_type in ('customer', 'staff', 'provider', 'system')),
  constraint fabric_store_order_events_values
    check ((from_value is null or char_length(from_value) <= 40)
           and (to_value is null or char_length(to_value) <= 40)),
  constraint fabric_store_order_events_note check (note is null or char_length(note) <= 500)
);

create index fabric_store_order_events_order_idx
  on public.fabric_store_order_events (order_id, id);

comment on table public.fabric_store_order_events is
  'سجل تدقيق يكتبه trigger تلقائياً عند كل تغيير حالة، مع نوع المنفّذ ومعرّفه. لا يُعدَّل ولا يُحذف مباشرة.';

-- ============================================================================
-- الدوال والـtriggers
-- ============================================================================
-- كلها security invoker بـsearch_path فارغ، ولا تستدعي دوال أخرى في private:
-- service_role لا يملك USAGE على مخطط private، فأي استدعاء متداخل سيفشل حين
-- يكتب الخادم مباشرة. (الـtrigger نفسه يعمل؛ الاستدعاء المتداخل هو ما يُفحص.)
--
-- نوع المنفّذ يُعلَن لكل معاملة تغيّر حالة:
--   select set_config('fabric_store.actor_type', 'provider', true);  -- customer | staff | provider | system
--   select set_config('fabric_store.actor_id', '<uuid>', true);       -- اختياري
-- تغيير حالة بلا إعلان يُرفض، فلا يرث مسار منسيّ صلاحيات «النظام».

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- حارس الطلب: الحالة الأولى، الحقول الثابتة، الانتقالات ومن يملكها
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor text := nullif(current_setting('fabric_store.actor_type', true), '');
  v_attempt_order uuid;
  v_attempt_status text;
  v_reservation record;
  v_reservation_count integer;
  v_item_count integer;
  v_checked_at timestamptz;
  v_bad_reservation boolean;
begin
  if tg_op = 'INSERT' then
    if new.payment_status <> 'pending'
       or new.fulfillment_status <> 'unfulfilled'
       or new.paid_attempt_id is not null
       or new.paid_at is not null
       or new.income_id is not null
       or new.delivered_at is not null
       or new.cancelled_at is not null then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ORDER_INITIAL_STATE|الطلب الجديد يبدأ غير مدفوع وغير منفَّذ';
    end if;
    return new;
  end if;

  -- ما وافقت عليه العميلة ودفعت عنه لا يتغير بعد الإنشاء.
  if new.id is distinct from old.id
     or new.order_number is distinct from old.order_number
     or new.checkout_key is distinct from old.checkout_key
     or new.request_fingerprint is distinct from old.request_fingerprint
     or new.delivery_method is distinct from old.delivery_method
     or new.delivery_option_code is distinct from old.delivery_option_code
     or new.currency is distinct from old.currency
     or new.vat_basis_points is distinct from old.vat_basis_points
     or new.items_net_halalas is distinct from old.items_net_halalas
     or new.shipping_net_halalas is distinct from old.shipping_net_halalas
     or new.shipping_vat_halalas is distinct from old.shipping_vat_halalas
     or new.vat_halalas is distinct from old.vat_halalas
     or new.total_halalas is distinct from old.total_halalas
     or new.payment_due_at is distinct from old.payment_due_at
     or new.terms_version is distinct from old.terms_version
     or new.returns_policy_version is distinct from old.returns_policy_version
     or new.privacy_policy_version is distinct from old.privacy_policy_version
     or new.policies_accepted_at is distinct from old.policies_accepted_at
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_ORDER_IMMUTABLE|مبالغ الطلب وطريقة استلامه وسياساته لا تتغير بعد إنشائه';
  end if;

  -- أي تغيير حالة يجب أن يعلن منفّذه.
  if (new.payment_status is distinct from old.payment_status
      or new.fulfillment_status is distinct from old.fulfillment_status
      or new.needs_review is distinct from old.needs_review)
     and (v_actor is null or v_actor not in ('customer', 'staff', 'provider', 'system')) then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_ACTOR_REQUIRED|تغيير حالة الطلب يتطلب إعلان المنفّذ (fabric_store.actor_type)';
  end if;

  -- حالة الدفع: من المزود أو النظام فقط، وبالانتقالات المسموحة فقط.
  if new.payment_status is distinct from old.payment_status then
    if v_actor not in ('provider', 'system') then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_PAYMENT_ACTOR|حالة الدفع لا يغيّرها إلا تحقق المزود أو النظام';
    end if;
    if not (
      (old.payment_status = 'pending' and new.payment_status in ('authorized', 'paid', 'failed'))
      or (old.payment_status = 'authorized' and new.payment_status in ('paid', 'failed'))
      or (old.payment_status = 'failed' and new.payment_status = 'paid')
      or (old.payment_status = 'paid' and new.payment_status in ('partially_refunded', 'refunded'))
      or (old.payment_status = 'partially_refunded' and new.payment_status = 'refunded')
    ) then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_PAYMENT_TRANSITION|انتقال غير مسموح لحالة الدفع: %s ← %s',
                         old.payment_status, new.payment_status);
    end if;
    if new.payment_status = 'paid' and new.paid_at is null then
      new.paid_at := now();
    end if;

    -- الدفعة تُسجَّل حتى لو ضاع الحجز، لكن الطلب لا يُجهَّز تلقائياً. اقفل كل
    -- الحجوزات أولاً، ثم افحص وجود حجز لكل سطر ووقت الانتهاء الفعلي بعد الانتظار.
    -- now() ثابت عند بداية المعاملة وقد يسبق انتهاء الحجز أثناء انتظار القفل.
    if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      v_reservation_count := 0;
      for v_reservation in
        select r.id
        from public.fabric_store_stock_reservations r
        where r.order_id = new.id
        for update
      loop
        v_reservation_count := v_reservation_count + 1;
      end loop;
      v_checked_at := clock_timestamp();
      select count(*) into v_item_count
      from public.fabric_store_order_items item where item.order_id = new.id;
      select exists (
        select 1 from public.fabric_store_stock_reservations r
        where r.order_id = new.id
          and (r.status in ('released', 'expired')
               or (r.status = 'active' and r.expires_at <= v_checked_at))
      ) into v_bad_reservation;
      if v_reservation_count <> v_item_count or v_bad_reservation then
        new.needs_review := true;
        new.review_reason := coalesce(nullif(btrim(coalesce(new.review_reason, '')), ''),
          'وصل السداد دون حجز سارٍ لكل أسطر الطلب أو بعد انتهاء حجز: تأكدي من توفر القماش قبل التجهيز، وإلا استرجعي المبلغ');
      end if;
    end if;
  end if;

  if old.paid_at is not null and new.paid_at is distinct from old.paid_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_PAID_AT_IMMUTABLE|وقت السداد لا يتغير بعد تسجيله';
  end if;

  -- محاولة السداد تُثبَّت مرة واحدة، ويجب أن تكون ناجحة وتخص هذا الطلب.
  if new.paid_attempt_id is distinct from old.paid_attempt_id then
    if old.paid_attempt_id is not null then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_PAID_ATTEMPT_IMMUTABLE|محاولة السداد المعتمدة لا تتغير';
    end if;
    select attempt.order_id, attempt.status
    into v_attempt_order, v_attempt_status
    from public.fabric_store_payment_attempts attempt
    where attempt.id = new.paid_attempt_id;
    if v_attempt_order is distinct from new.id or v_attempt_status is distinct from 'paid' then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_PAID_ATTEMPT_INVALID|محاولة السداد يجب أن تكون ناجحة وتخص هذا الطلب';
    end if;
  end if;

  -- علامة المراجعة يضعها النظام أو تحقق المزود، ويرفعها الموظف بعد الحسم.
  if new.needs_review is distinct from old.needs_review and v_actor = 'customer' then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_REVIEW_ACTOR|علامة المراجعة يغيّرها الموظف أو النظام أو المزود فقط';
  end if;

  if old.income_id is not null and new.income_id is distinct from old.income_id then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_INCOME_IMMUTABLE|مبيعة الطلب في الواردات لا تتغير بعد ربطها';
  end if;

  -- حالة التنفيذ: من الموظف أو النظام فقط.
  if new.fulfillment_status is distinct from old.fulfillment_status then
    if v_actor not in ('staff', 'system') then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_FULFILLMENT_ACTOR|حالة التنفيذ يغيّرها الموظف أو النظام فقط';
    end if;
    if not (
      (old.fulfillment_status = 'unfulfilled' and new.fulfillment_status in ('preparing', 'cancelled'))
      or (old.fulfillment_status = 'preparing'
          and new.fulfillment_status in ('unfulfilled', 'ready_for_pickup', 'shipped', 'cancelled'))
      or (old.fulfillment_status = 'ready_for_pickup' and new.fulfillment_status in ('delivered', 'cancelled'))
      or (old.fulfillment_status = 'shipped' and new.fulfillment_status = 'delivered')
    ) then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_FULFILLMENT_TRANSITION|انتقال غير مسموح لحالة التنفيذ: %s ← %s',
                         old.fulfillment_status, new.fulfillment_status);
    end if;
    -- الشرط يُعاد فحصه عند **كل** تقدّم في التنفيذ، لا عند أول انتقال فقط: طلب بدأ
    -- تجهيزه ثم رُفعت عليه علامة مراجعة أو استُرد كامل مبلغه يجب أن يتوقف مكانه.
    -- (التراجع إلى unfulfilled والإلغاء يبقيان متاحين لحسم الحالة.)
    if new.fulfillment_status in ('preparing', 'ready_for_pickup', 'shipped', 'delivered') then
      if new.payment_status not in ('paid', 'partially_refunded') then
        raise exception using
          errcode = 'P0001', message = 'FABRIC_STORE_FULFILLMENT_UNPAID|لا يُجهَّز ولا يُسلَّم طلب لم يُسدَّد أو رُدّ مبلغه كاملاً';
      end if;
      if new.needs_review then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STORE_FULFILLMENT_UNDER_REVIEW|الطلب تحت المراجعة ولا يتقدّم تنفيذه حتى تُحسم';
      end if;
    end if;
    if new.fulfillment_status = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
    if new.fulfillment_status = 'cancelled' and new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  end if;

  if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_DELIVERED_AT_IMMUTABLE|وقت التسليم لا يتغير بعد تسجيله';
  end if;
  if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_CANCELLED_AT_IMMUTABLE|وقت الإلغاء لا يتغير بعد تسجيله';
  end if;

  return new;
end;
$$;

create trigger fabric_store_orders_guard
  before insert or update on public.fabric_store_orders
  for each row execute function private.fabric_store_guard_order();

create trigger fabric_store_orders_touch_updated_at
  before update on public.fabric_store_orders
  for each row execute function private.fabric_store_touch_updated_at();

-- ---------------------------------------------------------------------------
-- سجل التدقيق: يكتبه trigger، فلا يمكن نسيانه
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_log_order_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor text := nullif(current_setting('fabric_store.actor_type', true), '');
  v_actor_id_text text := nullif(current_setting('fabric_store.actor_id', true), '');
  v_actor_id uuid;
begin
  if v_actor is null or v_actor not in ('customer', 'staff', 'provider', 'system') then
    v_actor := 'system';
  end if;
  if v_actor_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_actor_id := v_actor_id_text::uuid;
  end if;

  if tg_op = 'INSERT' then
    insert into public.fabric_store_order_events (order_id, event_type, to_value, actor_type, actor_id)
    values (new.id, 'order_created', new.payment_status, v_actor, v_actor_id);
    return null;
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into public.fabric_store_order_events (order_id, event_type, from_value, to_value, actor_type, actor_id)
    values (new.id, 'payment_status', old.payment_status, new.payment_status, v_actor, v_actor_id);
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status then
    insert into public.fabric_store_order_events
      (order_id, event_type, from_value, to_value, actor_type, actor_id, note)
    values (new.id, 'fulfillment_status', old.fulfillment_status, new.fulfillment_status, v_actor, v_actor_id,
            case when new.fulfillment_status = 'cancelled' then left(new.cancel_reason, 500) end);
  end if;
  if new.needs_review is distinct from old.needs_review then
    insert into public.fabric_store_order_events
      (order_id, event_type, from_value, to_value, actor_type, actor_id, note)
    values (new.id, 'review_flag', old.needs_review::text, new.needs_review::text, v_actor, v_actor_id,
            left(new.review_reason, 500));
  end if;
  return null;
end;
$$;

create trigger fabric_store_orders_log_event
  after insert or update on public.fabric_store_orders
  for each row execute function private.fabric_store_log_order_event();

-- ---------------------------------------------------------------------------
-- اتساق الطلب مع أسطره وعنوانه (يُفحص عند نهاية المعاملة)
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_check_order_consistency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order public.fabric_store_orders%rowtype;
  v_items_net bigint;
  v_items_vat bigint;
  v_line_count integer;
  v_has_address boolean;
begin
  if tg_table_name = 'fabric_store_orders' then
    v_order_id := new.id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select * into v_order from public.fabric_store_orders where id = v_order_id;
  if not found then
    -- الطلب حُذف في نفس المعاملة (بلا محاولات دفع) فحُذفت أجزاؤه معه.
    return null;
  end if;

  select coalesce(sum(item.net_halalas), 0), coalesce(sum(item.vat_halalas), 0), count(*)
  into v_items_net, v_items_vat, v_line_count
  from public.fabric_store_order_items item
  where item.order_id = v_order_id;

  if v_line_count = 0 then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ORDER_EMPTY|الطلب يجب أن يحتوي سطراً واحداً على الأقل';
  end if;
  if v_items_net <> v_order.items_net_halalas then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ORDER_ITEMS_TOTAL|مجموع الأسطر (%s) لا يساوي مجموع الطلب (%s)',
                       v_items_net, v_order.items_net_halalas);
  end if;
  if v_items_vat + v_order.shipping_vat_halalas <> v_order.vat_halalas then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ORDER_VAT_SPLIT|حصص الضريبة (%s) لا تساوي ضريبة الطلب (%s)',
                       v_items_vat + v_order.shipping_vat_halalas, v_order.vat_halalas);
  end if;

  select exists (
    select 1 from public.fabric_store_order_addresses address where address.order_id = v_order_id
  ) into v_has_address;
  if v_order.delivery_method = 'shipping' and not v_has_address then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ORDER_ADDRESS_REQUIRED|طلب الشحن يحتاج عنواناً';
  end if;
  if v_order.delivery_method = 'pickup' and v_has_address then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_ORDER_ADDRESS_UNEXPECTED|طلب الاستلام من المحل لا يخزَّن له عنوان';
  end if;

  return null;
end;
$$;

create constraint trigger fabric_store_orders_consistency
  after insert on public.fabric_store_orders
  deferrable initially deferred
  for each row execute function private.fabric_store_check_order_consistency();

create constraint trigger fabric_store_order_items_consistency
  after insert or delete on public.fabric_store_order_items
  deferrable initially deferred
  for each row execute function private.fabric_store_check_order_consistency();

create constraint trigger fabric_store_order_addresses_consistency
  after insert or delete on public.fabric_store_order_addresses
  deferrable initially deferred
  for each row execute function private.fabric_store_check_order_consistency();

-- ---------------------------------------------------------------------------
-- أسطر الطلب وسجل التدقيق لا يُعدَّلان
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_forbid_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = format('FABRIC_STORE_APPEND_ONLY|%s سجل ثابت لا يُعدَّل بعد إنشائه', tg_table_name);
end;
$$;

create trigger fabric_store_order_items_forbid_update
  before update on public.fabric_store_order_items
  for each row execute function private.fabric_store_forbid_update();

create trigger fabric_store_order_events_forbid_update
  before update on public.fabric_store_order_events
  for each row execute function private.fabric_store_forbid_update();

-- ---------------------------------------------------------------------------
-- حارس العنوان: لطلبات الشحن فقط، يُصحَّح قبل الشحن، ويُمحى بعد الانتهاء فقط
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_address()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery_method text;
  v_payment_status text;
  v_fulfillment_status text;
begin
  select o.delivery_method, o.payment_status, o.fulfillment_status
  into v_delivery_method, v_payment_status, v_fulfillment_status
  from public.fabric_store_orders o
  where o.id = new.order_id;

  if tg_op = 'INSERT' then
    if v_delivery_method is distinct from 'shipping' then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ORDER_ADDRESS_UNEXPECTED|طلب الاستلام من المحل لا يخزَّن له عنوان';
    end if;
    if new.anonymized_at is not null then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_INVALID|العنوان الجديد لا يكون ممحوّاً';
    end if;
    return new;
  end if;

  if new.order_id is distinct from old.order_id or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_IMMUTABLE|العنوان مرتبط بطلبه ولا ينتقل';
  end if;
  if old.anonymized_at is not null then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_ANONYMIZED|العنوان مُحي ولا يُعدَّل';
  end if;

  if new.anonymized_at is not null then
    -- المحو بعد انتهاء الطلب فقط: سُلِّم أو أُلغي، أو لم يُسدَّد أصلاً.
    if not (v_fulfillment_status in ('delivered', 'cancelled') or v_payment_status = 'failed') then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ADDRESS_IN_USE|لا يُمحى عنوان طلب لم ينتهِ بعد';
    end if;
    return new;
  end if;

  -- تصحيح العنوان مسموح قبل الشحن فقط؛ بعده هو ما استُخدم فعلاً.
  if (new.recipient_name, new.recipient_phone, new.city, new.district, new.street,
      new.building_number, new.postal_code, new.additional_number, new.short_address, new.notes)
     is distinct from
     (old.recipient_name, old.recipient_phone, old.city, old.district, old.street,
      old.building_number, old.postal_code, old.additional_number, old.short_address, old.notes)
     and v_fulfillment_status not in ('unfulfilled', 'preparing') then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_LOCKED|لا يُعدَّل العنوان بعد شحن الطلب أو إنهائه';
  end if;

  return new;
end;
$$;

create trigger fabric_store_order_addresses_guard
  before insert or update on public.fabric_store_order_addresses
  for each row execute function private.fabric_store_guard_address();

create trigger fabric_store_order_addresses_touch_updated_at
  before update on public.fabric_store_order_addresses
  for each row execute function private.fabric_store_touch_updated_at();

-- ---------------------------------------------------------------------------
-- حارس محاولة الدفع: مبلغها = إجمالي الطلب، وطلب قابل للدفع، وانتقالات محددة
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_payment_attempt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total bigint;
  v_payment_status text;
  v_fulfillment_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'created' then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ATTEMPT_INITIAL_STATE|محاولة الدفع تُحفظ created قبل الاتصال بالمزود';
    end if;

    -- قفل الطلب يسلسل محاولتين متزامنتين لنفس الطلب.
    select o.total_halalas, o.payment_status, o.fulfillment_status
    into v_total, v_payment_status, v_fulfillment_status
    from public.fabric_store_orders o
    where o.id = new.order_id
    for update;

    if v_payment_status is distinct from 'pending' or v_fulfillment_status is distinct from 'unfulfilled' then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_ATTEMPT_ORDER_NOT_PAYABLE|الطلب لم يعد قابلاً للدفع';
    end if;
    if new.amount_halalas is distinct from v_total then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_ATTEMPT_AMOUNT|مبلغ المحاولة (%s) يجب أن يساوي إجمالي الطلب (%s)',
                         new.amount_halalas, v_total);
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.provider is distinct from old.provider
     or new.environment is distinct from old.environment
     or new.idempotency_key is distinct from old.idempotency_key
     or new.amount_halalas is distinct from old.amount_halalas
     or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at
     or (old.provider_invoice_id is not null and new.provider_invoice_id is distinct from old.provider_invoice_id)
     or (old.provider_payment_id is not null and new.provider_payment_id is distinct from old.provider_payment_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_ATTEMPT_IMMUTABLE|بيانات المحاولة ومراجعها لدى المزود لا تتغير بعد تثبيتها';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'created'
      and new.status in ('initiated', 'authorized', 'paid', 'failed', 'expired', 'cancelled'))
    or (old.status = 'initiated'
      and new.status in ('authorized', 'paid', 'failed', 'expired', 'cancelled'))
    or (old.status = 'authorized' and new.status in ('paid', 'failed', 'expired', 'cancelled'))
    or (old.status in ('failed', 'expired', 'cancelled') and new.status = 'paid')
  ) then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ATTEMPT_TRANSITION|انتقال غير مسموح لمحاولة الدفع: %s ← %s',
                       old.status, new.status);
  end if;

  return new;
end;
$$;

create trigger fabric_store_payment_attempts_guard
  before insert or update on public.fabric_store_payment_attempts
  for each row execute function private.fabric_store_guard_payment_attempt();

create trigger fabric_store_payment_attempts_touch_updated_at
  before update on public.fabric_store_payment_attempts
  for each row execute function private.fabric_store_touch_updated_at();

-- ---------------------------------------------------------------------------
-- حارس أحداث المزود: الهوية والمحتوى ثابتان بعد الحفظ
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_payment_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.provider is distinct from old.provider
     or new.environment is distinct from old.environment
     or new.source is distinct from old.source
     or new.provider_event_id is distinct from old.provider_event_id
     or new.event_type is distinct from old.event_type
     or new.payload is distinct from old.payload
     or new.received_at is distinct from old.received_at
     or new.provider_invoice_id is distinct from old.provider_invoice_id
     or new.provider_payment_id is distinct from old.provider_payment_id
     or (old.attempt_id is not null and new.attempt_id is distinct from old.attempt_id)
     or (old.order_id is not null and new.order_id is distinct from old.order_id) then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_EVENT_IMMUTABLE|حدث المزود يُحفظ كما وصل؛ تتغير حالة معالجته فقط';
  end if;
  if new.processing_status in ('processed', 'ignored') and new.processed_at is null then
    new.processed_at := now();
  end if;
  return new;
end;
$$;

create trigger fabric_store_payment_events_guard
  before update on public.fabric_store_payment_events
  for each row execute function private.fabric_store_guard_payment_event();

-- ---------------------------------------------------------------------------
-- حارس الحجز: مطابق لسطره، وانتقالات محددة
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_reservation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_order uuid;
  v_item_inventory uuid;
  v_item_color uuid;
  v_item_consumption integer;
  v_order_payment text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active' or new.ended_at is not null then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_RESERVATION_INITIAL_STATE|الحجز يبدأ active';
    end if;
    select item.order_id, item.inventory_item_id, item.inventory_color_id, item.stock_consumption_cm
    into v_item_order, v_item_inventory, v_item_color, v_item_consumption
    from public.fabric_store_order_items item
    where item.id = new.order_item_id;
    if v_item_order is distinct from new.order_id
       or v_item_inventory is distinct from new.inventory_item_id
       or v_item_color is distinct from new.inventory_color_id
       or v_item_consumption is distinct from new.quantity_cm then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_RESERVATION_MISMATCH|الحجز يجب أن يطابق سطر الطلب: الطلب والصنف واللون والكمية';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.order_item_id is distinct from old.order_item_id
     or new.inventory_item_id is distinct from old.inventory_item_id
     or new.inventory_color_id is distinct from old.inventory_color_id
     or new.quantity_cm is distinct from old.quantity_cm
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_RESERVATION_IMMUTABLE|الحجز لا يغيّر سطره أو كميته';
  end if;

  -- الحجز لا يُمدَّد إطلاقاً: مدته تُثبَّت لحظة إنشائه (ومعها قيد النافذة على الصف).
  -- تمديد نافذة الدفع يكون بحجز جديد بعد تحرير القديم، لا بإطالة حجز قائم.
  if new.expires_at is distinct from old.expires_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_RESERVATION_NO_EXTENSION|مدة الحجز لا تُمدَّد بعد إنشائه';
  end if;

  -- حجز طلب مدفوع يُستهلك بالبيع ولا يُحرَّر: تحريره يعيد القماش للمحل بينما الطلب
  -- مدفوع. يُفرض هنا أيضاً لا في دالة التحرير وحدها، فلا يتجاوزه تحديث مباشر.
  -- تحديث الصف يملك قفل الحجز بالفعل؛ لا يقفل الطلب هنا، لأن الدفع يأخذ
  -- قفل الطلب ثم الحجز. إن سبق التحريرُ الدفعَ، يوسم الدفع الطلب للمراجعة.
  -- وإن سبق الدفعُ التحريرَ، ينتظر التحديث ثم يقرأ حالة الدفع الجديدة ويرفض.
  if new.status = 'released' and old.status = 'active' then
    select o.payment_status into v_order_payment
    from public.fabric_store_orders o
    where o.id = new.order_id;
    if v_order_payment in ('paid', 'partially_refunded', 'refunded') then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_RESERVATION_PAID_ORDER|لا يُحرَّر حجز طلب مدفوع؛ يُستهلك بالبيع أو يُراجع';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'active' and new.status in ('consumed', 'released', 'expired'))
      or (old.status in ('released', 'expired') and new.status = 'consumed')
    ) then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_RESERVATION_TRANSITION|انتقال غير مسموح للحجز: %s ← %s',
                         old.status, new.status);
    end if;
    new.ended_at := now();
  elsif new.status <> 'active' then
    if new.expires_at is distinct from old.expires_at or new.ended_at is distinct from old.ended_at then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_RESERVATION_ENDED|الحجز المنتهي لا يُمدَّد';
    end if;
  end if;

  return new;
end;
$$;

create trigger fabric_store_stock_reservations_guard
  before insert or update on public.fabric_store_stock_reservations
  for each row execute function private.fabric_store_guard_reservation();

create trigger fabric_store_stock_reservations_touch_updated_at
  before update on public.fabric_store_stock_reservations
  for each row execute function private.fabric_store_touch_updated_at();

-- ---------------------------------------------------------------------------
-- حارس الاسترداد: لا يتجاوز المتحصَّل، ومحاولة ناجحة لنفس الطلب
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_guard_refund()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt_order uuid;
  v_attempt_status text;
  v_attempt_amount bigint;
  v_already bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.completed_at is not null then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_REFUND_INITIAL_STATE|الاسترداد يبدأ pending حتى يؤكده المزود';
    end if;

    -- قفل المحاولة يسلسل استردادين متزامنين عليها.
    select attempt.order_id, attempt.status, attempt.amount_halalas
    into v_attempt_order, v_attempt_status, v_attempt_amount
    from public.fabric_store_payment_attempts attempt
    where attempt.id = new.attempt_id
    for update;

    if v_attempt_order is distinct from new.order_id or v_attempt_status is distinct from 'paid' then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_REFUND_ATTEMPT|الاسترداد يكون من دفعة ناجحة تخص نفس الطلب';
    end if;

    select coalesce(sum(refund.amount_halalas), 0)
    into v_already
    from public.fabric_store_refunds refund
    where refund.attempt_id = new.attempt_id
      and refund.status in ('pending', 'succeeded');

    if v_already + new.amount_halalas > v_attempt_amount then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_REFUND_EXCEEDS|المسترد (%s) يتجاوز المتحصَّل (%s) بعد الاستردادات السابقة (%s)',
                         new.amount_halalas, v_attempt_amount, v_already);
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.attempt_id is distinct from old.attempt_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.amount_halalas is distinct from old.amount_halalas
     or new.currency is distinct from old.currency
     or new.reason is distinct from old.reason
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at
     or (old.provider_refund_id is not null and new.provider_refund_id is distinct from old.provider_refund_id) then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_REFUND_IMMUTABLE|بيانات الاسترداد لا تتغير بعد تسجيله';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'pending' and new.status in ('succeeded', 'failed')) then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_REFUND_TRANSITION|انتقال غير مسموح للاسترداد: %s ← %s',
                         old.status, new.status);
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.completed_at is distinct from old.completed_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_REFUND_IMMUTABLE|بيانات الاسترداد لا تتغير بعد تسجيله';
  end if;

  return new;
end;
$$;

create trigger fabric_store_refunds_guard
  before insert or update on public.fabric_store_refunds
  for each row execute function private.fabric_store_guard_refund();

create trigger fabric_store_refunds_touch_updated_at
  before update on public.fabric_store_refunds
  for each row execute function private.fabric_store_touch_updated_at();

create trigger fabric_store_outbox_touch_updated_at
  before update on public.fabric_store_outbox
  for each row execute function private.fabric_store_touch_updated_at();

-- ============================================================================
-- الصلاحيات: لا وصول من المتصفح إطلاقاً؛ الخادم وحده بمفتاح service_role
-- ============================================================================

alter table public.fabric_store_orders enable row level security;
alter table public.fabric_store_order_items enable row level security;
alter table public.fabric_store_order_addresses enable row level security;
alter table public.fabric_store_payment_attempts enable row level security;
alter table public.fabric_store_payment_events enable row level security;
alter table public.fabric_store_stock_reservations enable row level security;
alter table public.fabric_store_refunds enable row level security;
alter table public.fabric_store_outbox enable row level security;
alter table public.fabric_store_order_events enable row level security;

-- السحب يشمل service_role ثم يُمنح له ما يحتاجه فقط؛ الافتراضي منحه كل شيء.
revoke all on table public.fabric_store_orders from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_order_items from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_order_addresses from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_payment_attempts from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_payment_events from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_stock_reservations from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_refunds from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_outbox from public, anon, authenticated, service_role;
revoke all on table public.fabric_store_order_events from public, anon, authenticated, service_role;
revoke all on sequence public.fabric_store_order_number_seq from public, anon, authenticated, service_role;

-- تسلسل هوية سجل التدقيق يُنشأ ضمنياً مع الجدول، فتنطبق عليه الصلاحيات الافتراضية
-- في public (كل شيء لـanon وauthenticated). بدون السحب يستطيع من يصل بدور زائر إلى
-- SQL أن ينفّذ setval فوق الحد الأعلى، فيفشل كل إنشاء طلب لأن trigger التدقيق لا يجد
-- رقماً. أعمدة identity لا تحتاج صلاحية تسلسل للإدراج، فالسحب الكامل آمن (مُختبَر).
do $$
declare
  v_sequence text := pg_get_serial_sequence('public.fabric_store_order_events', 'id');
begin
  if v_sequence is null then
    raise exception 'FABRIC_STORE_AUDIT_SEQUENCE: identity sequence of fabric_store_order_events not found';
  end if;
  execute format('revoke all on sequence %s from public, anon, authenticated, service_role', v_sequence);
end $$;

grant select, insert, update, delete on table public.fabric_store_orders to service_role;
-- أسطر الطلب وسجل التدقيق: إضافة وقراءة فقط. الحذف يحدث بالتتابع من الطلب وحده.
grant select, insert on table public.fabric_store_order_items to service_role;
grant select, insert on table public.fabric_store_order_events to service_role;
-- العنوان لا يُحذف مباشرة: يُمحى محتواه بتحديث.
grant select, insert, update on table public.fabric_store_order_addresses to service_role;
grant select, insert, update on table public.fabric_store_payment_attempts to service_role;
grant select, insert, update on table public.fabric_store_payment_events to service_role;
grant select, insert, update on table public.fabric_store_stock_reservations to service_role;
grant select, insert, update on table public.fabric_store_refunds to service_role;
grant select, insert, update, delete on table public.fabric_store_outbox to service_role;
grant usage, select on sequence public.fabric_store_order_number_seq to service_role;

revoke all on function private.fabric_store_touch_updated_at() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_order() from public, anon, authenticated;
revoke all on function private.fabric_store_log_order_event() from public, anon, authenticated;
revoke all on function private.fabric_store_check_order_consistency() from public, anon, authenticated;
revoke all on function private.fabric_store_forbid_update() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_address() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_payment_attempt() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_payment_event() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_reservation() from public, anon, authenticated;
revoke all on function private.fabric_store_guard_refund() from public, anon, authenticated;

-- ============================================================================
-- المراجع إلى الجداول العاملة (income والمخزون) — آخر شيء قبل الفحص الذاتي
-- ============================================================================
-- إضافة مرجع FK تأخذ قفل SHARE ROW EXCLUSIVE على الجدول المشار إليه، و**يبقى
-- القفل حتى نهاية المعاملة** لا حتى نهاية الجملة. لذلك تأتي هذه الجمل في آخر
-- الهجرة: توقّف الكتابة على income والمخزون يقتصر على أجزاء الثانية الأخيرة منها،
-- لا على زمنها كله. (`lock_timeout` أعلاه يحد **انتظار** القفل فقط، لا مدة حجزه.)

alter table public.fabric_store_orders
  add constraint fabric_store_orders_income_id_fkey
    foreign key (income_id) references public.income(id) on delete restrict;

alter table public.fabric_store_stock_reservations
  add constraint fabric_store_stock_reservations_inventory_item_id_fkey
    foreign key (inventory_item_id) references public.fabric_inventory(id) on delete cascade,
  add constraint fabric_store_stock_reservations_inventory_color_id_fkey
    foreign key (inventory_color_id) references public.fabric_inventory_colors(id) on delete cascade;

-- ============================================================================
-- فحص ذاتي للترميز: لو قُرئ الملف بترميز خاطئ (كما حدث لهجرة 20260823161026
-- فشُوِّهت رسائل المحل) تفشل الهجرة كلها ولا يُطبَّق شيء. الفحص بأكواد الحروف.
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'fabric_store_guard_order';

  -- "الطلب"
  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
