ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_normalized
  ON users (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT NULL;

ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS bio TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS lesson_title_snapshot TEXT NULL;
