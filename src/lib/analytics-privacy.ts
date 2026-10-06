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
    gtag('js', new Date());
    gtag('config', '${GA_MEASUREMENT_ID}', {
      page_location: location.origin + location.pathname,
      send_page_view: !window['${GA_DISABLE_FLAG}']
    });
  `
}
