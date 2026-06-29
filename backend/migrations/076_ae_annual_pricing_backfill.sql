-- Align UAE companies with annual-only subscription model and current catalog prices (excl. VAT).
-- Custom/enterprise agreements are left unchanged.

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 2250
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, 'starter')) = 'starter'
  AND LOWER(COALESCE(plan_code, '')) NOT IN ('custom', 'enterprise');

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 3950
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'growth';

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 6250
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'business';

UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE,
  onetime_payment_status = COALESCE(onetime_payment_status, 'paid'),
  amc_amount = 9950
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(plan_code, '')) = 'professional';

-- Any other AE row still on split billing: zero one-time, keep negotiated amc if set.
UPDATE companies
SET
  onetime_fee_amount = 0,
  onetime_fee_paid = TRUE
WHERE UPPER(country_code) = 'AE'
  AND COALESCE(onetime_fee_amount, 0) > 0;
