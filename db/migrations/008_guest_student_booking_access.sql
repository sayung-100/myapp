CREATE TABLE IF NOT EXISTS guest_students (
  id BIGSERIAL PRIMARY KEY,
  phone_normalized TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  contact_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bookings
  ALTER COLUMN student_user_id DROP NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_student_id BIGINT NULL REFERENCES guest_students(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_student_name TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS public_access_token_hash TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS public_access_token_expires_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS public_access_created_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS public_access_revoked_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_student_identity_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_student_identity_check CHECK (
    (student_user_id IS NOT NULL AND guest_student_id IS NULL)
    OR (student_user_id IS NULL AND guest_student_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_bookings_guest_student_start_at
  ON bookings (guest_student_id, start_at DESC)
  WHERE guest_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_public_access_expires
  ON bookings (public_access_token_expires_at)
  WHERE public_access_token_hash IS NOT NULL;
