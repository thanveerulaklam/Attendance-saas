export const DEMO_ENQUIRY_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_given',
  'sold',
  'lost',
  'converted',
];

export const DEMO_ENQUIRY_PIPELINE_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_given',
  'sold',
  'lost',
];

export const DEMO_ENQUIRY_STATUS_LABELS = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  demo_given: 'Demo given',
  sold: 'Sold',
  lost: 'Lost',
  converted: 'Converted',
};

export const DEMO_ENQUIRY_STATUS_STYLES = {
  not_contacted: 'bg-slate-100 text-slate-700 border-slate-200',
  contacted: 'bg-sky-50 text-sky-800 border-sky-200',
  demo_given: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sold: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  lost: 'bg-rose-50 text-rose-800 border-rose-200',
  converted: 'bg-violet-50 text-violet-800 border-violet-200',
};

export const DEMO_ENQUIRY_STATUS_BUTTON_STYLES = {
  not_contacted: 'border-slate-200 text-slate-700 hover:bg-slate-50',
  contacted: 'border-sky-200 text-sky-800 hover:bg-sky-50',
  demo_given: 'border-indigo-200 text-indigo-800 hover:bg-indigo-50',
  sold: 'border-emerald-200 text-emerald-800 hover:bg-emerald-50',
  lost: 'border-rose-200 text-rose-800 hover:bg-rose-50',
};

export const LEAD_SOURCE_LABELS = {
  landing: 'Landing page',
  manual: 'Manual entry',
  referral: 'Referral',
  cold_call: 'Cold call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  event: 'Event',
  other: 'Other',
};

export const DEFAULT_LEAD_SOURCE_SUGGESTIONS = [
  'Referral',
  'Cold call',
  'WhatsApp',
  'Email',
  'Event / expo',
  'Google search',
  'Instagram',
  'Facebook',
  'Walk-in',
  'Existing customer',
  'Partner',
  'Other',
];

export function demoEnquiryStatusLabel(status) {
  return DEMO_ENQUIRY_STATUS_LABELS[status] || 'Not contacted';
}

export function leadSourceLabel(source) {
  return LEAD_SOURCE_LABELS[source] || source || '—';
}
