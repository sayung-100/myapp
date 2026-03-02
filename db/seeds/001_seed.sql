INSERT INTO users (role, email, password_hash, name)
VALUES
  ('TEACHER', 'teacher@example.com', '$2b$10$SAnonO1ZUr6gMNJMzd5CbO8Jx0jCwswrNDrR2eELeMqQfuv1excaG', 'Demo Teacher'),
  ('STUDENT', 'student@example.com', '$2b$10$SAnonO1ZUr6gMNJMzd5CbO8Jx0jCwswrNDrR2eELeMqQfuv1excaG', 'Demo Student')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  updated_at = NOW();

INSERT INTO teacher_profiles (teacher_user_id, lesson_duration_min, timezone, cancel_cutoff_hours, booking_window_days)
SELECT id, 60, 'Asia/Seoul', 6, 30
FROM users
WHERE email = 'teacher@example.com'
ON CONFLICT (teacher_user_id) DO UPDATE SET
  lesson_duration_min = EXCLUDED.lesson_duration_min,
  timezone = EXCLUDED.timezone,
  cancel_cutoff_hours = EXCLUDED.cancel_cutoff_hours,
  booking_window_days = EXCLUDED.booking_window_days,
  updated_at = NOW();
