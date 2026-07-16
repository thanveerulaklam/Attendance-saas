-- Retain a small enrollment photo for the kiosk employee directory.
ALTER TABLE employee_face_enrollments
  ADD COLUMN IF NOT EXISTS photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(50) DEFAULT 'image/jpeg';

