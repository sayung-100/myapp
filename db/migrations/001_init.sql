CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('TEACHER', 'STUDENT')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  teacher_user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lesson_duration_min INT NOT NULL DEFAULT 60 CHECK (lesson_duration_min > 0),
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  cancel_cutoff_hours INT NOT NULL DEFAULT 6 CHECK (cancel_cutoff_hours >= 0),
  booking_window_days INT NOT NULL DEFAULT 30 CHECK (booking_window_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_availabilities (
  id BIGSERIAL PRIMARY KEY,
  teacher_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time_local TIME NOT NULL,
  end_time_local TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time_local < end_time_local)
);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id BIGSERIAL PRIMARY KEY,
  teacher_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  start_time_local TIME NULL,
  end_time_local TIME NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (start_time_local IS NULL AND end_time_local IS NULL)
    OR (start_time_local IS NOT NULL AND end_time_local IS NOT NULL AND start_time_local < end_time_local)
  )
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  teacher_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  duration_min INT NOT NULL CHECK (duration_min > 0),
  status TEXT NOT NULL CHECK (
    status IN ('BOOKED', 'CANCELED_BY_STUDENT', 'CANCELED_BY_TEACHER', 'COMPLETED', 'NO_SHOW')
  ),
  canceled_at TIMESTAMPTZ NULL,
  cancel_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_teacher_start_active
  ON bookings (teacher_user_id, start_at)
  WHERE status = 'BOOKED';

CREATE INDEX IF NOT EXISTS idx_bookings_student_start_at
  ON bookings (student_user_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_teacher_start_at
  ON bookings (teacher_user_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_availabilities_teacher_weekday_active
  ON weekly_availabilities (teacher_user_id, weekday, is_active);

CREATE INDEX IF NOT EXISTS idx_availability_exceptions_teacher_date
  ON availability_exceptions (teacher_user_id, date_local);
