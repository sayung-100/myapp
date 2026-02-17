INSERT INTO users (role, email, password_hash, name)
VALUES
  ('TEACHER', 'teacher@example.com', 'dev-only-hash', 'Demo Teacher'),
  ('STUDENT', 'student@example.com', 'dev-only-hash', 'Demo Student')
ON CONFLICT (email) DO NOTHING;

INSERT INTO teacher_profiles (teacher_user_id, lesson_duration_min, timezone, cancel_cutoff_hours, booking_window_days)
SELECT id, 60, 'Asia/Seoul', 6, 30
FROM users
WHERE email = 'teacher@example.com'
ON CONFLICT (teacher_user_id) DO NOTHING;
