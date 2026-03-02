ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS teacher_comment TEXT NULL;

UPDATE bookings
SET completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'COMPLETED'
  AND completed_at IS NULL;

UPDATE teacher_profiles
SET timezone = 'Asia/Seoul',
    updated_at = NOW()
WHERE timezone = 'UTC';
