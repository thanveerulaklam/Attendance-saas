-- Allotted lunch break duration (minutes) per shift. Staff can take lunch anytime during the day but must return within this many minutes.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS lunch_minutes INTEGER NOT NULL DEFAULT 60;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'shifts_lunch_minutes_check'
    ) THEN
        ALTER TABLE shifts
            ADD CONSTRAINT shifts_lunch_minutes_check
            CHECK (lunch_minutes >= 0);
    END IF;
END;
$$;
