import type { Metadata } from 'next'
import StorePolicyPage, { PolicyList, PolicySection } from '@/components/fabrics/StorePolicyPage'
import { STORE_DELIVERY_TIMES, STORE_ENTITY, STORE_RETURN_RULES, STORE_SUPPORT_PHONE } from '@/lib/store-legal'

export const metadata: Metadata = {
  title: 'الشحن والتوصيل - متجر أقمشة ياسمين الشام',
  description: 'شحن مجاني لكل الطلبات داخل السعودية ولكل دول العالم، أو استلام من المحل في الخبر، ومدد التوصيل.',
}

export default function ShippingPolicyPage() {
  return (
    <StorePolicyPage
      title="سياسة الشحن والتوصيل"
      intro={<p>الشحن مجاني لكل الطلبات، داخل المملكة ولكل دول العالم، ويمكنكِ أيضاً الاستلام من المحل. تظهر مدة التوصيل في صفحة الدفع قبل إتمام الطلب.</p>}
    >
      <PolicySection title="1. الاستلام من المحل">
        <PolicyList items={[
          'بلا رسوم.',
          <>مدة التجهيز: {STORE_DELIVERY_TIMES.pickup}.</>,
          'نرسل لكِ رسالة حين يصبح الطلب جاهزاً، ويُسلَّم بإبراز رقم الطلب.',
          <>العنوان: {STORE_ENTITY.address}.</>,
        ]} />
      </PolicySection>

      <PolicySection title="2. الشحن داخل المملكة العربية السعودية">
        <PolicyList items={[
          'الشحن مجاني لكل المدن ولكل الطلبات، بلا حد أدنى.',
          <>مدة التوصيل: {STORE_DELIVERY_TIMES.shipping}.</>,
          'تُحسب المدة على كل أيام الأسبوع، وقد تطول في المواسم والعطل الرسمية والظروف الخارجة عن إرادتنا، وسنبلغك حينها.',
          'يجب إدخال العنوان ورقم جوال المستلم بدقة؛ تأخر التوصيل بسبب عنوان خاطئ لا نتحمّله.',
        ]} />
      </PolicySection>

      <PolicySection title="3. الشحن الدولي">
        <PolicyList items={[
          'نشحن لكل دول العالم مجاناً، بلا حد أدنى للطلب.',
          <>مدة التوصيل: {STORE_DELIVERY_TIMES.international}، وقد تطول بحسب إجراءات الجمارك في بلد الوصول.</>,
          'الرسوم الجمركية والضرائب في بلد الوصول — إن وُجدت — على المستلمة، وتُدفع لشركة الشحن أو الجمارك عند الاستلام.',
          'اكتبي العنوان كاملاً ورقم الجوال برمز الدولة؛ الشحنة التي تُرفض أو لا تُستلم بسبب الجمارك أو عنوان خاطئ لا نتحمّل تكلفة إعادتها.',
        ]} />
      </PolicySection>

      <PolicySection title="4. استلام شحنة تالفة أو ناقصة">
        <p>
          إذا وصلت الشحنة تالفة أو ناقصة أو مختلفة عن طلبك، صوّريها وتواصلي معنا خلال {STORE_RETURN_RULES.returnWindowDays} أيام من الاستلام
          على الرقم <a href={STORE_SUPPORT_PHONE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6b1726] hover:underline"><bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi></a>،
          ونعالج الأمر وفق سياسة الاسترجاع على حسابنا.
        </p>
      </PolicySection>
    </StorePolicyPage>
  )
}
