import type { Metadata } from 'next'
import StorePolicyPage, { PolicyList, PolicySection } from '@/components/fabrics/StorePolicyPage'
import { FABRIC_DELIVERY_OPTIONS } from '@/lib/fabric-store/checkout-contract'
import { STORE_DELIVERY_TIMES, STORE_ENTITY, STORE_RETURN_RULES, STORE_SUPPORT_PHONE } from '@/lib/store-legal'

export const metadata: Metadata = {
  title: 'الشحن والتوصيل - متجر أقمشة ياسمين الشام',
  description: 'طرق استلام طلبات متجر أقمشة ياسمين الشام ومدد التوصيل ورسوم الشحن.',
}

const shippingFeeSar = FABRIC_DELIVERY_OPTIONS.shipping.shippingNetHalalas / 100

export default function ShippingPolicyPage() {
  return (
    <StorePolicyPage
      title="سياسة الشحن والتوصيل"
      intro={<p>نوفّر طريقتين لاستلام طلبات متجر الأقمشة، وتظهر رسوم الشحن ومدته في صفحة الدفع قبل إتمام الطلب.</p>}
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
          <>رسوم شحن موحّدة لجميع المدن: {shippingFeeSar} ريالاً + ضريبة القيمة المضافة 15%.</>,
          <>مدة التوصيل: {STORE_DELIVERY_TIMES.shipping}.</>,
          'أيام العمل لا تشمل الجمعة والعطل الرسمية، وقد تطول المدة في المواسم والظروف الخارجة عن إرادتنا، وسنبلغك حينها.',
          'يجب إدخال العنوان ورقم جوال المستلم بدقة؛ تأخر التوصيل بسبب عنوان خاطئ لا نتحمّله.',
          'لا نشحن حالياً خارج المملكة.',
        ]} />
      </PolicySection>

      <PolicySection title="3. استلام شحنة تالفة أو ناقصة">
        <p>
          إذا وصلت الشحنة تالفة أو ناقصة أو مختلفة عن طلبك، صوّريها وتواصلي معنا خلال {STORE_RETURN_RULES.returnWindowDays} أيام من الاستلام
          على الرقم <a href={STORE_SUPPORT_PHONE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6b1726] hover:underline"><bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi></a>،
          ونعالج الأمر وفق سياسة الاسترجاع على حسابنا.
        </p>
      </PolicySection>
    </StorePolicyPage>
  )
}
