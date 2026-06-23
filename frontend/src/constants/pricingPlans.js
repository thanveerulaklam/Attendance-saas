/**
 * Single source for landing-page pricing and SuperAdmin plan codes.
 * `code` is stored as `companies.plan_code` (see backend PLAN_EMPLOYEE_LIMITS).
 * Prices exclude GST (same note as login).
 */
export const PRICING_PLANS = [
  {
    code: 'starter',
    name: 'Basic',
    emp: 'Up to 25',
    price: '20,000',
    amc: '5,000',
    popular: false,
    features: ['Attendance Tracking', 'Auto Payroll', 'WhatsApp Payslips', 'PDF Reports'],
    dimFeatures: ['Multi-Branch', 'Priority Support'],
  },
  {
    code: 'growth',
    name: 'Growth',
    emp: 'Up to 50',
    price: '35,000',
    amc: '8,000',
    popular: true,
    features: [
      'Attendance Tracking',
      'Auto Payroll',
      'WhatsApp Payslips',
      'PDF Reports',
      'Multi-Branch Support',
    ],
    dimFeatures: ['Priority Support'],
  },
  {
    code: 'business',
    name: 'Business',
    emp: 'Up to 100',
    price: '60,000',
    amc: '15,000',
    popular: false,
    features: [
      'Attendance Tracking',
      'Auto Payroll',
      'WhatsApp Payslips',
      'PDF Reports',
      'Multi-Branch Support',
      'Priority Support',
    ],
    dimFeatures: [],
  },
  {
    code: 'professional',
    name: 'Professional',
    emp: 'Up to 200',
    price: '1,00,000',
    amc: '25,000',
    popular: false,
    features: [
      'Attendance Tracking',
      'Auto Payroll',
      'WhatsApp Payslips',
      'PDF Reports',
      'Multi-Branch Support',
      'Priority Support',
    ],
    dimFeatures: [],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    emp: '200+',
    price: 'Custom',
    amc: 'Custom',
    popular: false,
    features: [
      'Everything in Professional',
      'Custom Integrations',
      'Dedicated Support',
      'On-site Onboarding',
      'Custom Reports',
      'Negotiable Pricing',
    ],
    dimFeatures: [],
  },
];

/** UAE reference pricing for SuperAdmin (excl. VAT). */
export const PRICING_PLANS_AE = [
  {
    code: 'starter',
    name: 'Basic',
    emp: 'Up to 25',
    price: '2,500',
    amc: '650',
    currency: 'AED',
  },
  {
    code: 'growth',
    name: 'Growth',
    emp: 'Up to 50',
    price: '4,500',
    amc: '1,000',
    currency: 'AED',
  },
  {
    code: 'business',
    name: 'Business',
    emp: 'Up to 100',
    price: '7,500',
    amc: '2,000',
    currency: 'AED',
  },
  {
    code: 'professional',
    name: 'Professional',
    emp: 'Up to 200',
    price: '12,500',
    amc: '3,500',
    currency: 'AED',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    emp: '200+',
    price: 'Custom',
    amc: 'Custom',
    currency: 'AED',
  },
];

export function pricingPlansForCountry(countryCode = 'IN') {
  const code = String(countryCode || 'IN').toUpperCase();
  if (code === 'AE') return PRICING_PLANS_AE;
  return PRICING_PLANS;
}

export function pricingCurrencyForCountry(countryCode = 'IN') {
  const code = String(countryCode || 'IN').toUpperCase();
  if (code === 'AE') return 'AED';
  return 'INR';
}

export function pricingSymbolForCountry(countryCode = 'IN') {
  return pricingCurrencyForCountry(countryCode) === 'AED' ? 'AED' : '₹';
}

/** Parsed one-time + AMC amounts for admin lead/convert forms. */
export function planPricingForCountry(planCode, countryCode = 'IN') {
  const plans = pricingPlansForCountry(countryCode);
  const plan = plans.find((p) => p.code === (planCode || 'starter')) || plans[0];
  const parsePrice = (value) => {
    if (value == null || value === '' || String(value).toLowerCase() === 'custom') return '';
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  };
  return {
    onetime: parsePrice(plan.price),
    amc: parsePrice(plan.amc),
    currency: pricingCurrencyForCountry(countryCode),
  };
}

/** Mirrors backend `PLAN_EMPLOYEE_LIMITS` for display. null = no default cap. */
export const PLAN_EMPLOYEE_CAP = {
  starter: 25,
  growth: 50,
  business: 100,
  professional: 200,
  enterprise: null,
  custom: null,
};

/** Default total branch locations (including Main) when no override — aligns with plan tiers. */
export const PLAN_DEFAULT_BRANCH_TOTAL = {
  starter: 1,
  growth: 2,
  business: 3,
  professional: 5,
  enterprise: null,
  custom: null,
};

/** Returns { staffCap, branchTotal } for Adjust limits hints (null = no default). */
export function planDefaultLimits(planCode) {
  const p = (planCode || 'starter').toLowerCase();
  return {
    staffCap: Object.prototype.hasOwnProperty.call(PLAN_EMPLOYEE_CAP, p) ? PLAN_EMPLOYEE_CAP[p] : PLAN_EMPLOYEE_CAP.starter,
    branchTotal: Object.prototype.hasOwnProperty.call(PLAN_DEFAULT_BRANCH_TOTAL, p)
      ? PLAN_DEFAULT_BRANCH_TOTAL[p]
      : PLAN_DEFAULT_BRANCH_TOTAL.starter,
  };
}

export const PLAN_DISPLAY_NAME = {
  starter: 'Basic',
  growth: 'Growth',
  business: 'Business',
  professional: 'Professional',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

/** Labels for SuperAdmin <select>s — aligned with login pricing. */
export function planOptionsForAdminSelect(countryCode = 'IN') {
  const plans = pricingPlansForCountry(countryCode);
  const sym = pricingSymbolForCountry(countryCode);
  const taxNote = String(countryCode || 'IN').toUpperCase() === 'AE' ? 'excl. VAT' : 'excl. GST';
  const fromLanding = plans.map((p) => {
    const priceLine =
      p.price === 'Custom'
        ? `${p.name} — ${p.emp} employees · custom one-time & AMC`
        : `${p.name} — ${p.emp} employees · ${sym}${p.price} + ${sym}${p.amc} AMC/yr (${taxNote})`;
    return { value: p.code, label: priceLine };
  });
  return [
    ...fromLanding,
    {
      value: 'custom',
      label: 'Custom — bespoke agreement (no default employee cap)',
    },
  ];
}
