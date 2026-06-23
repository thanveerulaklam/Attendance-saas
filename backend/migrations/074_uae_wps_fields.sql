-- UAE WPS + employee fields for gratuity / salary file export.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS mol_establishment_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_routing_code VARCHAR(20);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS labour_card_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS iban VARCHAR(34),
  ADD COLUMN IF NOT EXISTS contract_type VARCHAR(20) NOT NULL DEFAULT 'unlimited';

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_contract_type_check;

ALTER TABLE employees
  ADD CONSTRAINT employees_contract_type_check
  CHECK (contract_type IN ('unlimited', 'limited'));

COMMENT ON COLUMN companies.mol_establishment_id IS 'UAE Ministry of Labour establishment / employer ID for WPS.';
COMMENT ON COLUMN companies.bank_routing_code IS 'UAE bank agent routing code for WPS salary file.';
COMMENT ON COLUMN employees.labour_card_number IS 'UAE labour card / work permit number for WPS.';
COMMENT ON COLUMN employees.iban IS 'Employee bank IBAN for WPS salary transfer.';
COMMENT ON COLUMN employees.contract_type IS 'UAE employment contract type: unlimited or limited.';
