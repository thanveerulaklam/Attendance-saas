-- UAE catalog: Base plan (up to 10 @ AED 499/yr) and volume-discounted higher tiers.
-- Per-employee AED falls as headcount rises. Prices excl. VAT.
-- Custom/enterprise agreements are left unchanged.

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 499
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'base';

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 1149
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, 'starter')) = 'starter'
  AND LOWER(COALESCE(plan_code, '')) NOT IN ('custom', 'enterprise', 'base');

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 2149
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'growth';

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 3799
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'business';

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 6499
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'professional';
