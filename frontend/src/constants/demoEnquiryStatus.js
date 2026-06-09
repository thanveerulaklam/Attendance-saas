export const DEMO_ENQUIRY_STATUSES = [
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
};

export const DEMO_ENQUIRY_STATUS_STYLES = {
  not_contacted: 'bg-slate-100 text-slate-700 border-slate-200',
  contacted: 'bg-sky-50 text-sky-800 border-sky-200',
  demo_given: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sold: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  lost: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const DEMO_ENQUIRY_STATUS_BUTTON_STYLES = {
  not_contacted: 'border-slate-200 text-slate-700 hover:bg-slate-50',
  contacted: 'border-sky-200 text-sky-800 hover:bg-sky-50',
  demo_given: 'border-indigo-200 text-indigo-800 hover:bg-indigo-50',
  sold: 'border-emerald-200 text-emerald-800 hover:bg-emerald-50',
  lost: 'border-rose-200 text-rose-800 hover:bg-rose-50',
};

export function demoEnquiryStatusLabel(status) {
  return DEMO_ENQUIRY_STATUS_LABELS[status] || 'Not contacted';
}
