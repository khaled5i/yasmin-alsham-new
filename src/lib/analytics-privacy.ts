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

/**
 * المسارات المستثناة (بالشرطة الختامية: trailingSlash: true): صفحات الدفع وتتبّع الطلب، وصفحات
 * الموظفين (/dashboard و/login وكل ما تحتهما) — لا تصل إلى GA بأي حال، ولا تعتمد على فلتر في GA.
 */
export const GA_EXCLUDED_PATH_PREFIXES = ['/fabrics/checkout/', '/fabrics/payment/', '/fabrics/order/', '/dashboard/', '/login/'] as const

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
 * و`?staff-device=0` يزيل العلامة). لا يُرسَل منه شيء إلى GA في أي صفحة (حتى صفحات الموقع العامة)
 * أياً كانت الشبكة، ولا يُحمَّل له Clarity.
 */
export const STAFF_DEVICE_KEY = 'ys-staff-device'

/**
 * نفس العلامة ككوكي، حتى يراها السيرفر في روابط واتساب الوسيطة (/wa/...) فلا يعدّ ضغطات الموظفين.
 * سنة كاملة، وتُجدَّد عند كل زيارة لجهاز معلَّم (سكربت الصفحة الأولى).
 */
export const STAFF_DEVICE_COOKIE = STAFF_DEVICE_KEY
const STAFF_COOKIE_SET = `${STAFF_DEVICE_COOKIE}=1; path=/; max-age=31536000; samesite=lax; secure`
const STAFF_COOKIE_CLEAR = `${STAFF_DEVICE_COOKIE}=; path=/; max-age=0; samesite=lax; secure`

/** علم في window: الإحصاءات مطفأة كلياً لهذه الزيارة (جهاز موظف، أو خارج النطاق الرسمي، أو غير الإنتاج). */
export const ANALYTICS_OFF_KEY = '__ysAnalyticsOff'

export function isStaffDevice(): boolean {
  try { return window.localStorage.getItem(STAFF_DEVICE_KEY) === '1' } catch { return false }
}

export function markStaffDevice() {
  try { window.localStorage.setItem(STAFF_DEVICE_KEY, '1') } catch { /* التخزين مرفوض */ }
  try { document.cookie = STAFF_COOKIE_SET } catch { /* الكوكي مرفوضة */ }
  const win = window as unknown as Record<string, unknown>
  win[ANALYTICS_OFF_KEY] = true
  win[GA_DISABLE_FLAG] = true
}

export function isAnalyticsExcludedPath(pathname: string): boolean {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`
  return GA_EXCLUDED_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

/**
 * GA وClarity على النطاق الرسمي فقط: لا localhost ولا 127.0.0.1 ولا 192.168.x.x ولا روابط Vercel
 * التجريبية (‎*.vercel.app) — أي اسم غير هذين بالضبط يُرفض.
 */
export const ANALYTICS_PRODUCTION_HOSTS = ['yasmin-alsham.fashion', 'www.yasmin-alsham.fashion'] as const

export function isAnalyticsProductionHost(hostname: string): boolean {
  return (ANALYTICS_PRODUCTION_HOSTS as readonly string[]).includes(hostname.toLowerCase())
}

/** صفحات الموظفين لا تُسجَّل في Clarity، فوق استثناءات GA (الدفع وتتبّع الطلب). */
export const CLARITY_EXCLUDED_PATH_PREFIXES = ['/dashboard', '/login'] as const

export function isClarityExcludedPath(pathname: string): boolean {
  return isAnalyticsExcludedPath(pathname) || CLARITY_EXCLUDED_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
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
  const excluded = win[ANALYTICS_OFF_KEY] === true || isAnalyticsExcludedPath(pathname)
  win[GA_DISABLE_FLAG] = excluded
  if (excluded) return 'excluded'
  if (isFirstRender) return 'first'
  win.gtag?.('event', 'page_view', { page_location: win.location.origin + pathname, page_path: pathname })
  return 'sent'
}

/**
 * سكربت الصفحة الأولى (يُحقن في <head> قبل تحميل gtag.js). `enabled` = NODE_ENV production،
 * و`hosts` النطاقات المسموحة (الاختبارات تمرّر نطاقها). خارجها، أو على جهاز موظف، يبقى العلم
 * مرفوعاً في كل صفحة فلا يُرسَل شيء.
 */
export function analyticsBootstrapScript(
  { enabled = true, hosts = ANALYTICS_PRODUCTION_HOSTS }: { enabled?: boolean; hosts?: readonly string[] } = {}
): string {
  const prefixes = JSON.stringify(GA_EXCLUDED_PATH_PREFIXES)
  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    (function () {
      var off = ${enabled ? 'false' : 'true'};
      if (${JSON.stringify(hosts)}.indexOf(String(location.hostname).toLowerCase()) === -1) off = true;
      try {
        var staffParam = new URLSearchParams(location.search).get('staff-device');
        if (staffParam === '1') localStorage.setItem('${STAFF_DEVICE_KEY}', '1');
        if (staffParam === '0') localStorage.removeItem('${STAFF_DEVICE_KEY}');
        if (localStorage.getItem('${STAFF_DEVICE_KEY}') === '1') off = true;
      } catch (e) {}
      try {
        if (off && localStorage.getItem('${STAFF_DEVICE_KEY}') === '1') document.cookie = '${STAFF_COOKIE_SET}';
        else if (staffParam === '0') document.cookie = '${STAFF_COOKIE_CLEAR}';
      } catch (e) {}
      if (off) window['${ANALYTICS_OFF_KEY}'] = true;
    })();
    (function () {
      var prefixes = ${prefixes};
      function excluded(pathname) {
        var path = pathname.slice(-1) === '/' ? pathname : pathname + '/';
        return prefixes.some(function (p) { return path.indexOf(p) === 0; });
      }
      function guard(url) {
        try { window['${GA_DISABLE_FLAG}'] = window['${ANALYTICS_OFF_KEY}'] === true || excluded(new URL(url, location.href).pathname); } catch (e) {}
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
