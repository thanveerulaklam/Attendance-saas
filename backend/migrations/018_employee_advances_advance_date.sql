-- Store the date on which the advance was given/saved

ALTER TABLE employee_advances
  ADD COLUMN IF NOT EXISTS advance_date DATE NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN employee_advances.advance_date IS 'Date on which the advance was given/saved';
