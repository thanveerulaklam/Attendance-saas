import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';
import { API_BASE } from '../utils/apiBase';
import { PLAN_DISPLAY_NAME } from '../constants/pricingPlans';

// Default WhatsApp support number (E.164 without +)
const DEFAULT_NUMBER = '919600844041';

/**
 * Floating WhatsApp help button. Opens wa.me with pre-filled text:
 * Company ID and user email (from /api/auth/me).
 */
export default function WhatsAppHelpButton() {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    let isMounted = true;
    authFetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.data) setUser(json.data);
      })
      .catch(() => {});
    authFetch(`${API_BASE}/api/company`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.data) setCompany(json.data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const number = (import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER || DEFAULT_NUMBER).replace(
    /\D/g,
    ''
  );

  const companyId = user?.company_id ?? company?.id;
  const planCode = (company?.plan_code || 'starter').toString().toLowerCase();
  const planName = PLAN_DISPLAY_NAME[planCode] || planCode.charAt(0).toUpperCase() + planCode.slice(1);
  const activeStaff = company?.active_staff_count ?? null;

  const lines = ['Hi, I need support.'];
  if (company?.name) lines.push(`Company: ${company.name}`);
  if (companyId != null) lines.push(`Company ID: ${companyId}`);
  if (company?.phone) lines.push(`Phone: ${company.phone}`);
  if (planCode) lines.push(`Current plan: ${planName}`);
  if (activeStaff != null) lines.push(`Active staff: ${activeStaff}`);
  if (user?.email) lines.push(`User email: ${user.email}`);

  const text = lines.join('\n');
  const href = `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
      title="Contact support on WhatsApp"
      aria-label="Contact support on WhatsApp"
    >
      <svg
        className="h-7 w-7"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
}
