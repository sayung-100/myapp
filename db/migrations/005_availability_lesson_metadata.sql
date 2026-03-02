ALTER TABLE weekly_availabilities
  ADD COLUMN IF NOT EXISTS lesson_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS lesson_note TEXT NULL;
