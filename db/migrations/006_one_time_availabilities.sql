CREATE TABLE IF NOT EXISTS one_time_availabilities (
  id BIGSERIAL PRIMARY KEY,
  teacher_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,
  start_time_local TIME NOT NULL,
  end_time_local TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  lesson_title TEXT NULL,
  lesson_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time_local < end_time_local)
);

CREATE INDEX IF NOT EXISTS idx_one_time_availabilities_teacher_date_active
  ON one_time_availabilities (teacher_user_id, date_local, is_active, start_time_local);
