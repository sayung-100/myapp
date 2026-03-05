ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS student_cancel_day_before_hour INT NOT NULL DEFAULT 21;

ALTER TABLE teacher_profiles
  ADD COLUMN IF NOT EXISTS student_notice TEXT NULL;

ALTER TABLE teacher_profiles
  DROP CONSTRAINT IF EXISTS teacher_profiles_student_cancel_day_before_hour_check;

ALTER TABLE teacher_profiles
  ADD CONSTRAINT teacher_profiles_student_cancel_day_before_hour_check
  CHECK (student_cancel_day_before_hour BETWEEN 0 AND 23);

DELETE FROM weekly_availabilities w
USING weekly_availabilities dup
WHERE w.id > dup.id
  AND w.teacher_user_id = dup.teacher_user_id
  AND w.weekday = dup.weekday
  AND w.start_time_local = dup.start_time_local
  AND w.end_time_local = dup.end_time_local;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_availabilities_teacher_slot
  ON weekly_availabilities (teacher_user_id, weekday, start_time_local, end_time_local);

DELETE FROM one_time_availabilities o
USING one_time_availabilities dup
WHERE o.id > dup.id
  AND o.teacher_user_id = dup.teacher_user_id
  AND o.date_local = dup.date_local
  AND o.start_time_local = dup.start_time_local
  AND o.end_time_local = dup.end_time_local;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_time_availabilities_teacher_slot
  ON one_time_availabilities (teacher_user_id, date_local, start_time_local, end_time_local);

DELETE FROM availability_exceptions e
USING availability_exceptions dup
WHERE e.id > dup.id
  AND e.teacher_user_id = dup.teacher_user_id
  AND e.date_local = dup.date_local
  AND e.start_time_local IS NOT NULL
  AND e.end_time_local IS NOT NULL
  AND dup.start_time_local IS NOT NULL
  AND dup.end_time_local IS NOT NULL
  AND e.start_time_local = dup.start_time_local
  AND e.end_time_local = dup.end_time_local;

DELETE FROM availability_exceptions e
USING availability_exceptions dup
WHERE e.id > dup.id
  AND e.teacher_user_id = dup.teacher_user_id
  AND e.date_local = dup.date_local
  AND e.start_time_local IS NULL
  AND e.end_time_local IS NULL
  AND dup.start_time_local IS NULL
  AND dup.end_time_local IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_exceptions_teacher_slot
  ON availability_exceptions (teacher_user_id, date_local, start_time_local, end_time_local)
  WHERE start_time_local IS NOT NULL AND end_time_local IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_exceptions_teacher_all_day
  ON availability_exceptions (teacher_user_id, date_local)
  WHERE start_time_local IS NULL AND end_time_local IS NULL;
