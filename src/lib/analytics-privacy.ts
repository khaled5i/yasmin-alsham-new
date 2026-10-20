/**
 * الدفعة D (AUD-07، AUD-10) + تصحيح المراجعة R-CD-07: لا Google Analytics في صفحات إتمام الطلب
 * والدفع وتتبّع الطلب. عليها اسم الزبونة وجوالها وعنوانها، وكان رابط التتبّع يحمل رمز الطلب.
 * وحدة نقية بلا 'use client': يستعملها سكربت الصفحة الأولى ومكوّن التنقّل.
 *
 * ثلاث طبقات:
 * 1. سكربت الصفحة الأولى يضبط علم التعطيل `ga-disable-<ID>` **قبل** config، ويلفّ
 *    history.pushState/replaceState فيُضبط العلم **قبل** تغيّر العنوان في أي تنقّل داخلي (لا بعده في
 *    effect — كانت هناك نافذة يرسل فيها GA حدث «تغيّر الصفحة» للمسار الحساس)، ومثله popstate.
 * 2. page_view نرسله نحن (send_page_view عند التحميل الأول، ثم المكوّن عند كل تنقّل) للمسارات
 *    المسموحة فقط، وpage_location بلا استعلام ولا #.
 * 3. في إعدادات GA (القياس المحسَّن) يُطفأ «تغيّرات الصفحة المبنية على سجل المتصفح» — يدوياً.
 */

export const GA_MEASUREMENT_ID = 'G-8KCD0TSPCJ'

/** المسارات المستثناة (بالشرطة الختامية: trailingSlash: true). */
export const GA_EXCLUDED_PATH_PREFIXES = ['/fabrics/checkout/', '/fabrics/payment/', '/fabrics/order/'] as const

export const GA_DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}`

/**
 * مَعلمات الحملات الوحيدة التي تبقى في page_location (أول تحميل فقط): معرّف نقرة Google Ads
 * ومعلمات utm. بدونها تظهر زيارات الإعلان في GA «مباشرة» ولا يُنسب شراء إلى إعلان. كل ما عداها
 * (رموز الطلب، معرّف المحاولة، أي استعلام آخر) يُحذف كما كان، والصفحات المستثناة لا تُرسل شيئاً أصلاً.
 */
export const GA_CAMPAIGN_QUERY_KEYS = [
  'gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
] as const

/** العنوان المرسل لـ GA: المسار + مَعلمات الحملات المسموحة فقط (بلا # ولا أي استعلام آخر). */
export function buildAnalyticsPageLocation(origin: string, pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  const kept: string[] = []
  for (const key of GA_CAMPAIGN_QUERY_KEYS) {
    const value = params.get(key)
    if (value) kept.push(`${key}=${encodeURIComponent(value.slice(0, 200))}`)
  }
  return origin + pathname + (kept.length ? `?${kept.join('&')}` : '')
}

/**
 * جهاز موظف/عامل: يُعلَّم عند فتح لوحة التحكم بحساب (أو برابط `?staff-device=1` لمن لا حساب له،
 * و`?staff-device=0` يزيل العلامة). زياراته تحمل traffic_type=internal فيستبعدها فلتر
 * «الزيارات الداخلية» في GA أياً كانت الشبكة (واي فاي المحل أو بيانات الجوال)، ولا يُحمَّل له Clarity.
 */
export const STAFF_DEVICE_KEY = 'ys-staff-device'
export const INTERNAL_TRAFFIC_TYPE = 'internal'

export function isStaffDevice(): boolean {
  try { return window.localStorage.getItem(STAFF_DEVICE_KEY) === '1' } catch { return false }
}

export function markStaffDevice() {
  try { window.localStorage.setItem(STAFF_DEVICE_KEY, '1') } catch { /* التخزين مرفوض */ }
  ;(window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.('set', { traffic_type: INTERNAL_TRAFFIC_TYPE })
}

export function isAnalyticsExcludedPath(pathname: string): boolean {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`
  return GA_EXCLUDED_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

interface AnalyticsWindow {
  location: { origin: string; pathname: string }
  gtag?: (...args: unknown[]) => void
  [flag: string]: unknown
}

/**
 * بعد كل تنقّل (المكوّن): يضبط العلم للمسار الجديد، ويرسل page_view إن كان مسموحاً.
 * التحميل الأول لا يرسل (config أرسله). يعيد ما فعل (للاختبار).
 */
export function applyAnalyticsRoute(win: AnalyticsWindow, pathname: string, isFirstRender: boolean): 'excluded' | 'sent' | 'first' {
  const excluded = isAnalyticsExcludedPath(pathname)
  win[GA_DISABLE_FLAG] = excluded
  if (excluded) return 'excluded'
  if (isFirstRender) return 'first'
  win.gtag?.('event', 'page_view', { page_location: win.location.origin + pathname, page_path: pathname })
  return 'sent'
}

/** سكربت الصفحة الأولى (يُحقن في <head> قبل تحميل gtag.js). */
export function analyticsBootstrapScript(): string {
  const prefixes = JSON.stringify(GA_EXCLUDED_PATH_PREFIXES)
  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    (function () {
      var prefixes = ${prefixes};
      function excluded(pathname) {
        var path = pathname.slice(-1) === '/' ? pathname : pathname + '/';
        return prefixes.some(function (p) { return path.indexOf(p) === 0; });
      }
      function guard(url) {
        try { window['${GA_DISABLE_FLAG}'] = excluded(new URL(url, location.href).pathname); } catch (e) {}
      }
      guard(location.href);
      ['pushState', 'replaceState'].forEach(function (method) {
        var original = history[method];
        history[method] = function (state, title, url) {
          if (url !== undefined && url !== null) guard(String(url));
          return original.apply(this, arguments);
        };
      });
      window.addEventListener('popstate', function () { guard(location.href); }, true);
    })();
    var staff = false;
    try {
      var staffParam = new URLSearchParams(location.search).get('staff-device');
      if (staffParam === '1') localStorage.setItem('${STAFF_DEVICE_KEY}', '1');
      if (staffParam === '0') localStorage.removeItem('${STAFF_DEVICE_KEY}');
      staff = localStorage.getItem('${STAFF_DEVICE_KEY}') === '1';
    } catch (e) {}
    if (staff) gtag('set', { traffic_type: '${INTERNAL_TRAFFIC_TYPE}' });
    var campaignKeys = ${JSON.stringify(GA_CAMPAIGN_QUERY_KEYS)};
    function pageLocation() {
      var kept = [];
      try {
        var params = new URLSearchParams(location.search);
        campaignKeys.forEach(function (key) {
          var value = params.get(key);
          if (value) kept.push(key + '=' + encodeURIComponent(value.slice(0, 200)));
        });
      } catch (e) {}
      return location.origin + location.pathname + (kept.length ? '?' + kept.join('&') : '');
    }
    gtag('js', new Date());
    gtag('config', '${GA_MEASUREMENT_ID}', {
      page_location: pageLocation(),
      send_page_view: !window['${GA_DISABLE_FLAG}']
    });
  `
}
