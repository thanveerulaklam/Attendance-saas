-- Separate deduction for lunch over (minutes over allotted lunch). Independent from late arrival deduction.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS lunch_over_deduction_minutes INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lunch_over_deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_lunch_over_deduction_minutes_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_lunch_over_deduction_minutes_check CHECK (lunch_over_deduction_minutes >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_lunch_over_deduction_amount_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_lunch_over_deduction_amount_check CHECK (lunch_over_deduction_amount >= 0);
    END IF;
END;
$$;
