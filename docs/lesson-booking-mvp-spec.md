# Lesson Booking MVP Spec

## 0) Scope and Roles
- Product: Web booking MVP for private lessons (piano, yoga, etc.)
- Roles:
  - Teacher (admin): login, manage weekly availability and exceptions, view bookings, cancel bookings
  - Student: book/cancel lesson, view own bookings
- Out of scope (future): payment, settlement, SMS/Kakao notifications

## 1) Assumptions
- A lesson has one teacher and one student.
- Default lesson duration is 60 minutes; teacher can change lesson duration.
- Timezone for scheduling is fixed per teacher (`timezone`), default `Asia/Seoul`.
- Cancellation cutoff is 6 hours before lesson start.
- Booking window rule: `start_at <= now + 30 days` (inclusive, current time 기준).
- Booking is slot-based using lesson start time.
- Booking create API accepts `{start_at}` only; server computes `end_at` from duration.
- Active booking uniqueness is enforced by DB partial unique index:
  - `UNIQUE(teacher_user_id, start_at) WHERE status='BOOKED'`
- `COMPLETED` is excluded from the uniqueness target.

## 2) MVP vs Future
### MVP
- Teacher auth (session or token)
- Student auth (lightweight email/password)
- Teacher weekly availability CRUD
- Teacher date exceptions (off-day / blocked slot)
- Slot query API for students
- Booking create/cancel
- Booking list (teacher/students)
- Basic audit fields (`created_at`, `updated_at`)

### Future
- Payment/settlement
- Reminder/notification integrations
- Waitlist
- Recurring booking
- Multi-teacher organization support

## 3) User Flows
### Teacher Flow
1. Teacher signs in.
2. Teacher sets lesson duration (default 60).
3. Teacher defines weekly availability windows.
4. Teacher registers exceptions (holiday, ad-hoc block).
5. Teacher checks upcoming bookings.
6. Teacher cancels booking when needed (respecting policy).

### Student Flow
1. Student signs in.
2. Student opens teacher page and selects date range.
3. Student fetches available slots (`start_at`, calculated `end_at`).
4. Student submits booking with `{start_at}`.
5. Server validates rule and creates booking.
6. Student views/cancels own bookings (6-hour cutoff).

## 4) Data Model

### users
- `id` (PK, bigserial)
- `role` (enum: `TEACHER`, `STUDENT`)
- `email` (unique)
- `password_hash`
- `name`
- `created_at`, `updated_at`

Indexes
- `UNIQUE(email)`
- `INDEX(role)`

### teacher_profiles
- `teacher_user_id` (PK, FK -> users.id)
- `lesson_duration_min` (int, default 60)
- `timezone` (text, default `Asia/Seoul`)
- `cancel_cutoff_hours` (int, default 6)
- `booking_window_days` (int, default 30)
- `created_at`, `updated_at`

### weekly_availabilities
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `weekday` (0-6)
- `start_time_local` (time)
- `end_time_local` (time)
- `is_active` (bool)
- `created_at`, `updated_at`

Indexes
- `INDEX(teacher_user_id, weekday, is_active)`

### availability_exceptions
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `date_local` (date)
- `start_time_local` (time, nullable; null means full-day off)
- `end_time_local` (time, nullable)
- `reason` (text)
- `created_at`, `updated_at`

Indexes
- `INDEX(teacher_user_id, date_local)`

### bookings
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `student_user_id` (FK -> users.id)
- `start_at` (timestamptz)
- `duration_min` (int)
- `status` (enum: `BOOKED`, `CANCELED_BY_STUDENT`, `CANCELED_BY_TEACHER`, `COMPLETED`, `NO_SHOW`)
- `canceled_at` (timestamptz, nullable)
- `cancel_reason` (text, nullable)
- `created_at`, `updated_at`

Indexes/Constraints
- Partial unique index for active slot collision prevention:
  - `UNIQUE(teacher_user_id, start_at) WHERE status='BOOKED'`
- `INDEX(student_user_id, start_at DESC)`
- `INDEX(teacher_user_id, start_at DESC)`

## 5) API Endpoints

### Auth
- `POST /api/v1/auth/register` (public)
- `POST /api/v1/auth/login` (public)
- `POST /api/v1/auth/logout` (authenticated)

Errors
- `400` validation failed
- `401` unauthorized
- `409` duplicated email

### Teacher Availability
- `GET /api/v1/teachers/me/availability` (teacher)
- `POST /api/v1/teachers/me/availability` (teacher)
- `PATCH /api/v1/teachers/me/availability/:id` (teacher)
- `DELETE /api/v1/teachers/me/availability/:id` (teacher)

Errors
- `400`, `401`, `403`, `404`, `409`

### Teacher Exceptions
- `GET /api/v1/teachers/me/exceptions` (teacher)
- `POST /api/v1/teachers/me/exceptions` (teacher)
- `DELETE /api/v1/teachers/me/exceptions/:id` (teacher)

Errors
- `400`, `401`, `403`, `404`, `409`

### Slot Query
- `GET /api/v1/teachers/:teacherId/slots?from=...&to=...` (student/auth)
- Response item fields:
  - `start_at`
  - `end_at` (calculated by server from duration)
  - `is_available`

Errors
- `400`, `401`, `404`

### Booking
- `POST /api/v1/bookings` (student)
- Request body: `{ "start_at": "2026-02-20T10:00:00+09:00" }`
- Server computes `end_at` and persists `duration_min`

- `GET /api/v1/bookings/me` (student)
- `GET /api/v1/teachers/me/bookings` (teacher)
- `POST /api/v1/bookings/:id/cancel` (owner/teacher)

Errors
- `400` invalid datetime / policy violation
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` slot already booked (unique conflict)
- `422` outside `start_at <= now + 30 days` or cutoff violation

## 6) Edge Cases and Policies
- Concurrent booking: DB partial unique index is final guard.
- Duplicate booking retries: treat unique conflict as idempotent-style business error (`409`).
- Past time booking attempt: reject (`422`).
- Booking beyond +30 days: reject using `start_at <= now + 30 days` rule (`422`).
- Slot availability drift between fetch and submit: resolve at booking transaction time.
- Cancellation at exactly 6h boundary: allowed when `now <= start_at - interval '6 hours'`.
- Teacher cancel after cutoff: allowed for admin safety but logged.
- No-show handling: teacher/manual batch sets `NO_SHOW`.
- Completion transition: `BOOKED -> COMPLETED` after lesson end.
- `COMPLETED` rows do not participate in unique collision checks.

## 7) Test Scenarios (15)
1. Student books valid slot within 30 days -> success.
2. Two students book same teacher+start_at concurrently -> one success, one `409`.
3. Student books with invalid datetime format -> `400`.
4. Student books past time -> `422`.
5. Student books at exactly `now + 30 days` -> success.
6. Student books after `now + 30 days` -> `422`.
7. Student cancels before 6-hour cutoff -> success.
8. Student cancels after 6-hour cutoff -> `422`.
9. Teacher cancels booked lesson after cutoff -> success + audit.
10. Slot response includes calculated `end_at` based on duration.
11. Changing teacher duration affects future slot `end_at` calculation.
12. Exception full-day off removes all slots for date.
13. Partial-day exception removes overlapping slots only.
14. Completed booking at same start_at does not block new `BOOKED` uniqueness.
15. Student can list only own bookings; teacher can list only own teacher bookings.

## 8) Milestones
1. Project bootstrap (repo, frontend/backend/db, compose, env, migrate/seed)
2. Auth
3. Availability/exceptions
4. Booking APIs
5. QA hardening
