import { permanentRedirect } from 'next/navigation'

// نسخة قديمة مكررة من سياسة الخصوصية — النسخة المعتمدة الوحيدة هي /privacy-policy.
export default function PrivacyPage() {
  permanentRedirect('/privacy-policy')
}
