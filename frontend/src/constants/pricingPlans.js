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
export function planOptionsForAdminSelect() {
  const fromLanding = PRICING_PLANS.map((p) => {
    const priceLine =
      p.price === 'Custom'
        ? `${p.name} — ${p.emp} employees · custom one-time & AMC`
        : `${p.name} — ${p.emp} employees · ₹${p.price} + ₹${p.amc} AMC/yr (excl. GST)`;
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
