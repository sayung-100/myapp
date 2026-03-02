ALTER TABLE guest_students
  ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0;

ALTER TABLE guest_students
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ NULL;

ALTER TABLE guest_students
  DROP CONSTRAINT IF EXISTS guest_students_pin_failed_attempts_check;

ALTER TABLE guest_students
  ADD CONSTRAINT guest_students_pin_failed_attempts_check CHECK (pin_failed_attempts >= 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS teacher_private_comment TEXT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS student_comment TEXT NULL;

UPDATE bookings
SET student_comment = COALESCE(student_comment, teacher_comment)
WHERE teacher_comment IS NOT NULL;
