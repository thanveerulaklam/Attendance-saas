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

/** New India deals: yearly or 3-year prepaid. Same PunchPay software; slab is employee cap. */
export const PRICING_PLANS_IN_SUBSCRIPTION = [
  { code: 'micro', name: 'Up to 5', emp: 'Up to 5', annual: '2,999', triennial: '6,999' },
  { code: 'base', name: 'Up to 10', emp: 'Up to 10', annual: '4,999', triennial: '11,999' },
  { code: 'starter', name: 'Up to 25', emp: 'Up to 25', annual: '8,999', triennial: '19,999' },
  { code: 'growth', name: 'Up to 50', emp: 'Up to 50', annual: '14,999', triennial: '34,999' },
  { code: 'business', name: 'Up to 100', emp: 'Up to 100', annual: '24,999', triennial: '59,999' },
  { code: 'professional', name: 'Up to 200', emp: 'Up to 200', annual: '39,999', triennial: '89,999' },
  { code: 'enterprise', name: 'Enterprise', emp: '200+', annual: 'Custom', triennial: 'Custom' },
];

export const INDIA_BILLING_TYPE_OTC = 'otc';
export const INDIA_BILLING_TYPE_YEARLY = 'yearly';
export const INDIA_BILLING_TYPE_TRIENNIAL = 'triennial';

export const INDIA_BILLING_TYPE_OPTIONS = [
  { value: INDIA_BILLING_TYPE_YEARLY, label: 'Yearly — new deals' },
  { value: INDIA_BILLING_TYPE_TRIENNIAL, label: '3-year package — new deals' },
  { value: INDIA_BILLING_TYPE_OTC, label: 'OTC + AMC — existing / pipeline only' },
];

export function normalizeIndiaBillingType(billingCycle, planCode) {
  const c = String(billingCycle || '').toLowerCase();
  if (c === 'yearly') return INDIA_BILLING_TYPE_YEARLY;
  if (c === 'triennial' || c === '3years' || c === '3year' || c === '3-year') {
    return INDIA_BILLING_TYPE_TRIENNIAL;
  }
  if (c === 'otc') return INDIA_BILLING_TYPE_OTC;
  if (isPepmPlan(planCode)) return INDIA_BILLING_TYPE_YEARLY;
  return INDIA_BILLING_TYPE_OTC;
}

export function indiaBillingTermYears(billingType) {
  return billingType === INDIA_BILLING_TYPE_TRIENNIAL ? 3 : 1;
}

export function addCalendarYearsIso(iso, years) {
  const raw = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const extra = Number(years);
  const n = Number.isFinite(extra) && extra > 0 ? extra : 1;
  const [y, m, d] = raw.split('-').map(Number);
  const next = new Date(y + n, m - 1, d);
  if (next.getMonth() !== m - 1) next.setDate(0);
  const pad = (v) => String(v).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export function isIndiaPrepaidBilling(billingType) {
  return billingType === INDIA_BILLING_TYPE_YEARLY || billingType === INDIA_BILLING_TYPE_TRIENNIAL;
}

/** India WhatsApp monthly (legacy). SuperAdmin `pepm`. */
export const PEPM_PLAN_CODE = 'pepm';
export const PEPM_INCLUDED_STAFF = 10;
export const PEPM_MONTHLY_FLOOR_INR = 499;
export const PEPM_EXTRA_PER_STAFF_INR = 49;

export function isPepmPlan(planCode) {
  return String(planCode || '').toLowerCase() === PEPM_PLAN_CODE;
}

export function pepmMonthlyInr(staffCount) {
  const n = Math.max(0, Number(staffCount) || 0);
  if (n <= PEPM_INCLUDED_STAFF) return PEPM_MONTHLY_FLOOR_INR;
  return PEPM_MONTHLY_FLOOR_INR + (n - PEPM_INCLUDED_STAFF) * PEPM_EXTRA_PER_STAFF_INR;
}

export function pepmYearlyInr(staffCount) {
  return pepmMonthlyInr(staffCount) * 12;
}

export const PEPM_ADMIN_HINT =
  '₹499/mo includes 10 staff. Extra +₹49. Yearly amount = monthly × 12.';

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

/** Hide one-time fee: UAE, India yearly/3-year, or legacy pepm. */
export function hidesOnetimeFee(planCode, countryCode = 'IN', billingCycle) {
  if (isAnnualOnlyBilling(countryCode) || isPepmPlan(planCode)) return true;
  return isIndiaPrepaidBilling(normalizeIndiaBillingType(billingCycle, planCode));
}

export function indiaSubscriptionAmount(planCode, billingType) {
  const plan = PRICING_PLANS_IN_SUBSCRIPTION.find((p) => p.code === (planCode || 'base'));
  if (!plan) return '';
  const raw = billingType === INDIA_BILLING_TYPE_TRIENNIAL ? plan.triennial : plan.annual;
  return parsePlanPrice(raw);
}

export function indiaBillingTypeLabel(billingType) {
  if (billingType === INDIA_BILLING_TYPE_TRIENNIAL) return '3-year package';
  if (billingType === INDIA_BILLING_TYPE_YEARLY) return 'Yearly';
  if (billingType === 'annual') return 'Yearly';
  return 'OTC + AMC';
}

export function accessEndFromStart(startIso, billingCycle, countryCode = 'IN', planCode) {
  if (isAnnualOnlyBilling(countryCode)) return addCalendarYearsIso(startIso, 1);
  return addCalendarYearsIso(
    startIso,
    indiaBillingTermYears(normalizeIndiaBillingType(billingCycle, planCode))
  );
}

export function softwareFeeLabel(countryCode, billingCycle, planCode) {
  if (isAnnualOnlyBilling(countryCode)) return 'Annual subscription';
  if (isPepmPlan(planCode)) return 'Yearly (legacy monthly)';
  const t = normalizeIndiaBillingType(billingCycle, planCode);
  if (t === INDIA_BILLING_TYPE_TRIENNIAL) return '3-year package';
  if (t === INDIA_BILLING_TYPE_YEARLY) return 'Yearly';
  return 'AMC (annual)';
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
  const currency = pricingCurrencyForCountry(countryCode);
  if (isPepmPlan(planCode) && !isAnnualOnlyBilling(countryCode)) {
    const yearly = String(pepmYearlyInr(PEPM_INCLUDED_STAFF));
    return {
      annual: yearly,
      onetime: '',
      amc: yearly,
      currency,
    };
  }

  const plans = pricingPlansForCountry(countryCode);
  const plan = plans.find((p) => p.code === (planCode || 'base')) || plans[0];

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
  micro: 5,
  base: 10,
  starter: 25,
  growth: 50,
  business: 100,
  professional: 200,
  pepm: 10,
  enterprise: null,
  custom: null,
};

/** Default total branch locations (including Main) when no override — aligns with plan tiers. */
export const PLAN_DEFAULT_BRANCH_TOTAL = {
  micro: 1,
  base: 1,
  starter: 1,
  growth: 2,
  business: 3,
  professional: 5,
  pepm: 1,
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
  micro: 'Up to 5',
  base: 'Up to 10',
  starter: 'Up to 25',
  growth: 'Up to 50',
  business: 'Up to 100',
  professional: 'Up to 200',
  pepm: 'Monthly (legacy)',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

/** Prefill SuperAdmin create / approve / convert forms from catalog. */
export function adminPlanFormDefaults(
  planCode = 'base',
  countryCode = 'IN',
  { staffCount, billingType } = {}
) {
  const country = String(countryCode || 'IN').toUpperCase();
  const annualOnly = isAnnualOnlyBilling(country);
  const type = annualOnly
    ? 'annual'
    : normalizeIndiaBillingType(billingType || INDIA_BILLING_TYPE_YEARLY, planCode);

  if (isPepmPlan(planCode) && !annualOnly) {
    const existing = Number(staffCount);
    const staff = Number.isInteger(existing) && existing >= 1 ? existing : PEPM_INCLUDED_STAFF;
    return {
      plan_code: PEPM_PLAN_CODE,
      staffs_allowed: staff,
      branches_allowed: 1,
      onetime_fee_amount: '',
      amc_amount: String(pepmYearlyInr(staff)),
      onetime_fee_paid: true,
      billing_cycle: INDIA_BILLING_TYPE_YEARLY,
    };
  }

  if (!annualOnly && isIndiaPrepaidBilling(type)) {
    let resolved = String(planCode || 'base').toLowerCase();
    const inSub = PRICING_PLANS_IN_SUBSCRIPTION.some((p) => p.code === resolved);
    if (resolved !== 'custom' && !inSub) resolved = 'base';
    const limits = planDefaultLimits(resolved);
    const amount =
      resolved === 'custom' || resolved === 'enterprise' ? '' : indiaSubscriptionAmount(resolved, type);
    return {
      plan_code: resolved,
      staffs_allowed: limits.staffCap,
      branches_allowed: limits.branchTotal ?? 1,
      onetime_fee_amount: '',
      amc_amount: amount,
      onetime_fee_paid: true,
      billing_cycle: type,
    };
  }

  const plans = pricingPlansForCountry(country);
  let requested = String(planCode || 'base').toLowerCase();
  if (requested === 'micro' && !annualOnly) requested = 'base';
  const resolved =
    requested === 'custom' || plans.some((p) => p.code === requested)
      ? requested
      : plans[0]?.code || 'base';
  const pricing = planPricingForCountry(resolved, country);
  const limits = planDefaultLimits(resolved);
  return {
    plan_code: resolved,
    staffs_allowed: limits.staffCap,
    branches_allowed: limits.branchTotal ?? 1,
    onetime_fee_amount: annualOnly ? '' : pricing.onetime || '',
    amc_amount: pricing.amc || '',
    onetime_fee_paid: annualOnly,
    billing_cycle: annualOnly ? 'annual' : INDIA_BILLING_TYPE_OTC,
  };
}

/** Merge catalog pricing + limits into an admin form object (mutates and returns target). */
export function applyAdminPlanFields(
  target,
  planCode,
  countryCode,
  { updateStaffCap = true, staffCount, billingType } = {}
) {
  const type = billingType ?? target.billing_cycle;
  const defaults = adminPlanFormDefaults(planCode, countryCode, {
    staffCount: staffCount ?? target.staffs_allowed,
    billingType: type,
  });
  target.plan_code = defaults.plan_code;
  if (defaults.billing_cycle) target.billing_cycle = defaults.billing_cycle;
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

/** Recalculate yearly amount when SuperAdmin edits staff limit on pepm. */
export function syncPepmFormAmounts(target, countryCode = 'IN') {
  if (isAnnualOnlyBilling(countryCode) || !isPepmPlan(target?.plan_code)) return target;
  const n = Number(target.staffs_allowed);
  const staff = Number.isInteger(n) && n >= 1 ? n : PEPM_INCLUDED_STAFF;
  target.staffs_allowed = staff;
  target.onetime_fee_amount = '';
  target.amc_amount = String(pepmYearlyInr(staff));
  target.onetime_fee_paid = true;
  return target;
}

/** Labels for SuperAdmin <select>s. billingType: yearly | triennial | otc */
export function planOptionsForAdminSelect(
  countryCode = 'IN',
  billingType = INDIA_BILLING_TYPE_YEARLY
) {
  const sym = pricingSymbolForCountry(countryCode);
  const annualOnly = isAnnualOnlyBilling(countryCode);
  const taxNote = annualOnly ? 'excl. VAT' : 'excl. GST';

  if (annualOnly) {
    return [
      ...pricingPlansForCountry(countryCode).map((p) => ({
        value: p.code,
        label:
          p.annual === 'Custom'
            ? `${p.name} — ${p.emp} employees · custom annual subscription`
            : `${p.name} — ${p.emp} employees · ${sym}${p.annual}/year (${taxNote})`,
      })),
      { value: 'custom', label: 'Custom — bespoke agreement (no default employee cap)' },
    ];
  }

  const type = normalizeIndiaBillingType(billingType, '');
  if (isIndiaPrepaidBilling(type)) {
    const period = type === INDIA_BILLING_TYPE_TRIENNIAL ? '3 years' : 'year';
    const fromSub = PRICING_PLANS_IN_SUBSCRIPTION.map((p) => {
      const amt = type === INDIA_BILLING_TYPE_TRIENNIAL ? p.triennial : p.annual;
      const priceLine =
        amt === 'Custom'
          ? `${p.emp} employees · custom`
          : `${p.emp} employees · ${sym}${amt} / ${period} (${taxNote})`;
      return { value: p.code, label: priceLine };
    });
    return [
      ...fromSub,
      { value: 'custom', label: 'Custom — bespoke agreement (no default employee cap)' },
    ];
  }

  const fromLanding = PRICING_PLANS.map((p) => ({
    value: p.code,
    label:
      p.price === 'Custom'
        ? `${p.name} — ${p.emp} employees · custom one-time & AMC`
        : `${p.name} — ${p.emp} employees · ${sym}${p.price} + ${sym}${p.amc} AMC/yr (${taxNote})`,
  }));
  return [
    ...fromLanding,
    { value: 'custom', label: 'Custom — bespoke agreement (no default employee cap)' },
  ];
}

export function withCurrentPlanOption(options, planCode) {
  const code = String(planCode || '').toLowerCase();
  if (!code || options.some((o) => o.value === code)) return options;
  return [{ value: code, label: PLAN_DISPLAY_NAME[code] || code }, ...options];
}
