import { authFetch } from './api';

export const COMPANY_FIELD_FLAGS_EVENT = 'punchpay-company-field-flags';

export function emitCompanyFieldFlags(flags) {
  window.dispatchEvent(new CustomEvent(COMPANY_FIELD_FLAGS_EVENT, { detail: flags }));
}

export async function patchFieldSettings(body) {
  const res = await authFetch('/api/company/field-settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'Failed to save field settings');
  const data = json.data || {};
  emitCompanyFieldFlags({
    field_attendance_enabled: Boolean(data.field_attendance_enabled),
    field_visits_enabled: Boolean(data.field_visits_enabled),
  });
  return data;
}
