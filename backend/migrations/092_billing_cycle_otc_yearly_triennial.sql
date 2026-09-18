-- India SuperAdmin: OTC (legacy), yearly subscription, 3-year package.
-- Keep monthly/annual so existing company rows stay valid.

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_billing_cycle_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_billing_cycle_check
  CHECK (
    billing_cycle IN (
      'monthly',
      'annual',
      'otc',
      'yearly',
      'triennial'
    )
  );

COMMENT ON COLUMN companies.billing_cycle IS
  'monthly/annual = legacy; otc = one-time+AMC; yearly = 1-year subscription; triennial = 3-year package.';
