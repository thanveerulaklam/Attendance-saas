export const DEMO_ENQUIRY_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_booked',
  'demo_given',
  'sold',
  'lost',
  'converted',
];

export const DEMO_ENQUIRY_PIPELINE_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_booked',
  'demo_given',
  'sold',
  'lost',
];

export const DEMO_ENQUIRY_STATUS_LABELS = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  demo_booked: 'Demo booked',
  demo_given: 'Demo given',
  sold: 'Sold',
  lost: 'Lost',
  converted: 'Converted',
};

export const DEMO_ENQUIRY_STATUS_STYLES = {
  not_contacted: 'bg-slate-100 text-slate-700 border-slate-200',
  contacted: 'bg-sky-50 text-sky-800 border-sky-200',
  demo_booked: 'bg-amber-50 text-amber-900 border-amber-300',
  demo_given: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sold: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  lost: 'bg-rose-50 text-rose-800 border-rose-200',
  converted: 'bg-violet-50 text-violet-800 border-violet-200',
};

export const DEMO_ENQUIRY_STATUS_BUTTON_STYLES = {
  not_contacted: 'border-slate-200 text-slate-700 hover:bg-slate-50',
  contacted: 'border-sky-200 text-sky-800 hover:bg-sky-50',
  demo_booked: 'border-amber-300 text-amber-900 hover:bg-amber-50',
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

export const DEFAULT_STATE_SUGGESTIONS = [
  'Tamil Nadu',
  'Kerala',
  'Karnataka',
  'Andhra Pradesh',
  'Telangana',
  'Maharashtra',
  'Gujarat',
  'Rajasthan',
  'Madhya Pradesh',
  'Uttar Pradesh',
  'Delhi',
  'West Bengal',
  'Odisha',
  'Bihar',
  'Jharkhand',
  'Chhattisgarh',
  'Punjab',
  'Haryana',
  'Himachal Pradesh',
  'Uttarakhand',
  'Assam',
  'Goa',
  'Puducherry',
  'Jammu and Kashmir',
  'Ladakh',
];

export const DEFAULT_CITY_SUGGESTIONS = [
  'Coimbatore',
  'Chennai',
  'Madurai',
  'Tiruppur',
  'Salem',
  'Erode',
  'Tiruchirappalli',
  'Tirunelveli',
  'Vellore',
  'Thoothukudi',
  'Dindigul',
  'Thanjavur',
  'Karur',
  'Namakkal',
  'Hosur',
  'Nagercoil',
  'Kanchipuram',
  'Bengaluru',
  'Hyderabad',
  'Mumbai',
  'Pune',
  'Kochi',
];

export const CALL_OUTCOMES = [
  'no_answer',
  'busy',
  'voicemail',
  'wrong_number',
  'callback',
  'connected',
  'interested',
  'demo_booked',
  'demo_given',
  'sold',
  'not_interested',
  'lost',
];

export const CALL_OUTCOME_GROUPS = [
  {
    id: 'reach',
    label: 'Could not reach',
    outcomes: ['no_answer', 'busy', 'voicemail', 'wrong_number'],
  },
  {
    id: 'talked',
    label: 'Reached',
    outcomes: ['connected', 'callback', 'interested'],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    outcomes: ['demo_booked', 'demo_given', 'sold', 'not_interested', 'lost'],
  },
];

export const CALL_OUTCOMES_REQUIRE_FOLLOW_UP = ['callback', 'demo_booked'];
export const CALL_OUTCOMES_OPTIONAL_FOLLOW_UP = ['no_answer', 'busy', 'voicemail', 'interested', 'demo_given'];
export const CALL_OUTCOMES_REQUIRE_REASON = ['not_interested', 'lost'];

export const CALL_OUTCOME_LABELS = {
  pending: 'Outcome not logged',
  no_answer: 'No answer',
  busy: 'Busy',
  voicemail: 'Voicemail',
  callback: 'Call back later',
  connected: 'Talked',
  interested: 'Interested',
  demo_booked: 'Demo booked',
  demo_given: 'Demo given',
  sold: 'Sold',
  not_interested: 'Not interested',
  lost: 'Lost',
  wrong_number: 'Wrong number',
};

export const CALL_OUTCOME_STYLES = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  no_answer: 'bg-slate-100 text-slate-700 border-slate-200',
  busy: 'bg-orange-50 text-orange-800 border-orange-200',
  voicemail: 'bg-slate-100 text-slate-700 border-slate-200',
  callback: 'bg-sky-50 text-sky-800 border-sky-200',
  connected: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  interested: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  demo_booked: 'bg-amber-50 text-amber-900 border-amber-300',
  demo_given: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sold: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  not_interested: 'bg-rose-50 text-rose-800 border-rose-200',
  lost: 'bg-rose-50 text-rose-800 border-rose-200',
  wrong_number: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const CALL_FOLLOW_UP_LABELS = {
  no_answer: 'Retry at',
  busy: 'Retry at',
  voicemail: 'Retry at',
  callback: 'Call back at',
  interested: 'Follow up at',
  demo_booked: 'Demo at',
  demo_given: 'Next meeting',
};

export function demoEnquiryStatusLabel(status) {
  return DEMO_ENQUIRY_STATUS_LABELS[status] || 'Not contacted';
}

export function callOutcomeLabel(outcome) {
  return CALL_OUTCOME_LABELS[outcome] || 'Outcome not logged';
}

export function callNeedsFollowUp(outcome) {
  return CALL_OUTCOMES_REQUIRE_FOLLOW_UP.includes(outcome);
}

export function callAllowsFollowUp(outcome) {
  return (
    CALL_OUTCOMES_REQUIRE_FOLLOW_UP.includes(outcome) || CALL_OUTCOMES_OPTIONAL_FOLLOW_UP.includes(outcome)
  );
}

export function callFollowUpLabel(outcome) {
  return CALL_FOLLOW_UP_LABELS[outcome] || 'Follow up at';
}

export function leadSourceLabel(source) {
  return LEAD_SOURCE_LABELS[source] || source || '—';
}

const EMPLOYEE_RANGE_LABELS = {
  'up-to-25': 'Up to 25',
  'up-to-50': 'Up to 50',
  'up-to-100': 'Up to 100',
  'up-to-200': 'Up to 200',
  '200+': '200+',
  'Not specified': '—',
};

export function employeesCountLabel(value) {
  const v = String(value || '').trim();
  if (!v) return '—';
  return EMPLOYEE_RANGE_LABELS[v] || v;
}
