/**
 * Single source for landing-page pricing and SuperAdmin plan codes.
 * `code` is stored as `companies.plan_code` (see backend PLAN_EMPLOYEE_LIMITS).
 * Prices exclude GST (same note as login).
 */
export const PRICING_PLANS = [
  {
    code: 'base',
    name: 'Base',
    emp: 'Up to 10',
    price: '10,000',
    amc: '3,000',
    popular: false,
    features: ['Attendance Tracking', 'Auto Payroll', 'WhatsApp Payslips', 'PDF Reports'],
    dimFeatures: ['Multi-Branch', 'Priority Support'],
  },
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

/**
 * UAE yearly subscription only (excl. VAT). No one-time or separate AMC.
 * Anchored at Base (AED 499 / up to 10). Higher tiers use volume discounts
 * so AED-per-employee falls as headcount rises (~50 → ~46 → ~43 → ~38 → ~32).
 */
export const PRICING_PLANS_AE = [
  {
    code: 'base',
    name: 'Base',
    emp: 'Up to 10',
    annual: '499',
    currency: 'AED',
  },
  {
    code: 'starter',
    name: 'Basic',
    emp: 'Up to 25',
    annual: '1,149',
    currency: 'AED',
  },
  {
    code: 'growth',
    name: 'Growth',
    emp: 'Up to 50',
    annual: '2,149',
    currency: 'AED',
  },
  {
    code: 'business',
    name: 'Business',
    emp: 'Up to 100',
    annual: '3,799',
    currency: 'AED',
  },
  {
    code: 'professional',
    name: 'Professional',
    emp: 'Up to 200',
    annual: '6,499',
    currency: 'AED',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    emp: '200+',
    annual: 'Custom',
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

/** International clients (AE): single annual subscription, no OTC/AMC split. */
export function isAnnualOnlyBilling(countryCode = 'IN') {
  return String(countryCode || 'IN').toUpperCase() === 'AE';
}

function parsePlanPrice(value) {
  if (value == null || value === '' || String(value).toLowerCase() === 'custom') return '';
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? String(n) : '';
}

/** Amount shown on the tenant company page (catalog for standard AE plans; DB for custom). */
export function tenantDisplayAmcAmount(planCode, countryCode = 'IN', storedAmcAmount) {
  const pricing = planPricingForCountry(planCode, countryCode);
  if (isAnnualOnlyBilling(countryCode) && pricing.amc) {
    return pricing.amc;
  }
  if (storedAmcAmount == null || storedAmcAmount === '') return null;
  return storedAmcAmount;
}

/** Parsed billing amounts for admin lead/convert forms. */
export function planPricingForCountry(planCode, countryCode = 'IN') {
  const plans = pricingPlansForCountry(countryCode);
  const plan = plans.find((p) => p.code === (planCode || 'base')) || plans[0];
  const currency = pricingCurrencyForCountry(countryCode);

  if (isAnnualOnlyBilling(countryCode)) {
    const annual = parsePlanPrice(plan.annual);
    return {
      annual,
      onetime: '',
      amc: annual,
      currency,
    };
  }

  return {
    annual: '',
    onetime: parsePlanPrice(plan.price),
    amc: parsePlanPrice(plan.amc),
    currency,
  };
}

/** Mirrors backend `PLAN_EMPLOYEE_LIMITS` for display. null = no default cap. */
export const PLAN_EMPLOYEE_CAP = {
  base: 10,
  starter: 25,
  growth: 50,
  business: 100,
  professional: 200,
  enterprise: null,
  custom: null,
};

/** Default total branch locations (including Main) when no override — aligns with plan tiers. */
export const PLAN_DEFAULT_BRANCH_TOTAL = {
  base: 1,
  starter: 1,
  growth: 2,
  business: 3,
  professional: 5,
  enterprise: null,
  custom: null,
};

/** Returns { staffCap, branchTotal } for Adjust limits hints (null = no default). */
export function planDefaultLimits(planCode) {
  const p = (planCode || 'base').toLowerCase();
  return {
    staffCap: Object.prototype.hasOwnProperty.call(PLAN_EMPLOYEE_CAP, p) ? PLAN_EMPLOYEE_CAP[p] : PLAN_EMPLOYEE_CAP.starter,
    branchTotal: Object.prototype.hasOwnProperty.call(PLAN_DEFAULT_BRANCH_TOTAL, p)
      ? PLAN_DEFAULT_BRANCH_TOTAL[p]
      : PLAN_DEFAULT_BRANCH_TOTAL.starter,
  };
}

export const PLAN_DISPLAY_NAME = {
  base: 'Base',
  starter: 'Basic',
  growth: 'Growth',
  business: 'Business',
  professional: 'Professional',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

/** Prefill SuperAdmin create / approve / convert forms from catalog. */
export function adminPlanFormDefaults(planCode = 'base', countryCode = 'IN') {
  const country = String(countryCode || 'IN').toUpperCase();
  const plans = pricingPlansForCountry(country);
  const requested = String(planCode || 'base').toLowerCase();
  const resolved =
    requested === 'custom' || plans.some((p) => p.code === requested)
      ? requested
      : plans[0]?.code || 'base';
  const pricing = planPricingForCountry(resolved, country);
  const limits = planDefaultLimits(resolved);
  const annualOnly = isAnnualOnlyBilling(country);
  return {
    plan_code: resolved,
    staffs_allowed: limits.staffCap,
    branches_allowed: limits.branchTotal ?? 1,
    onetime_fee_amount: annualOnly ? '' : pricing.onetime || '',
    amc_amount: pricing.amc || '',
    onetime_fee_paid: annualOnly,
  };
}

/** Merge catalog pricing + limits into an admin form object (mutates and returns target). */
export function applyAdminPlanFields(target, planCode, countryCode, { updateStaffCap = true } = {}) {
  const defaults = adminPlanFormDefaults(planCode, countryCode);
  target.plan_code = defaults.plan_code;
  if (updateStaffCap && defaults.staffs_allowed != null) {
    target.staffs_allowed = defaults.staffs_allowed;
  }
  if (defaults.branches_allowed != null) {
    target.branches_allowed = defaults.branches_allowed;
  }
  target.onetime_fee_amount = defaults.onetime_fee_amount;
  target.amc_amount = defaults.amc_amount;
  target.onetime_fee_paid = defaults.onetime_fee_paid;
  return target;
}

/** Labels for SuperAdmin <select>s — aligned with login pricing. */
export function planOptionsForAdminSelect(countryCode = 'IN') {
  const plans = pricingPlansForCountry(countryCode);
  const sym = pricingSymbolForCountry(countryCode);
  const annualOnly = isAnnualOnlyBilling(countryCode);
  const taxNote = annualOnly ? 'excl. VAT' : 'excl. GST';
  const fromLanding = plans.map((p) => {
    let priceLine;
    if (annualOnly) {
      priceLine =
        p.annual === 'Custom'
          ? `${p.name} — ${p.emp} employees · custom annual subscription`
          : `${p.name} — ${p.emp} employees · ${sym}${p.annual}/year (${taxNote})`;
    } else {
      priceLine =
        p.price === 'Custom'
          ? `${p.name} — ${p.emp} employees · custom one-time & AMC`
          : `${p.name} — ${p.emp} employees · ${sym}${p.price} + ${sym}${p.amc} AMC/yr (${taxNote})`;
    }
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
