ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (
    status IN (
      'PENDING',
      'BOOKED',
      'CANCELED_BY_STUDENT',
      'CANCELED_BY_TEACHER',
      'COMPLETED',
      'NO_SHOW'
    )
  );

DROP INDEX IF EXISTS uq_bookings_teacher_start_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_teacher_start_active
  ON bookings (teacher_user_id, start_at)
  WHERE status IN ('PENDING', 'BOOKED');
