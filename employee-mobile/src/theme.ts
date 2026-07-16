export const colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  brand: '#D4A843',
  brandDark: '#A07820',
  violet: '#7c3aed',
  success: '#059669',
  danger: '#dc2626',
  border: '#e2e8f0',
};

export const statusLabel: Record<string, string> = {
  not_checked_in: 'Not checked in',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
};

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
