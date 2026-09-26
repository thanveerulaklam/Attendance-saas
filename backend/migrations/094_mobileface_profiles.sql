-- MobileFaceNet templates live beside the original face-api.js descriptor.
-- The legacy embedding column is kept and is not comparable with the new vectors.

ALTER TABLE employee_face_enrollments
  ADD COLUMN IF NOT EXISTS recognition_model VARCHAR(64),
  ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER,
  ADD COLUMN IF NOT EXISTS embeddings JSONB;

ALTER TABLE employee_face_enrollments
  ALTER COLUMN embedding DROP NOT NULL;
