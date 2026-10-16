-- UAE catalog (excl. VAT), yearly / 3-year:
--   micro (5) 299 / 699, base (10) 499 / 1,149, starter (25) 1,199 / 2,699,
--   growth (50) 2,199 / 4,999, business (100) 3,999 / 8,999, professional (200) 6,999 / 15,999.
-- Moves yearly AE companies still on the previous catalog amount (migration 086) to the new price.
-- Negotiated amounts, custom and enterprise rows are left unchanged.

UPDATE companies
SET amc_amount = CASE LOWER(plan_code)
    WHEN 'starter' THEN 1199
    WHEN 'growth' THEN 2199
    WHEN 'business' THEN 3999
    WHEN 'professional' THEN 6999
  END
WHERE UPPER(country_code) = 'AE'
  AND LOWER(COALESCE(billing_cycle, 'annual')) IN ('annual', 'yearly')
  AND (
    (LOWER(plan_code) = 'starter' AND amc_amount = 1149)
    OR (LOWER(plan_code) = 'growth' AND amc_amount = 2149)
    OR (LOWER(plan_code) = 'business' AND amc_amount = 3799)
    OR (LOWER(plan_code) = 'professional' AND amc_amount = 6499)
  );
