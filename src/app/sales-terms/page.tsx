import type { Metadata } from 'next'
import Link from 'next/link'
import StorePolicyPage, { PolicyList, PolicySection } from '@/components/fabrics/StorePolicyPage'
import {
  FABRIC_STORE_HOLD_MINUTES,
  FABRIC_STORE_MAX_ORDER_LINES,
  FABRIC_STORE_PAYMENT_HOLD_MINUTES,
} from '@/lib/fabric-store/checkout-contract'
import {
  STORE_ENTITY,
  STORE_PAYMENT_METHODS,
  STORE_RETURN_RULES,
  STORE_SUPPORT_PHONE,
} from '@/lib/store-legal'

export const metadata: Metadata = {
  title: 'شروط البيع - متجر أقمشة ياسمين الشام',
  description: 'شروط وأحكام البيع في متجر أقمشة ياسمين الشام الإلكتروني.',
}

const link = 'font-semibold text-[#6b1726] hover:underline'

export default function SalesTermsPage() {
  return (
    <StorePolicyPage
      title="شروط البيع"
      intro={
        <p>
          تنظّم هذه الشروط الشراء من متجر الأقمشة الإلكتروني. بإتمامك الطلب فإنك توافقين عليها وعلى
          {' '}<Link href="/return-policy" className={link}>سياسة الاسترجاع والاستبدال</Link> و
          <Link href="/shipping-policy" className={link}>سياسة الشحن والتوصيل</Link> و
          <Link href="/privacy-policy" className={link}>سياسة الخصوصية</Link>.
        </p>
      }
    >
      <PolicySection title="1. البائع">
        <PolicyList items={[
          <>{STORE_ENTITY.legalName}، العلامة التجارية «{STORE_ENTITY.brandName}».</>,
          <>السجل التجاري: <bdi dir="ltr">{STORE_ENTITY.commercialRegistration}</bdi> — الرقم الضريبي: <bdi dir="ltr">{STORE_ENTITY.vatNumber}</bdi>.</>,
          <>العنوان: {STORE_ENTITY.address}.</>,
          <>خدمة العملاء (اتصال وواتساب): <bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi>.</>,
        ]} />
      </PolicySection>

      <PolicySection title="2. المنتجات والكميات">
        <PolicyList items={[
          'تُباع الأقمشة بالمتر حسب الطول الذي تختارينه، أو كقطعة كاملة (3 أو 3.5 متر) حسب المتوفر.',
          'نعرض صوراً ووصفاً دقيقاً لكل قماش، وقد يختلف اللون قليلاً بحسب إضاءة التصوير وإعدادات الشاشة.',
          'الكميات محدودة بالمخزون الفعلي في المحل، ويُتحقّق منها عند إنشاء الطلب.',
        ]} />
      </PolicySection>

      <PolicySection title="3. الأسعار">
        <PolicyList items={[
          'جميع الأسعار بالريال السعودي.',
          'تُضاف ضريبة القيمة المضافة 15% على الأقمشة ورسوم الشحن، ويظهر الإجمالي النهائي شاملاً الضريبة قبل الدفع.',
          'السعر المعتمد هو السعر الظاهر في صفحة الدفع وقت إنشاء الطلب، ويُحسب على الخادم ولا يتغير بعد إنشائه.',
          'نصدر فاتورة ضريبية لكل طلب مدفوع.',
        ]} />
      </PolicySection>

      <PolicySection title="4. الطلب والحجز والدفع">
        <PolicyList items={[
          <>بعد تأكيد الطلب لديكِ {FABRIC_STORE_HOLD_MINUTES} دقيقة للضغط على «ادفعي»، وعندها يُحجز القماش لكِ {FABRIC_STORE_PAYMENT_HOLD_MINUTES} دقيقة لإتمام الدفع؛ فإن لم يكتمل الدفع يعود القماش للبيع. لا يُحجز القماش قبل الضغط على «ادفعي»، فقد يُباع في المحل إن تأخرتِ.</>,
          <>يصل الطلب الإلكتروني الواحد إلى {FABRIC_STORE_MAX_ORDER_LINES} أقمشة؛ للكميات الأكبر تواصلي مع المحل.</>,
          <>الدفع إلكترونياً عبر بوابة ميسر المرخّصة من البنك المركزي السعودي بوسائل: {STORE_PAYMENT_METHODS.join('، ')}.</>,
          'لا تمرّ بيانات بطاقتك على خوادمنا ولا نحتفظ بها؛ تُدخَل مباشرة في صفحة الدفع الآمنة لدى ميسر.',
          'يُعدّ الطلب مؤكداً بعد نجاح الدفع، ونرسل لكِ تأكيداً برقم الطلب.',
          'يحق لنا إلغاء الطلب واسترداد كامل المبلغ إذا تعذّر توفير القماش أو ظهر خطأ واضح في السعر، مع إبلاغك بذلك.',
        ]} />
      </PolicySection>

      <PolicySection title="5. الاستلام والتوصيل">
        <p>
          تتوفر طريقتا الاستلام من المحل أو الشحن داخل المملكة، ومددهما ورسومهما موضّحة في
          {' '}<Link href="/shipping-policy" className={link}>سياسة الشحن والتوصيل</Link> وفي صفحة الدفع.
        </p>
      </PolicySection>

      <PolicySection title="6. الإرجاع والاستبدال">
        <p>
          القماش المقصوص بالمتر لا يُسترجع إلا لعيب أو خطأ منّا، والقطع الكاملة غير المقصوصة تُسترجع خلال {STORE_RETURN_RULES.returnWindowDays} أيام
          بحالتها الأصلية. التفاصيل في <Link href="/return-policy" className={link}>سياسة الاسترجاع والاستبدال</Link>.
        </p>
      </PolicySection>

      <PolicySection title="7. خدمة العملاء والشكاوى">
        <p>
          نتولى نحن — لا بوابة الدفع — جميع خدمات ما بعد البيع وتسوية أي خلاف متعلق بالطلب. تواصلي معنا على
          {' '}<a href={STORE_SUPPORT_PHONE.whatsappUrl} target="_blank" rel="noopener noreferrer" className={link}><bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi></a>{' '}
          ونردّ خلال {STORE_RETURN_RULES.complaintResponseBusinessDays} يوم عمل.
        </p>
      </PolicySection>

      <PolicySection title="8. القانون الحاكم">
        <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية، ومنها نظام التجارة الإلكترونية ولائحته التنفيذية.</p>
      </PolicySection>
    </StorePolicyPage>
  )
}
