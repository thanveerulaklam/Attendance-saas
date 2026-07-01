-- Ensure UAE WPS columns exist (safe if 074 already applied).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS mol_establishment_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_routing_code VARCHAR(20);
