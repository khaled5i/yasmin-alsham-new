import type { Metadata } from 'next'
import Link from 'next/link'
import StorePolicyPage, { PolicyList, PolicySection } from '@/components/fabrics/StorePolicyPage'
import { STORE_ENTITY, STORE_RETURN_RULES, STORE_SUPPORT_PHONE } from '@/lib/store-legal'

export const metadata: Metadata = {
  title: 'سياسة الاسترجاع والاستبدال - متجر أقمشة ياسمين الشام',
  description: 'شروط إرجاع واستبدال الأقمشة واسترداد المبالغ في متجر ياسمين الشام.',
}

const days = STORE_RETURN_RULES.returnWindowDays

export default function ReturnPolicyPage() {
  return (
    <StorePolicyPage
      title="سياسة الاسترجاع والاستبدال"
      intro={
        <p>
          تنطبق هذه السياسة على مشتريات متجر الأقمشة الإلكتروني التابع لـ{STORE_ENTITY.legalName} ({STORE_ENTITY.brandName}).
          نرجو قراءتها قبل إتمام الطلب، فالموافقة عليها شرط لإتمام الدفع.
        </p>
      }
    >
      <PolicySection title="1. القماش المقصوص بالمتر">
        <p>
          القماش الذي يُقصّ بالطول الذي تحددينه عند الطلب يُجهَّز خصيصاً لكِ، لذلك
          <strong> لا يُسترجع ولا يُستبدل</strong> إلا في الحالات التالية:
        </p>
        <PolicyList items={[
          'وجود عيب في القماش (تمزق، بقع، عيب نسيج أو صباغة).',
          'وصول قماش مختلف عن المطلوب (نوع أو لون أو كود مختلف).',
          'نقص في الطول المستلَم عن الطول المدفوع ثمنه.',
        ]} />
        <p>يجب الإبلاغ عن الحالة خلال {days} أيام من تاريخ الاستلام، مع صور توضح المشكلة.</p>
      </PolicySection>

      <PolicySection title="2. القطع الكاملة (غير المقصوصة)">
        <p>يحق لكِ إرجاع القطعة الكاملة خلال <strong>{days} أيام</strong> من تاريخ الاستلام بالشروط التالية:</p>
        <PolicyList items={[
          'أن تكون بحالتها الأصلية: غير مقصوصة ولا مغسولة ولا مستعملة، ولم يُجرَ عليها أي تعديل.',
          'أن تكون مع فاتورة الشراء أو رقم الطلب.',
        ]} />
        <p>ويمكن الاستبدال بقماش آخر بدلاً من الاسترداد، مع دفع فرق السعر أو استرداده.</p>
      </PolicySection>

      <PolicySection title="3. إلغاء الطلب قبل التجهيز">
        <p>
          يمكن إلغاء الطلب المدفوع واسترداد كامل المبلغ ما دام القماش لم يُقصّ ولم يُسلَّم لشركة الشحن أو للعميلة.
          تواصلي معنا فوراً عبر رقم خدمة العملاء أدناه.
        </p>
      </PolicySection>

      <PolicySection title="4. تكلفة شحن الإرجاع">
        <PolicyList items={[
          'إذا كان سبب الإرجاع عيباً أو خطأً منّا: نتحمّل تكلفة شحن الإرجاع ونردّ رسوم الشحن الأصلية.',
          'إذا كان الإرجاع لغير ذلك (تغيير الرأي): تتحمّل العميلة تكلفة شحن الإرجاع، ولا تُسترد رسوم الشحن الأصلية.',
          'يمكن الإرجاع أيضاً بالحضور إلى المحل في الخبر بلا تكلفة شحن.',
        ]} />
      </PolicySection>

      <PolicySection title="5. استرداد المبلغ">
        <PolicyList items={[
          <>نُصدر الاسترداد خلال <strong>{STORE_RETURN_RULES.refundIssueBusinessDays} أيام عمل</strong> من استلام القماش المرتجع وفحصه والتأكد من مطابقته للشروط.</>,
          'يُعاد المبلغ إلى وسيلة الدفع نفسها التي استُخدمت في الشراء.',
          'بعد إصدار الاسترداد يظهر المبلغ في حسابك حسب البنك: بطاقات مدى خلال 1 إلى 3 أيام عمل، والبطاقات الائتمانية خلال 7 إلى 14 يوم عمل.',
        ]} />
      </PolicySection>

      <PolicySection title="6. طلب الإرجاع والشكاوى">
        <p>
          لطلب إرجاع أو استبدال أو تقديم شكوى، تواصلي مع خدمة العملاء عبر الاتصال أو واتساب على الرقم
          {' '}<a href={STORE_SUPPORT_PHONE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#6b1726] hover:underline"><bdi dir="ltr">{STORE_SUPPORT_PHONE.local}</bdi></a>{' '}
          مع ذكر رقم الطلب. نردّ على الطلبات والشكاوى خلال {STORE_RETURN_RULES.complaintResponseBusinessDays} يوم عمل.
        </p>
        <p>
          وتبقى حقوقك محفوظة وفق نظام التجارة الإلكترونية في المملكة العربية السعودية. انظري أيضاً
          {' '}<Link href="/sales-terms" className="font-semibold text-[#6b1726] hover:underline">شروط البيع</Link> و
          <Link href="/shipping-policy" className="font-semibold text-[#6b1726] hover:underline">سياسة الشحن والتوصيل</Link>.
        </p>
      </PolicySection>
    </StorePolicyPage>
  )
}
