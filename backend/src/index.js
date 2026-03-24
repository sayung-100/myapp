const express = require('express');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { randomBytes, createHash } = require('crypto');
const { query } = require('./db');
const { signAccessToken, requireAuth, optionalAuth, revokeAccessToken } = require('./auth');
const { loadAppConfig } = require('./config');

dotenv.config({ path: '../.env' });
const { appConfig, configPath } = loadAppConfig();

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

const publicBookingLimiter = createPublicRateLimit({
  windowMs:
    Number.isInteger(Number(appConfig?.guest?.rateLimit?.windowMs)) && Number(appConfig.guest.rateLimit.windowMs) > 0
      ? Number(appConfig.guest.rateLimit.windowMs)
      : 5 * 60 * 1000,
  max:
    Number.isInteger(Number(appConfig?.guest?.rateLimit?.max)) && Number(appConfig.guest.rateLimit.max) > 0
      ? Number(appConfig.guest.rateLimit.max)
      : 60,
});

const LOCAL_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PIN4_REGEX = /^\d{4}$/;
const GUEST_PUBLIC_ACCESS_DAYS =
  Number.isInteger(Number(appConfig?.guest?.publicAccessDays)) && Number(appConfig.guest.publicAccessDays) > 0
    ? Number(appConfig.guest.publicAccessDays)
    : 90;
const GUEST_DATA_RETENTION_DAYS =
  Number.isInteger(Number(appConfig?.guest?.dataRetentionDays)) && Number(appConfig.guest.dataRetentionDays) > 0
    ? Number(appConfig.guest.dataRetentionDays)
    : 365;
const GUEST_PIN_MAX_FAILED_ATTEMPTS =
  Number.isInteger(Number(appConfig?.guest?.pin?.maxFailedAttempts)) &&
  Number(appConfig.guest.pin.maxFailedAttempts) > 0
    ? Number(appConfig.guest.pin.maxFailedAttempts)
    : 5;
const GUEST_PIN_LOCKOUT_MINUTES =
  Number.isInteger(Number(appConfig?.guest?.pin?.lockoutMinutes)) && Number(appConfig.guest.pin.lockoutMinutes) > 0
    ? Number(appConfig.guest.pin.lockoutMinutes)
    : 15;
const GUEST_CANCEL_REASON_REQUIRED = appConfig?.guest?.cancelReasonRequired !== false;
const REQUIRE_TEACHER_PRIVATE_COMMENT_ON_COMPLETE =
  appConfig?.booking?.comments?.requireTeacherPrivateOnComplete !== false;
const REQUIRE_STUDENT_COMMENT_ON_COMPLETE = appConfig?.booking?.comments?.requireStudentCommentOnComplete !== false;
const DEFAULT_STUDENT_CANCEL_DAY_BEFORE_HOUR =
  Number.isInteger(Number(appConfig?.booking?.studentCancelDayBeforeHourLocal)) &&
  Number(appConfig.booking.studentCancelDayBeforeHourLocal) >= 0 &&
  Number(appConfig.booking.studentCancelDayBeforeHourLocal) <= 23
    ? Number(appConfig.booking.studentCancelDayBeforeHourLocal)
    : 21;
const AUTO_COMPLETE_POLL_MS =
  parsePositiveInt(process.env.AUTO_COMPLETE_POLL_MS) ||
  (Number.isInteger(Number(appConfig?.schedulers?.autoCompletePollMs)) && Number(appConfig.schedulers.autoCompletePollMs) > 0
    ? Number(appConfig.schedulers.autoCompletePollMs)
    : 60 * 1000);
const GUEST_RETENTION_POLL_MS =
  parsePositiveInt(process.env.GUEST_RETENTION_POLL_MS) ||
  (Number.isInteger(Number(appConfig?.schedulers?.guestRetentionPollMs)) && Number(appConfig.schedulers.guestRetentionPollMs) > 0
    ? Number(appConfig.schedulers.guestRetentionPollMs)
    : 24 * 60 * 60 * 1000);

const publicRateCounters = new Map();

function toPublicUser(row) {
  const loginId = row.login_id || row.email || null;
  return {
    id: row.id,
    role: row.role,
    login_id: loginId,
    email: loginId,
    phone: row.phone_normalized || row.phone || null,
    name: row.name,
    created_at: row.created_at,
  };
}

function parseLocalTime(value) {
  const text = String(value || '').trim();
  if (!LOCAL_TIME_REGEX.test(text)) {
    return null;
  }
  if (text.length === 5) {
    return `${text}:00`;
  }
  return text;
}

function localTimeToMinutes(timeText) {
  const parsed = parseLocalTime(timeText);
  if (!parsed) return null;
  const [hoursText, minutesText] = parsed.split(':');
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function isAlignedToHalfHour(timeText) {
  const totalMinutes = localTimeToMinutes(timeText);
  if (!Number.isInteger(totalMinutes)) {
    return false;
  }
  return totalMinutes % 30 === 0;
}

function isCancelDeadlinePassed(deadlineAt) {
  const parsed = new Date(deadlineAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return Date.now() > parsed.getTime();
}

function parseLocalDate(value) {
  const text = String(value || '').trim();
  if (!LOCAL_DATE_REGEX.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (parsed.toISOString().slice(0, 10) !== text) {
    return null;
  }
  return text;
}

function parseAvailabilityId(value) {
  return parsePositiveInt(value);
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseDateTime(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseTimeZone(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: text }).format(new Date());
    return text;
  } catch (err) {
    return null;
  }
}

function parsePhoneNormalized(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (normalized.startsWith('82') && normalized.length >= 10 && normalized.length <= 12) {
    normalized = `0${normalized.slice(2)}`;
  }
  if (normalized.length < 9 || normalized.length > 15) {
    return null;
  }
  return normalized;
}

function parsePin4(value) {
  const text = String(value || '').trim();
  if (!PIN4_REGEX.test(text)) {
    return null;
  }
  return text;
}

function hashPublicAccessToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function createPublicAccessToken() {
  return randomBytes(24).toString('hex');
}

function buildPublicManageUrl(req, bookingId, token) {
  const host = String(req.headers.host || '').trim();
  if (!host) {
    return null;
  }
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim() || 'http';
  const params = new URLSearchParams({
    public_booking_id: String(bookingId),
    public_token: token,
  });
  return `${proto}://${host}/student-bookings.html?${params.toString()}`;
}

function createPublicRateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}|${req.path}`;
    const state = publicRateCounters.get(key);
    if (!state || state.expiresAt <= now) {
      publicRateCounters.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }
    if (state.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((state.expiresAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'too_many_requests' });
    }
    state.count += 1;
    return next();
  };
}

function requireTeacher(req, res, next) {
  if (req.auth?.role !== 'TEACHER') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function requireStudent(req, res, next) {
  if (req.auth?.role !== 'STUDENT') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

async function hasAvailabilityConflict(teacherUserId, weekday, startTimeLocal, endTimeLocal, ignoreId) {
  const conflict = await query(
    `
      SELECT id
      FROM weekly_availabilities
      WHERE teacher_user_id = $1
        AND weekday = $2
        AND is_active = TRUE
        AND start_time_local < $4::time
        AND end_time_local > $3::time
        AND ($5::bigint IS NULL OR id <> $5)
      LIMIT 1
    `,
    [teacherUserId, weekday, startTimeLocal, endTimeLocal, ignoreId || null]
  );
  return conflict.rowCount > 0;
}

async function hasOneTimeAvailabilityConflict(teacherUserId, dateLocal, startTimeLocal, endTimeLocal, ignoreId) {
  const conflict = await query(
    `
      SELECT id
      FROM one_time_availabilities
      WHERE teacher_user_id = $1
        AND date_local = $2::date
        AND is_active = TRUE
        AND start_time_local < $4::time
        AND end_time_local > $3::time
        AND ($5::bigint IS NULL OR id <> $5)
      LIMIT 1
    `,
    [teacherUserId, dateLocal, startTimeLocal, endTimeLocal, ignoreId || null]
  );
  return conflict.rowCount > 0;
}

async function hasExceptionConflict(teacherUserId, dateLocal, startTimeLocal, endTimeLocal) {
  if (!startTimeLocal || !endTimeLocal) {
    const conflict = await query(
      `
        SELECT id
        FROM availability_exceptions
        WHERE teacher_user_id = $1
          AND date_local = $2::date
        LIMIT 1
      `,
      [teacherUserId, dateLocal]
    );
    return conflict.rowCount > 0;
  }

  const conflict = await query(
    `
      SELECT id
      FROM availability_exceptions
      WHERE teacher_user_id = $1
        AND date_local = $2::date
        AND (
          (start_time_local IS NULL AND end_time_local IS NULL)
          OR (start_time_local < $4::time AND end_time_local > $3::time)
        )
      LIMIT 1
    `,
    [teacherUserId, dateLocal, startTimeLocal, endTimeLocal]
  );
  return conflict.rowCount > 0;
}

async function getTeacherProfileById(teacherUserId) {
  const result = await query(
    `
      SELECT
        teacher_user_id,
        lesson_duration_min,
        timezone,
        cancel_cutoff_hours,
        booking_window_days,
        student_cancel_day_before_hour,
        student_notice
      FROM teacher_profiles
      WHERE teacher_user_id = $1
      LIMIT 1
    `,
    [teacherUserId]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

async function autoCompletePastBookings({ teacherUserId = null, studentUserId = null, guestStudentId = null } = {}) {
  await query(
    `
      UPDATE bookings b
      SET status = 'COMPLETED',
          completed_at = COALESCE(b.completed_at, NOW()),
          updated_at = NOW()
      WHERE b.status = 'BOOKED'
        AND (b.start_at + make_interval(mins => b.duration_min)) <= NOW()
        AND ($1::bigint IS NULL OR b.teacher_user_id = $1)
        AND ($2::bigint IS NULL OR b.student_user_id = $2)
        AND ($3::bigint IS NULL OR b.guest_student_id = $3)
    `,
    [teacherUserId, studentUserId, guestStudentId]
  );
}

async function findGuestStudentByPhone(phoneNormalized) {
  const result = await query(
    `
      SELECT id, phone_normalized, pin_hash, contact_name, pin_failed_attempts, pin_locked_until
      FROM guest_students
      WHERE phone_normalized = $1
      LIMIT 1
    `,
    [phoneNormalized]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

async function verifyGuestPinOrTrack(guest, pin4) {
  const now = new Date();
  const lockedUntil = guest?.pin_locked_until ? new Date(guest.pin_locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    const retryAfterSec = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
    return {
      error: 'guest_pin_locked',
      retryAfterSec,
      lockedUntil: lockedUntil.toISOString(),
    };
  }

  const ok = await bcrypt.compare(pin4, String(guest.pin_hash || ''));
  if (ok) {
    if (Number(guest.pin_failed_attempts || 0) > 0 || guest.pin_locked_until) {
      await query(
        `
          UPDATE guest_students
          SET pin_failed_attempts = 0,
              pin_locked_until = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [guest.id]
      );
    }
    return { ok: true };
  }

  const nextFailed = Number(guest.pin_failed_attempts || 0) + 1;
  if (nextFailed >= GUEST_PIN_MAX_FAILED_ATTEMPTS) {
    const nextLockedUntil = new Date(Date.now() + GUEST_PIN_LOCKOUT_MINUTES * 60 * 1000).toISOString();
    await query(
      `
        UPDATE guest_students
        SET pin_failed_attempts = 0,
            pin_locked_until = $2::timestamptz,
            updated_at = NOW()
        WHERE id = $1
      `,
      [guest.id, nextLockedUntil]
    );
    return {
      error: 'guest_pin_locked',
      retryAfterSec: GUEST_PIN_LOCKOUT_MINUTES * 60,
      lockedUntil: nextLockedUntil,
    };
  }

  await query(
    `
      UPDATE guest_students
      SET pin_failed_attempts = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [guest.id, nextFailed]
  );
  return { error: 'invalid_guest_credentials' };
}

async function resolveGuestStudentIdentity({ studentName, phoneNormalized, pin4 }) {
  const existing = await findGuestStudentByPhone(phoneNormalized);
  if (!existing) {
    const pinHash = await bcrypt.hash(pin4, 10);
    const created = await query(
      `
        INSERT INTO guest_students (phone_normalized, pin_hash, contact_name)
        VALUES ($1, $2, $3)
        RETURNING id, phone_normalized, pin_hash, contact_name, pin_failed_attempts, pin_locked_until
      `,
      [phoneNormalized, pinHash, studentName || null]
    );
    return { guest: created.rows[0], isNew: true };
  }

  const pinCheck = await verifyGuestPinOrTrack(existing, pin4);
  if (!pinCheck.ok) {
    return {
      error: pinCheck.error || 'invalid_guest_credentials',
      retryAfterSec: pinCheck.retryAfterSec || null,
      lockedUntil: pinCheck.lockedUntil || null,
    };
  }

  if (studentName && String(existing.contact_name || '') !== studentName) {
    await query(
      `
        UPDATE guest_students
        SET contact_name = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [existing.id, studentName]
    );
    existing.contact_name = studentName;
  }

  return { guest: existing, isNew: false };
}

async function issuePublicAccessTokenForBooking(bookingId) {
  const token = createPublicAccessToken();
  const tokenHash = hashPublicAccessToken(token);
  const expiresAt = new Date(Date.now() + GUEST_PUBLIC_ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await query(
    `
      UPDATE bookings
      SET public_access_token_hash = $2,
          public_access_token_expires_at = $3::timestamptz,
          public_access_created_at = NOW(),
          public_access_revoked_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [bookingId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

async function getGuestBookingByToken(bookingId, rawToken) {
  const tokenHash = hashPublicAccessToken(rawToken);
  const result = await query(
    `
      SELECT
        b.id,
        b.teacher_user_id,
        b.student_user_id,
        b.guest_student_id,
        b.guest_student_name,
        b.start_at,
        b.duration_min,
        b.status,
        b.completed_at,
        b.teacher_private_comment,
        COALESCE(b.student_comment, b.teacher_comment) AS student_comment,
        b.canceled_at,
        b.cancel_reason,
        tp.timezone,
        tp.student_cancel_day_before_hour,
        make_timestamptz(
          extract(year FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
          extract(month FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
          extract(day FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
          tp.student_cancel_day_before_hour,
          0,
          0,
          tp.timezone
        ) AS student_cancel_deadline_at
      FROM bookings b
      JOIN teacher_profiles tp ON tp.teacher_user_id = b.teacher_user_id
      WHERE b.id = $1
        AND b.guest_student_id IS NOT NULL
        AND b.public_access_token_hash = $2
        AND b.public_access_revoked_at IS NULL
        AND b.public_access_token_expires_at > NOW()
      LIMIT 1
    `,
    [bookingId, tokenHash]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

function startAutoCompletionScheduler() {
  const intervalMs = AUTO_COMPLETE_POLL_MS;
  const timer = setInterval(() => {
    autoCompletePastBookings().catch((err) => {
      console.error('auto completion scheduler failed', err);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

async function runGuestRetentionCleanup() {
  const retentionDays = GUEST_DATA_RETENTION_DAYS;
  await query(
    `
      UPDATE bookings
      SET guest_student_name = NULL,
          public_access_token_hash = NULL,
          public_access_token_expires_at = NULL,
          public_access_created_at = NULL,
          public_access_revoked_at = NOW(),
          updated_at = NOW()
      WHERE guest_student_id IS NOT NULL
        AND start_at < NOW() - make_interval(days => $1::int)
    `,
    [retentionDays]
  );

  await query(
    `
      DELETE FROM guest_students gs
      WHERE NOT EXISTS (
        SELECT 1
        FROM bookings b
        WHERE b.guest_student_id = gs.id
          AND b.start_at >= NOW() - make_interval(days => $1::int)
      )
    `,
    [retentionDays]
  );
}

function startGuestRetentionScheduler() {
  const intervalMs = GUEST_RETENTION_POLL_MS;
  const timer = setInterval(() => {
    runGuestRetentionCleanup().catch((err) => {
      console.error('guest retention scheduler failed', err);
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

async function resolveTeacherUserIdForBooking(inputTeacherUserId) {
  if (
    inputTeacherUserId !== undefined &&
    inputTeacherUserId !== null &&
    String(inputTeacherUserId).trim() !== ''
  ) {
    const teacherUserId = parsePositiveInt(inputTeacherUserId);
    if (!teacherUserId) {
      return { error: 'teacher_user_id must be a positive integer' };
    }
    return { teacherUserId };
  }

  const teachers = await query(
    `
      SELECT teacher_user_id
      FROM teacher_profiles
      ORDER BY teacher_user_id ASC
    `
  );

  if (teachers.rowCount === 1) {
    return { teacherUserId: teachers.rows[0].teacher_user_id };
  }
  return { error: 'teacher_user_id is required when multiple teachers exist' };
}

async function getBookableSlotAt(teacherUserId, startAtIso, timezone) {
  const result = await query(
    `
      WITH weekly_slots AS (
        SELECT
          make_timestamptz(
            extract(year FROM target_date)::int,
            extract(month FROM target_date)::int,
            extract(day FROM target_date)::int,
            extract(hour FROM wa.start_time_local)::int,
            extract(minute FROM wa.start_time_local)::int,
            extract(second FROM wa.start_time_local),
            $3
          ) AS start_at,
          make_timestamptz(
            extract(year FROM target_date)::int,
            extract(month FROM target_date)::int,
            extract(day FROM target_date)::int,
            extract(hour FROM wa.end_time_local)::int,
            extract(minute FROM wa.end_time_local)::int,
            extract(second FROM wa.end_time_local),
            $3
          ) AS end_at,
          wa.lesson_title,
          1 AS source_priority
        FROM weekly_availabilities wa
        CROSS JOIN LATERAL (
          SELECT ($2::timestamptz AT TIME ZONE $3)::date AS target_date
        ) d
        WHERE wa.teacher_user_id = $1
          AND wa.is_active = TRUE
          AND wa.weekday = extract(dow FROM d.target_date)::int
      ),
      one_time_slots AS (
        SELECT
          make_timestamptz(
            extract(year FROM ota.date_local)::int,
            extract(month FROM ota.date_local)::int,
            extract(day FROM ota.date_local)::int,
            extract(hour FROM ota.start_time_local)::int,
            extract(minute FROM ota.start_time_local)::int,
            extract(second FROM ota.start_time_local),
            $3
          ) AS start_at,
          make_timestamptz(
            extract(year FROM ota.date_local)::int,
            extract(month FROM ota.date_local)::int,
            extract(day FROM ota.date_local)::int,
            extract(hour FROM ota.end_time_local)::int,
            extract(minute FROM ota.end_time_local)::int,
            extract(second FROM ota.end_time_local),
            $3
          ) AS end_at,
          ota.lesson_title,
          2 AS source_priority
        FROM one_time_availabilities ota
        WHERE ota.teacher_user_id = $1
          AND ota.is_active = TRUE
          AND ota.date_local = ($2::timestamptz AT TIME ZONE $3)::date
      ),
      candidate_slots AS (
        SELECT start_at, end_at, lesson_title, source_priority FROM weekly_slots
        UNION ALL
        SELECT start_at, end_at, lesson_title, source_priority FROM one_time_slots
      ),
      dedup_slots AS (
        SELECT DISTINCT ON (start_at) start_at, end_at, lesson_title
        FROM candidate_slots
        ORDER BY start_at ASC, source_priority DESC, end_at DESC
      )
      SELECT
        extract(epoch FROM (c.end_at - c.start_at))::int / 60 AS duration_min,
        c.lesson_title
      FROM dedup_slots c
      WHERE c.start_at = $2::timestamptz
        AND c.end_at > c.start_at
        AND NOT EXISTS (
          SELECT 1
          FROM bookings b
          WHERE b.teacher_user_id = $1
            AND b.start_at = c.start_at
            AND (
              b.status IN ('PENDING', 'BOOKED')
              OR (
                b.status = 'COMPLETED'
                AND (b.start_at + make_interval(mins => b.duration_min)) > NOW()
              )
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM availability_exceptions ex
          WHERE ex.teacher_user_id = $1
            AND ex.date_local = (c.start_at AT TIME ZONE $3)::date
            AND (
              (ex.start_time_local IS NULL AND ex.end_time_local IS NULL)
              OR (
                c.start_at <
                  make_timestamptz(
                    extract(year FROM ex.date_local)::int,
                    extract(month FROM ex.date_local)::int,
                    extract(day FROM ex.date_local)::int,
                    extract(hour FROM ex.end_time_local)::int,
                    extract(minute FROM ex.end_time_local)::int,
                    extract(second FROM ex.end_time_local),
                    $3
                  )
                AND
                c.end_at >
                  make_timestamptz(
                    extract(year FROM ex.date_local)::int,
                    extract(month FROM ex.date_local)::int,
                    extract(day FROM ex.date_local)::int,
                    extract(hour FROM ex.start_time_local)::int,
                    extract(minute FROM ex.start_time_local)::int,
                    extract(second FROM ex.start_time_local),
                    $3
                  )
              )
            )
        )
      LIMIT 1
    `,
    [teacherUserId, startAtIso, timezone]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    now: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const loginId = String(req.body?.login_id ?? req.body?.email ?? '').trim().toLowerCase();
    const phoneNormalized = parsePhoneNormalized(req.body?.phone);
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim().toUpperCase();

    if (!loginId || !password || !name || !role || !phoneNormalized) {
      return res.status(400).json({ error: 'login_id, phone, password, name, role are required' });
    }

    if (!['TEACHER', 'STUDENT'].includes(role)) {
      return res.status(400).json({ error: 'role must be TEACHER or STUDENT' });
    }
    if (loginId.length < 3 || loginId.length > 60) {
      return res.status(400).json({ error: 'login_id must be 3~60 characters' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertUserSql = `
      INSERT INTO users (role, email, phone_normalized, password_hash, name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, role, email, phone_normalized, name, created_at
    `;

    const userResult = await query(insertUserSql, [role, loginId, phoneNormalized, passwordHash, name]);
    const user = userResult.rows[0];

    if (role === 'TEACHER') {
      await query(
        `
          INSERT INTO teacher_profiles (teacher_user_id, student_cancel_day_before_hour)
          VALUES ($1, $2)
          ON CONFLICT (teacher_user_id) DO NOTHING
        `,
        [user.id, DEFAULT_STUDENT_CANCEL_DAY_BEFORE_HOUR]
      );
    }

    const token = signAccessToken(user);
    return res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err && err.code === '23505') {
      if (String(err.constraint || '').includes('phone')) {
        return res.status(409).json({ error: 'phone already exists' });
      }
      return res.status(409).json({ error: 'login_id already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const loginId = String(req.body?.login_id ?? req.body?.email ?? req.body?.id ?? '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!loginId || !password) {
      return res.status(400).json({ error: 'login_id and password are required' });
    }

    const userResult = await query(
      `
        SELECT id, role, email, phone_normalized, name, password_hash, created_at
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [loginId]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const user = userResult.rows[0];
    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const token = signAccessToken(user);
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/auth/logout', requireAuth, async (req, res) => {
  try {
    await revokeAccessToken(req.auth);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, role, email, phone_normalized, name, created_at
        FROM users
        WHERE id = $1
      `,
      [req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    return res.json({ user: toPublicUser(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.patch('/api/v1/users/me/profile', requireAuth, async (req, res) => {
  try {
    const hasName = req.body?.name !== undefined;
    const hasPhone = req.body?.phone !== undefined;
    if (!hasName && !hasPhone) {
      return res.status(400).json({ error: 'at least one of name, phone is required' });
    }

    let nextName = null;
    if (hasName) {
      nextName = String(req.body?.name || '').trim();
      if (!nextName) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (nextName.length > 80) {
        return res.status(400).json({ error: 'name must be 80 characters or fewer' });
      }
    }

    let nextPhone = null;
    if (hasPhone) {
      nextPhone = parsePhoneNormalized(req.body?.phone);
      if (!nextPhone) {
        return res.status(400).json({ error: 'phone is invalid' });
      }
    }

    const updated = await query(
      `
        UPDATE users
        SET name = COALESCE($2::text, name),
            phone_normalized = COALESCE($3::text, phone_normalized),
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, role, email, phone_normalized, name, created_at
      `,
      [req.auth.userId, hasName ? nextName : null, hasPhone ? nextPhone : null]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    return res.json({ user: toPublicUser(updated.rows[0]) });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'phone already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.patch('/api/v1/users/me/password', requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' });
    }

    const found = await query(
      `
        SELECT id, password_hash
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [req.auth.userId]
    );
    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    const user = found.rows[0];
    const ok = await bcrypt.compare(currentPassword, String(user.password_hash || ''));
    if (!ok) {
      return res.status(401).json({ error: 'invalid_current_password' });
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await query(
      `
        UPDATE users
        SET password_hash = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [req.auth.userId, nextHash]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/me/availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id,
          weekday,
          start_time_local,
          end_time_local,
          is_active,
          lesson_title,
          lesson_note,
          created_at,
          updated_at
        FROM weekly_availabilities
        WHERE teacher_user_id = $1
        ORDER BY weekday ASC, start_time_local ASC, id ASC
      `,
      [req.auth.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/me/profile', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          teacher_user_id,
          lesson_duration_min,
          timezone,
          cancel_cutoff_hours,
          booking_window_days,
          student_cancel_day_before_hour,
          student_notice,
          display_name,
          bio,
          updated_at
        FROM teacher_profiles
        WHERE teacher_user_id = $1
        LIMIT 1
      `,
      [req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'profile_not_found' });
    }

    return res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.patch('/api/v1/teachers/me/profile', requireAuth, requireTeacher, async (req, res) => {
  try {
    const hasLessonDuration = req.body?.lesson_duration_min !== undefined;
    const hasCancelCutoff = req.body?.cancel_cutoff_hours !== undefined;
    const hasBookingWindow = req.body?.booking_window_days !== undefined;
    const hasTimezone = req.body?.timezone !== undefined;
    const hasStudentCancelDeadline = req.body?.student_cancel_day_before_hour !== undefined;
    const hasStudentNotice = req.body?.student_notice !== undefined;
    const hasDisplayName = req.body?.display_name !== undefined;
    const hasBio = req.body?.bio !== undefined;

    if (
      !hasLessonDuration &&
      !hasCancelCutoff &&
      !hasBookingWindow &&
      !hasTimezone &&
      !hasStudentCancelDeadline &&
      !hasStudentNotice &&
      !hasDisplayName &&
      !hasBio
    ) {
      return res.status(400).json({
        error:
          'at least one of lesson_duration_min, cancel_cutoff_hours, booking_window_days, timezone, student_cancel_day_before_hour, student_notice, display_name, bio is required',
      });
    }

    let lessonDurationMin = null;
    if (hasLessonDuration) {
      lessonDurationMin = parsePositiveInt(req.body.lesson_duration_min);
      if (!lessonDurationMin || lessonDurationMin < 10 || lessonDurationMin > 180 || lessonDurationMin % 5 !== 0) {
        return res.status(400).json({ error: 'lesson_duration_min must be 10~180 and divisible by 5' });
      }
    }

    let cancelCutoffHours = null;
    if (hasCancelCutoff) {
      cancelCutoffHours = parseNonNegativeInt(req.body.cancel_cutoff_hours);
      if (cancelCutoffHours === null || cancelCutoffHours > 336) {
        return res.status(400).json({ error: 'cancel_cutoff_hours must be 0~336' });
      }
    }

    let bookingWindowDays = null;
    if (hasBookingWindow) {
      bookingWindowDays = parsePositiveInt(req.body.booking_window_days);
      if (!bookingWindowDays || bookingWindowDays > 365) {
        return res.status(400).json({ error: 'booking_window_days must be 1~365' });
      }
    }

    let timezone = null;
    if (hasTimezone) {
      timezone = parseTimeZone(req.body.timezone);
      if (!timezone) {
        return res.status(400).json({ error: 'timezone must be a valid IANA timezone (e.g. Asia/Seoul)' });
      }
    }

    let studentCancelDayBeforeHour = null;
    if (hasStudentCancelDeadline) {
      studentCancelDayBeforeHour = parseNonNegativeInt(req.body.student_cancel_day_before_hour);
      if (studentCancelDayBeforeHour === null || studentCancelDayBeforeHour > 23) {
        return res.status(400).json({ error: 'student_cancel_day_before_hour must be 0~23' });
      }
    }

    let studentNotice = null;
    if (hasStudentNotice) {
      studentNotice = String(req.body.student_notice || '').trim() || null;
      if (studentNotice && studentNotice.length > 4000) {
        return res.status(400).json({ error: 'student_notice must be 4000 characters or fewer' });
      }
    }

    let displayName = null;
    if (hasDisplayName) {
      displayName = String(req.body.display_name || '').trim() || null;
      if (displayName && displayName.length > 80) {
        return res.status(400).json({ error: 'display_name must be 80 characters or fewer' });
      }
    }

    let bio = null;
    if (hasBio) {
      bio = String(req.body.bio || '').trim() || null;
      if (bio && bio.length > 2000) {
        return res.status(400).json({ error: 'bio must be 2000 characters or fewer' });
      }
    }

    const updated = await query(
      `
        UPDATE teacher_profiles
        SET lesson_duration_min = COALESCE($2::int, lesson_duration_min),
            cancel_cutoff_hours = COALESCE($3::int, cancel_cutoff_hours),
            booking_window_days = COALESCE($4::int, booking_window_days),
            timezone = COALESCE($5::text, timezone),
            student_cancel_day_before_hour = COALESCE($6::int, student_cancel_day_before_hour),
            student_notice = CASE
              WHEN $7::boolean THEN $8::text
              ELSE student_notice
            END,
            display_name = CASE
              WHEN $9::boolean THEN $10::text
              ELSE display_name
            END,
            bio = CASE
              WHEN $11::boolean THEN $12::text
              ELSE bio
            END,
            updated_at = NOW()
        WHERE teacher_user_id = $1
        RETURNING
          teacher_user_id,
          lesson_duration_min,
          timezone,
          cancel_cutoff_hours,
          booking_window_days,
          student_cancel_day_before_hour,
          student_notice,
          display_name,
          bio,
          updated_at
      `,
      [
        req.auth.userId,
        lessonDurationMin,
        cancelCutoffHours,
        bookingWindowDays,
        timezone,
        studentCancelDayBeforeHour,
        hasStudentNotice,
        studentNotice,
        hasDisplayName,
        displayName,
        hasBio,
        bio,
      ]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'profile_not_found' });
    }

    return res.json({ item: updated.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'availability_duplicate' });
    }
    if (err?.code === '23514' || err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const weekday = Number(req.body?.weekday);
    const startTimeLocal = parseLocalTime(req.body?.start_time_local);
    const endTimeLocal = parseLocalTime(req.body?.end_time_local);
    const lessonTitle = String(req.body?.lesson_title || '').trim() || null;
    const lessonNote = String(req.body?.lesson_note || '').trim() || null;
    const isActiveInput = req.body?.is_active;
    const isActive = isActiveInput === undefined ? true : isActiveInput;

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return res.status(400).json({ error: 'weekday must be an integer between 0 and 6' });
    }
    if (!startTimeLocal || !endTimeLocal) {
      return res.status(400).json({ error: 'start_time_local and end_time_local are required (HH:MM or HH:MM:SS)' });
    }
    if (startTimeLocal >= endTimeLocal) {
      return res.status(400).json({ error: 'start_time_local must be earlier than end_time_local' });
    }
    if (!isAlignedToHalfHour(startTimeLocal) || !isAlignedToHalfHour(endTimeLocal)) {
      return res.status(400).json({ error: 'time_must_align_to_30_min' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be boolean' });
    }

    if (isActive && (await hasAvailabilityConflict(req.auth.userId, weekday, startTimeLocal, endTimeLocal))) {
      return res.status(409).json({ error: 'availability_conflict' });
    }

    const created = await query(
      `
        INSERT INTO weekly_availabilities (
          teacher_user_id, weekday, start_time_local, end_time_local, is_active, lesson_title, lesson_note
        )
        VALUES ($1, $2, $3::time, $4::time, $5, $6, $7)
        RETURNING
          id,
          weekday,
          start_time_local,
          end_time_local,
          is_active,
          lesson_title,
          lesson_note,
          created_at,
          updated_at
      `,
      [req.auth.userId, weekday, startTimeLocal, endTimeLocal, isActive, lessonTitle, lessonNote]
    );
    return res.status(201).json({ item: created.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'availability_duplicate' });
    }
    if (err?.code === '23514' || err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.patch('/api/v1/teachers/me/availability/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const id = parseAvailabilityId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid_id' });
    }

    const found = await query(
      `
        SELECT id, weekday, start_time_local, end_time_local, is_active, lesson_title, lesson_note
        FROM weekly_availabilities
        WHERE id = $1 AND teacher_user_id = $2
        LIMIT 1
      `,
      [id, req.auth.userId]
    );

    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    const current = found.rows[0];
    const nextWeekday =
      req.body?.weekday === undefined ? current.weekday : Number(req.body.weekday);
    const nextStartTimeLocal =
      req.body?.start_time_local === undefined
        ? current.start_time_local
        : parseLocalTime(req.body.start_time_local);
    const nextEndTimeLocal =
      req.body?.end_time_local === undefined
        ? current.end_time_local
        : parseLocalTime(req.body.end_time_local);
    const nextIsActive =
      req.body?.is_active === undefined ? current.is_active : req.body.is_active;
    const nextLessonTitle =
      req.body?.lesson_title === undefined ? current.lesson_title : String(req.body.lesson_title || '').trim() || null;
    const nextLessonNote =
      req.body?.lesson_note === undefined ? current.lesson_note : String(req.body.lesson_note || '').trim() || null;

    if (!Number.isInteger(nextWeekday) || nextWeekday < 0 || nextWeekday > 6) {
      return res.status(400).json({ error: 'weekday must be an integer between 0 and 6' });
    }
    if (!nextStartTimeLocal || !nextEndTimeLocal) {
      return res.status(400).json({ error: 'start_time_local and end_time_local are required (HH:MM or HH:MM:SS)' });
    }
    if (nextStartTimeLocal >= nextEndTimeLocal) {
      return res.status(400).json({ error: 'start_time_local must be earlier than end_time_local' });
    }
    if (!isAlignedToHalfHour(nextStartTimeLocal) || !isAlignedToHalfHour(nextEndTimeLocal)) {
      return res.status(400).json({ error: 'time_must_align_to_30_min' });
    }
    if (typeof nextIsActive !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be boolean' });
    }

    if (
      nextIsActive &&
      (await hasAvailabilityConflict(req.auth.userId, nextWeekday, nextStartTimeLocal, nextEndTimeLocal, id))
    ) {
      return res.status(409).json({ error: 'availability_conflict' });
    }

    const updated = await query(
      `
        UPDATE weekly_availabilities
        SET weekday = $3,
            start_time_local = $4::time,
            end_time_local = $5::time,
            is_active = $6,
            lesson_title = $7,
            lesson_note = $8,
            updated_at = NOW()
        WHERE id = $1 AND teacher_user_id = $2
        RETURNING
          id,
          weekday,
          start_time_local,
          end_time_local,
          is_active,
          lesson_title,
          lesson_note,
          created_at,
          updated_at
      `,
      [id, req.auth.userId, nextWeekday, nextStartTimeLocal, nextEndTimeLocal, nextIsActive, nextLessonTitle, nextLessonNote]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'one_time_availability_duplicate' });
    }
    if (err?.code === '23514' || err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.delete('/api/v1/teachers/me/availability/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const id = parseAvailabilityId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid_id' });
    }

    const deleted = await query(
      `
        DELETE FROM weekly_availabilities
        WHERE id = $1 AND teacher_user_id = $2
        RETURNING id
      `,
      [id, req.auth.userId]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/me/one-time-availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id,
          date_local::text AS date_local,
          start_time_local,
          end_time_local,
          is_active,
          lesson_title,
          lesson_note,
          created_at,
          updated_at
        FROM one_time_availabilities
        WHERE teacher_user_id = $1
        ORDER BY date_local ASC, start_time_local ASC, id ASC
      `,
      [req.auth.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/one-time-availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const dateLocal = parseLocalDate(req.body?.date_local);
    const startTimeLocal = parseLocalTime(req.body?.start_time_local);
    const endTimeLocal = parseLocalTime(req.body?.end_time_local);
    const lessonTitle = String(req.body?.lesson_title || '').trim() || null;
    const lessonNote = String(req.body?.lesson_note || '').trim() || null;
    const isActiveInput = req.body?.is_active;
    const isActive = isActiveInput === undefined ? true : isActiveInput;

    if (!dateLocal) {
      return res.status(400).json({ error: 'date_local is required (YYYY-MM-DD)' });
    }
    if (!startTimeLocal || !endTimeLocal) {
      return res.status(400).json({ error: 'start_time_local and end_time_local are required (HH:MM or HH:MM:SS)' });
    }
    if (startTimeLocal >= endTimeLocal) {
      return res.status(400).json({ error: 'start_time_local must be earlier than end_time_local' });
    }
    if (!isAlignedToHalfHour(startTimeLocal) || !isAlignedToHalfHour(endTimeLocal)) {
      return res.status(400).json({ error: 'time_must_align_to_30_min' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be boolean' });
    }

    if (isActive && (await hasOneTimeAvailabilityConflict(req.auth.userId, dateLocal, startTimeLocal, endTimeLocal))) {
      return res.status(409).json({ error: 'one_time_availability_conflict' });
    }
    if (await hasExceptionConflict(req.auth.userId, dateLocal, startTimeLocal, endTimeLocal)) {
      return res.status(409).json({ error: 'exception_conflict' });
    }

    const created = await query(
      `
        INSERT INTO one_time_availabilities (
          teacher_user_id, date_local, start_time_local, end_time_local, is_active, lesson_title, lesson_note
        )
        VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7)
        RETURNING
          id,
          date_local::text AS date_local,
          start_time_local,
          end_time_local,
          is_active,
          lesson_title,
          lesson_note,
          created_at,
          updated_at
      `,
      [req.auth.userId, dateLocal, startTimeLocal, endTimeLocal, isActive, lessonTitle, lessonNote]
    );
    return res.status(201).json({ item: created.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'exception_duplicate' });
    }
    if (err?.code === '23514' || err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.delete('/api/v1/teachers/me/one-time-availability/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const id = parseAvailabilityId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid_id' });
    }

    const deleted = await query(
      `
        DELETE FROM one_time_availabilities
        WHERE id = $1 AND teacher_user_id = $2
        RETURNING id
      `,
      [id, req.auth.userId]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/me/exceptions', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, date_local::text AS date_local, start_time_local, end_time_local, reason, created_at, updated_at
        FROM availability_exceptions
        WHERE teacher_user_id = $1
        ORDER BY date_local ASC, start_time_local ASC NULLS FIRST, id ASC
      `,
      [req.auth.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/exceptions', requireAuth, requireTeacher, async (req, res) => {
  try {
    const dateLocal = parseLocalDate(req.body?.date_local);
    const hasStart = req.body?.start_time_local !== undefined && req.body?.start_time_local !== null;
    const hasEnd = req.body?.end_time_local !== undefined && req.body?.end_time_local !== null;
    const reason = String(req.body?.reason || '').trim() || null;

    if (!dateLocal) {
      return res.status(400).json({ error: 'date_local is required (YYYY-MM-DD)' });
    }
    if (hasStart !== hasEnd) {
      return res.status(400).json({ error: 'start_time_local and end_time_local must be provided together' });
    }

    let startTimeLocal = null;
    let endTimeLocal = null;
    if (hasStart && hasEnd) {
      startTimeLocal = parseLocalTime(req.body.start_time_local);
      endTimeLocal = parseLocalTime(req.body.end_time_local);
      if (!startTimeLocal || !endTimeLocal) {
        return res.status(400).json({ error: 'start_time_local and end_time_local must be HH:MM or HH:MM:SS' });
      }
      if (startTimeLocal >= endTimeLocal) {
        return res.status(400).json({ error: 'start_time_local must be earlier than end_time_local' });
      }
      if (!isAlignedToHalfHour(startTimeLocal) || !isAlignedToHalfHour(endTimeLocal)) {
        return res.status(400).json({ error: 'time_must_align_to_30_min' });
      }
    }

    if (await hasExceptionConflict(req.auth.userId, dateLocal, startTimeLocal, endTimeLocal)) {
      return res.status(409).json({ error: 'exception_conflict' });
    }

    const inserted = await query(
      `
        INSERT INTO availability_exceptions (
          teacher_user_id, date_local, start_time_local, end_time_local, reason
        )
        VALUES ($1, $2::date, $3::time, $4::time, $5)
        RETURNING id, date_local::text AS date_local, start_time_local, end_time_local, reason, created_at, updated_at
      `,
      [req.auth.userId, dateLocal, startTimeLocal, endTimeLocal, reason]
    );
    return res.status(201).json({ item: inserted.rows[0] });
  } catch (err) {
    if (err?.code === '23514' || err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_request' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.delete('/api/v1/teachers/me/exceptions/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const id = parseAvailabilityId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid_id' });
    }

    const deleted = await query(
      `
        DELETE FROM availability_exceptions
        WHERE id = $1 AND teacher_user_id = $2
        RETURNING id
      `,
      [id, req.auth.userId]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          u.id,
          COALESCE(NULLIF(tp.display_name, ''), u.name) AS name,
          u.email,
          tp.lesson_duration_min,
          tp.timezone,
          tp.cancel_cutoff_hours,
          tp.booking_window_days,
          tp.student_cancel_day_before_hour,
          tp.student_notice,
          tp.bio
        FROM users u
        JOIN teacher_profiles tp ON tp.teacher_user_id = u.id
        ORDER BY u.id ASC
      `
    );
    const isAuthenticated = Boolean(req.auth?.userId);
    const items = (result.rows || []).map((row) => {
      if (isAuthenticated) return row;
      return {
        id: row.id,
        name: row.name,
        lesson_duration_min: row.lesson_duration_min,
        timezone: row.timezone,
        cancel_cutoff_hours: row.cancel_cutoff_hours,
        booking_window_days: row.booking_window_days,
        student_cancel_day_before_hour: row.student_cancel_day_before_hour,
        student_notice: row.student_notice,
        bio: row.bio,
      };
    });
    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/:teacherId/slots', optionalAuth, async (req, res) => {
  try {
    const teacherUserId = parsePositiveInt(req.params.teacherId);
    const fromIso = parseDateTime(req.query.from);
    const toIso = parseDateTime(req.query.to);
    const requestedStepMin = parsePositiveInt(req.query.step_min);
    const slotStepMin = requestedStepMin || 30;

    if (!teacherUserId) {
      return res.status(400).json({ error: 'invalid_teacher_id' });
    }
    if (!fromIso || !toIso) {
      return res.status(400).json({ error: 'from and to are required (ISO datetime)' });
    }
    if (![10, 15, 30, 60].includes(slotStepMin)) {
      return res.status(400).json({ error: 'step_min must be one of 10, 15, 30, 60' });
    }

    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);
    if (fromDate.getTime() >= toDate.getTime()) {
      return res.status(400).json({ error: 'from must be earlier than to' });
    }
    if (toDate.getTime() - fromDate.getTime() > 1000 * 60 * 60 * 24 * 45) {
      return res.status(400).json({ error: 'query range is too large (max 45 days)' });
    }

    const profile = await getTeacherProfileById(teacherUserId);
    if (!profile) {
      return res.status(404).json({ error: 'teacher_not_found' });
    }

    const slotsResult = await query(
      `
        WITH day_series AS (
          SELECT generate_series(
            ($2::timestamptz AT TIME ZONE $4)::date::timestamp,
            ($3::timestamptz AT TIME ZONE $4)::date::timestamp,
            interval '1 day'
          ) AS day_local
        ),
        weekly_slots AS (
          SELECT
            make_timestamptz(
              extract(year FROM d.day_local)::int,
              extract(month FROM d.day_local)::int,
              extract(day FROM d.day_local)::int,
              extract(hour FROM wa.start_time_local)::int,
              extract(minute FROM wa.start_time_local)::int,
              extract(second FROM wa.start_time_local),
              $4
            ) AS start_at,
            make_timestamptz(
              extract(year FROM d.day_local)::int,
              extract(month FROM d.day_local)::int,
              extract(day FROM d.day_local)::int,
              extract(hour FROM wa.end_time_local)::int,
              extract(minute FROM wa.end_time_local)::int,
              extract(second FROM wa.end_time_local),
              $4
            ) AS end_at,
            wa.lesson_title,
            wa.lesson_note,
            1 AS source_priority
          FROM day_series d
          JOIN weekly_availabilities wa
            ON wa.teacher_user_id = $1
           AND wa.is_active = TRUE
           AND wa.weekday = extract(dow FROM d.day_local)::int
        ),
        one_time_slots AS (
          SELECT
            make_timestamptz(
              extract(year FROM ota.date_local)::int,
              extract(month FROM ota.date_local)::int,
              extract(day FROM ota.date_local)::int,
              extract(hour FROM ota.start_time_local)::int,
              extract(minute FROM ota.start_time_local)::int,
              extract(second FROM ota.start_time_local),
              $4
            ) AS start_at,
            make_timestamptz(
              extract(year FROM ota.date_local)::int,
              extract(month FROM ota.date_local)::int,
              extract(day FROM ota.date_local)::int,
              extract(hour FROM ota.end_time_local)::int,
              extract(minute FROM ota.end_time_local)::int,
              extract(second FROM ota.end_time_local),
              $4
            ) AS end_at,
            ota.lesson_title,
            ota.lesson_note,
            2 AS source_priority
          FROM one_time_availabilities ota
          WHERE ota.teacher_user_id = $1
            AND ota.is_active = TRUE
            AND ota.date_local >= ($2::timestamptz AT TIME ZONE $4)::date
            AND ota.date_local <= ($3::timestamptz AT TIME ZONE $4)::date
        ),
        raw_slots AS (
          SELECT * FROM weekly_slots
          UNION ALL
          SELECT * FROM one_time_slots
        ),
        filtered_slots AS (
          SELECT
            r.start_at,
            r.end_at,
            extract(epoch FROM (r.end_at - r.start_at))::int / 60 AS duration_min,
            r.lesson_title,
            r.lesson_note,
            r.source_priority
          FROM raw_slots r
          WHERE r.start_at >= $2::timestamptz
            AND r.start_at < $3::timestamptz
            AND r.end_at > r.start_at
            AND r.start_at >= NOW()
            AND r.start_at <= NOW() + make_interval(days => $5::int)
            AND NOT EXISTS (
              SELECT 1
              FROM availability_exceptions ex
              WHERE ex.teacher_user_id = $1
                AND ex.date_local = (r.start_at AT TIME ZONE $4)::date
                AND (
                  (ex.start_time_local IS NULL AND ex.end_time_local IS NULL)
                  OR (
                    r.start_at <
                      make_timestamptz(
                        extract(year FROM ex.date_local)::int,
                        extract(month FROM ex.date_local)::int,
                        extract(day FROM ex.date_local)::int,
                        extract(hour FROM ex.end_time_local)::int,
                        extract(minute FROM ex.end_time_local)::int,
                        extract(second FROM ex.end_time_local),
                        $4
                      )
                    AND
                    r.end_at >
                      make_timestamptz(
                        extract(year FROM ex.date_local)::int,
                        extract(month FROM ex.date_local)::int,
                        extract(day FROM ex.date_local)::int,
                        extract(hour FROM ex.start_time_local)::int,
                        extract(minute FROM ex.start_time_local)::int,
                        extract(second FROM ex.start_time_local),
                        $4
                      )
                  )
                )
            )
        ),
        dedup_slots AS (
          SELECT DISTINCT ON (start_at)
            start_at,
            end_at,
            duration_min,
            lesson_title,
            lesson_note
          FROM filtered_slots
          ORDER BY start_at ASC, source_priority DESC, end_at DESC
        )
        SELECT
          d.start_at,
          d.end_at,
          d.duration_min,
          d.lesson_title,
          d.lesson_note,
          (b.id IS NULL) AS is_available
        FROM dedup_slots d
        LEFT JOIN bookings b
          ON b.teacher_user_id = $1
         AND b.start_at = d.start_at
         AND (
           b.status IN ('PENDING', 'BOOKED')
           OR (
             b.status = 'COMPLETED'
             AND (b.start_at + make_interval(mins => b.duration_min)) > NOW()
           )
         )
        ORDER BY d.start_at ASC
      `,
      [teacherUserId, fromIso, toIso, profile.timezone, profile.booking_window_days]
    );

    return res.json({
      teacher_user_id: String(teacherUserId),
      timezone: profile.timezone,
      duration_min: profile.lesson_duration_min,
      default_duration_min: profile.lesson_duration_min,
      student_cancel_day_before_hour: profile.student_cancel_day_before_hour,
      student_notice: profile.student_notice,
      step_min: slotStepMin,
      items: slotsResult.rows,
    });
  } catch (err) {
    if (err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_datetime' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/bookings', requireAuth, requireStudent, async (req, res) => {
  try {
    const startAtIso = parseDateTime(req.body?.start_at);
    if (!startAtIso) {
      return res.status(400).json({ error: 'start_at is required (ISO datetime)' });
    }

    const teacherResolve = await resolveTeacherUserIdForBooking(req.body?.teacher_user_id);
    if (teacherResolve.error) {
      return res.status(400).json({ error: teacherResolve.error });
    }
    const teacherUserId = teacherResolve.teacherUserId;

    const profile = await getTeacherProfileById(teacherUserId);
    if (!profile) {
      return res.status(404).json({ error: 'teacher_not_found' });
    }

    const hasDurationInput = req.body?.duration_min !== undefined && req.body?.duration_min !== null;
    const requestedDurationMin = hasDurationInput ? parsePositiveInt(req.body.duration_min) : null;
    if (hasDurationInput) {
      if (
        !requestedDurationMin ||
        requestedDurationMin < 10 ||
        requestedDurationMin > 180 ||
        requestedDurationMin % 5 !== 0
      ) {
        return res.status(400).json({ error: 'duration_min must be 10~180 and divisible by 5' });
      }
    }

    const startAt = new Date(startAtIso);
    const now = new Date();
    const maxAllowed = new Date(now.getTime() + Number(profile.booking_window_days) * 24 * 60 * 60 * 1000);
    if (startAt.getTime() < now.getTime()) {
      return res.status(422).json({ error: 'start_at_in_past' });
    }
    if (startAt.getTime() > maxAllowed.getTime()) {
      return res.status(422).json({ error: 'start_at_exceeds_booking_window' });
    }

    const bookableSlot = await getBookableSlotAt(teacherUserId, startAtIso, profile.timezone);
    if (!bookableSlot) {
      return res.status(422).json({ error: 'slot_not_available' });
    }
    const slotDurationMin = Number(bookableSlot.duration_min);
    if (!Number.isInteger(slotDurationMin) || slotDurationMin <= 0) {
      return res.status(500).json({ error: 'invalid_slot_duration' });
    }
    if (requestedDurationMin && requestedDurationMin !== slotDurationMin) {
      return res.status(422).json({ error: 'duration_min_mismatch' });
    }

    const created = await query(
      `
        INSERT INTO bookings (
          teacher_user_id, student_user_id, lesson_title_snapshot, start_at, duration_min, status
        )
        VALUES ($1, $2, $3, $4::timestamptz, $5, 'PENDING')
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          lesson_title_snapshot AS lesson_title,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [teacherUserId, req.auth.userId, String(bookableSlot.lesson_title || '').trim() || null, startAtIso, slotDurationMin]
    );

    return res.status(201).json({ item: created.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'slot_already_booked' });
    }
    if (err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_datetime' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/public/bookings', publicBookingLimiter, async (req, res) => {
  return res.status(410).json({ error: 'guest_booking_disabled' });
  try {
    const startAtIso = parseDateTime(req.body?.start_at);
    if (!startAtIso) {
      return res.status(400).json({ error: 'start_at is required (ISO datetime)' });
    }
    const studentName = String(req.body?.student_name || '').trim();
    if (!studentName) {
      return res.status(400).json({ error: 'student_name is required' });
    }
    if (studentName.length > 80) {
      return res.status(400).json({ error: 'student_name must be 80 characters or less' });
    }
    const phoneNormalized = parsePhoneNormalized(req.body?.phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: 'phone is invalid' });
    }
    const pin4 = parsePin4(req.body?.pin);
    if (!pin4) {
      return res.status(400).json({ error: 'pin must be 4 digits' });
    }

    const teacherResolve = await resolveTeacherUserIdForBooking(req.body?.teacher_user_id);
    if (teacherResolve.error) {
      return res.status(400).json({ error: teacherResolve.error });
    }
    const teacherUserId = teacherResolve.teacherUserId;

    const profile = await getTeacherProfileById(teacherUserId);
    if (!profile) {
      return res.status(404).json({ error: 'teacher_not_found' });
    }

    const hasDurationInput = req.body?.duration_min !== undefined && req.body?.duration_min !== null;
    const requestedDurationMin = hasDurationInput ? parsePositiveInt(req.body.duration_min) : null;
    if (hasDurationInput) {
      if (
        !requestedDurationMin ||
        requestedDurationMin < 10 ||
        requestedDurationMin > 180 ||
        requestedDurationMin % 5 !== 0
      ) {
        return res.status(400).json({ error: 'duration_min must be 10~180 and divisible by 5' });
      }
    }

    const startAt = new Date(startAtIso);
    const now = new Date();
    const maxAllowed = new Date(now.getTime() + Number(profile.booking_window_days) * 24 * 60 * 60 * 1000);
    if (startAt.getTime() < now.getTime()) {
      return res.status(422).json({ error: 'start_at_in_past' });
    }
    if (startAt.getTime() > maxAllowed.getTime()) {
      return res.status(422).json({ error: 'start_at_exceeds_booking_window' });
    }

    const bookableSlot = await getBookableSlotAt(teacherUserId, startAtIso, profile.timezone);
    if (!bookableSlot) {
      return res.status(422).json({ error: 'slot_not_available' });
    }
    const slotDurationMin = Number(bookableSlot.duration_min);
    if (!Number.isInteger(slotDurationMin) || slotDurationMin <= 0) {
      return res.status(500).json({ error: 'invalid_slot_duration' });
    }
    if (requestedDurationMin && requestedDurationMin !== slotDurationMin) {
      return res.status(422).json({ error: 'duration_min_mismatch' });
    }

    const guestResolve = await resolveGuestStudentIdentity({
      studentName,
      phoneNormalized,
      pin4,
    });
    if (guestResolve.error) {
      if (guestResolve.error === 'guest_pin_locked') {
        return res.status(423).json({
          error: 'guest_pin_locked',
          retry_after_sec: guestResolve.retryAfterSec || null,
          locked_until: guestResolve.lockedUntil || null,
        });
      }
      return res.status(401).json({ error: 'invalid_guest_credentials' });
    }
    const guestStudentId = Number(guestResolve.guest.id);

    const created = await query(
      `
        INSERT INTO bookings (
          teacher_user_id, student_user_id, guest_student_id, guest_student_name, start_at, duration_min, status
        )
        VALUES ($1, NULL, $2, $3, $4::timestamptz, $5, 'PENDING')
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          guest_student_id,
          guest_student_name,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [teacherUserId, guestStudentId, studentName, startAtIso, slotDurationMin]
    );
    const item = created.rows[0];
    const { token, expiresAt } = await issuePublicAccessTokenForBooking(item.id);
    const manageUrl = buildPublicManageUrl(req, item.id, token);

    return res.status(201).json({
      item: {
        ...item,
        student_name: item.guest_student_name || studentName,
        is_guest_student: true,
        guest_phone: phoneNormalized,
      },
      public_access: {
        token,
        expires_at: expiresAt,
        manage_url: manageUrl,
      },
    });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'slot_already_booked' });
    }
    if (err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_datetime' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/public/bookings/lookup', publicBookingLimiter, async (req, res) => {
  return res.status(410).json({ error: 'guest_booking_disabled' });
  try {
    const phoneNormalized = parsePhoneNormalized(req.body?.phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: 'phone is invalid' });
    }
    const pin4 = parsePin4(req.body?.pin);
    if (!pin4) {
      return res.status(400).json({ error: 'pin must be 4 digits' });
    }

    const guest = await findGuestStudentByPhone(phoneNormalized);
    if (!guest) {
      return res.status(401).json({ error: 'invalid_guest_credentials' });
    }
    const pinCheck = await verifyGuestPinOrTrack(guest, pin4);
    if (!pinCheck.ok) {
      if (pinCheck.error === 'guest_pin_locked') {
        return res.status(423).json({
          error: 'guest_pin_locked',
          retry_after_sec: pinCheck.retryAfterSec || null,
          locked_until: pinCheck.lockedUntil || null,
        });
      }
      return res.status(401).json({ error: 'invalid_guest_credentials' });
    }

    await autoCompletePastBookings({ guestStudentId: Number(guest.id) });

    const result = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.lesson_title_snapshot AS lesson_title,
          b.guest_student_id,
          b.guest_student_name,
          b.start_at,
          (b.start_at + make_interval(mins => b.duration_min)) AS end_at,
          b.duration_min,
          b.status,
          b.completed_at,
          b.teacher_private_comment,
          COALESCE(b.student_comment, b.teacher_comment) AS student_comment,
          b.canceled_at,
          b.cancel_reason,
          b.created_at,
          b.updated_at,
          t.name AS teacher_name,
          t.email AS teacher_email
        FROM bookings b
        JOIN users t ON t.id = b.teacher_user_id
        WHERE b.guest_student_id = $1
        ORDER BY b.start_at DESC
      `,
      [guest.id]
    );

    const items = [];
    for (const row of result.rows) {
      const isManageActive = ['PENDING', 'BOOKED', 'COMPLETED'].includes(String(row.status || ''));
      let publicAccess = null;
      if (isManageActive) {
        const issued = await issuePublicAccessTokenForBooking(row.id);
        publicAccess = {
          token: issued.token,
          expires_at: issued.expiresAt,
          manage_url: buildPublicManageUrl(req, row.id, issued.token),
        };
      }
      items.push({
        ...row,
        student_name: row.guest_student_name || guest.contact_name || '비회원',
        is_guest_student: true,
        guest_phone: phoneNormalized,
        public_access: publicAccess,
      });
    }

    return res.json({
      guest: {
        id: String(guest.id),
        phone: phoneNormalized,
        contact_name: guest.contact_name,
      },
      items,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/public/bookings/:id/cancel', publicBookingLimiter, async (req, res) => {
  return res.status(410).json({ error: 'guest_booking_disabled' });
  try {
    await autoCompletePastBookings();

    const bookingId = parsePositiveInt(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }
    const phoneNormalized = parsePhoneNormalized(req.body?.phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: 'phone is invalid' });
    }
    const pin4 = parsePin4(req.body?.pin);
    if (!pin4) {
      return res.status(400).json({ error: 'pin must be 4 digits' });
    }

    const found = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.lesson_title_snapshot AS lesson_title,
          b.guest_student_id,
          b.start_at,
          b.duration_min,
          b.status,
          tp.timezone,
          tp.student_cancel_day_before_hour,
          make_timestamptz(
            extract(year FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            extract(month FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            extract(day FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            tp.student_cancel_day_before_hour,
            0,
            0,
            tp.timezone
          ) AS student_cancel_deadline_at,
          gs.phone_normalized,
          gs.pin_hash,
          gs.pin_failed_attempts,
          gs.pin_locked_until
        FROM bookings b
        JOIN teacher_profiles tp ON tp.teacher_user_id = b.teacher_user_id
        LEFT JOIN guest_students gs ON gs.id = b.guest_student_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );
    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'booking_not_found' });
    }
    const booking = found.rows[0];
    if (!booking.guest_student_id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (String(booking.phone_normalized || '') !== phoneNormalized) {
      return res.status(401).json({ error: 'invalid_guest_credentials' });
    }
    const pinCheck = await verifyGuestPinOrTrack(booking, pin4);
    if (!pinCheck.ok) {
      if (pinCheck.error === 'guest_pin_locked') {
        return res.status(423).json({
          error: 'guest_pin_locked',
          retry_after_sec: pinCheck.retryAfterSec || null,
          locked_until: pinCheck.lockedUntil || null,
        });
      }
      return res.status(401).json({ error: 'invalid_guest_credentials' });
    }
    if (!['PENDING', 'BOOKED'].includes(String(booking.status || ''))) {
      return res.status(409).json({ error: 'booking_not_active' });
    }

    if (isCancelDeadlinePassed(booking.student_cancel_deadline_at)) {
      return res.status(422).json({ error: 'cancel_cutoff_passed' });
    }

    const reason = String(req.body?.reason || '').trim();
    if (GUEST_CANCEL_REASON_REQUIRED && !reason) {
      return res.status(400).json({ error: 'cancel_reason is required' });
    }
    const updated = await query(
      `
        UPDATE bookings
        SET status = 'CANCELED_BY_STUDENT',
            canceled_at = NOW(),
            cancel_reason = $2,
            public_access_revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          guest_student_id,
          guest_student_name,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [bookingId, reason]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/public/bookings/:id/cancel-by-token', publicBookingLimiter, async (req, res) => {
  return res.status(410).json({ error: 'guest_booking_disabled' });
  try {
    await autoCompletePastBookings();

    const bookingId = parsePositiveInt(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const booking = await getGuestBookingByToken(bookingId, token);
    if (!booking) {
      return res.status(401).json({ error: 'invalid_public_access_token' });
    }
    if (!['PENDING', 'BOOKED'].includes(String(booking.status || ''))) {
      return res.status(409).json({ error: 'booking_not_active' });
    }
    if (isCancelDeadlinePassed(booking.student_cancel_deadline_at)) {
      return res.status(422).json({ error: 'cancel_cutoff_passed' });
    }

    const reason = String(req.body?.reason || '').trim();
    if (GUEST_CANCEL_REASON_REQUIRED && !reason) {
      return res.status(400).json({ error: 'cancel_reason is required' });
    }
    const updated = await query(
      `
        UPDATE bookings
        SET status = 'CANCELED_BY_STUDENT',
            canceled_at = NOW(),
            cancel_reason = $2,
            public_access_revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          guest_student_id,
          guest_student_name,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [bookingId, reason]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/bookings/me', requireAuth, requireStudent, async (req, res) => {
  try {
    await autoCompletePastBookings({ studentUserId: req.auth.userId });

    const result = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.lesson_title_snapshot AS lesson_title,
          b.start_at,
          (b.start_at + make_interval(mins => b.duration_min)) AS end_at,
          b.duration_min,
          b.status,
          b.completed_at,
          COALESCE(b.student_comment, b.teacher_comment) AS student_comment,
          b.canceled_at,
          b.cancel_reason,
          b.created_at,
          b.updated_at,
          t.name AS teacher_name,
          t.email AS teacher_email
        FROM bookings b
        JOIN users t ON t.id = b.teacher_user_id
        WHERE b.student_user_id = $1
        ORDER BY b.start_at DESC
      `,
      [req.auth.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/bookings', requireAuth, requireTeacher, async (req, res) => {
  try {
    const startAtIso = parseDateTime(req.body?.start_at);
    if (!startAtIso) {
      return res.status(400).json({ error: 'start_at is required (ISO datetime)' });
    }

    const profile = await getTeacherProfileById(req.auth.userId);
    if (!profile) {
      return res.status(404).json({ error: 'teacher_not_found' });
    }

    const bookableSlot = await getBookableSlotAt(req.auth.userId, startAtIso, profile.timezone);
    if (!bookableSlot) {
      return res.status(422).json({ error: 'slot_not_available' });
    }
    const slotDurationMin = Number(bookableSlot.duration_min);
    if (!Number.isInteger(slotDurationMin) || slotDurationMin <= 0) {
      return res.status(500).json({ error: 'invalid_slot_duration' });
    }

    if (req.body?.student_name !== undefined || req.body?.phone !== undefined || req.body?.pin !== undefined) {
      return res.status(410).json({ error: 'guest_student_booking_disabled' });
    }

    const studentUserIdInput = parsePositiveInt(req.body?.student_user_id);
    const studentEmailInput = String(req.body?.student_email || '')
      .trim()
      .toLowerCase();
    if (!studentUserIdInput && !studentEmailInput) {
      return res.status(400).json({ error: 'student_user_id or student_email is required' });
    }

    const studentResult = await query(
      `
        SELECT id, email, name
        FROM users
        WHERE role = 'STUDENT'
          AND (
            ($1::bigint IS NOT NULL AND id = $1)
            OR ($2::text <> '' AND email = $2)
          )
        ORDER BY id ASC
        LIMIT 1
      `,
      [studentUserIdInput || null, studentEmailInput]
    );
    if (studentResult.rowCount === 0) {
      return res.status(404).json({ error: 'student_not_found' });
    }

    const student = studentResult.rows[0];
    const created = await query(
      `
        INSERT INTO bookings (
          teacher_user_id, student_user_id, lesson_title_snapshot, start_at, duration_min, status
        )
        VALUES ($1, $2, $3, $4::timestamptz, $5, 'BOOKED')
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          lesson_title_snapshot AS lesson_title,
          guest_student_id,
          guest_student_name,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [req.auth.userId, student.id, String(bookableSlot.lesson_title || '').trim() || null, startAtIso, slotDurationMin]
    );

    return res.status(201).json({
      item: {
        ...created.rows[0],
        student_name: student.name,
        student_email: student.email,
        is_guest_student: false,
      },
    });
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'slot_already_booked' });
    }
    if (err?.code === '22007' || err?.code === '22P02') {
      return res.status(400).json({ error: 'invalid_datetime' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/me/bookings', requireAuth, requireTeacher, async (req, res) => {
  try {
    await autoCompletePastBookings({ teacherUserId: req.auth.userId });

    const result = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.lesson_title_snapshot AS lesson_title,
          b.guest_student_id,
          b.start_at,
          (b.start_at + make_interval(mins => b.duration_min)) AS end_at,
          b.duration_min,
          b.status,
          b.completed_at,
          b.teacher_private_comment,
          COALESCE(b.student_comment, b.teacher_comment) AS student_comment,
          b.canceled_at,
          b.cancel_reason,
          b.created_at,
          b.updated_at,
          COALESCE(su.name, b.guest_student_name, gs.contact_name, '비회원') AS student_name,
          su.email AS student_email,
          (b.guest_student_id IS NOT NULL) AS is_guest_student,
          gs.phone_normalized AS guest_phone
        FROM bookings b
        LEFT JOIN users su ON su.id = b.student_user_id
        LEFT JOIN guest_students gs ON gs.id = b.guest_student_id
        WHERE b.teacher_user_id = $1
        ORDER BY b.start_at DESC
      `,
      [req.auth.userId]
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/bookings/:id/approve', requireAuth, requireTeacher, async (req, res) => {
  try {
    const bookingId = parsePositiveInt(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }

    const updated = await query(
      `
        UPDATE bookings
        SET status = 'BOOKED',
            updated_at = NOW()
        WHERE id = $1
          AND teacher_user_id = $2
          AND status = 'PENDING'
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [bookingId, req.auth.userId]
    );

    if (updated.rowCount === 0) {
      const found = await query(
        `
          SELECT id, teacher_user_id, status
          FROM bookings
          WHERE id = $1
          LIMIT 1
        `,
        [bookingId]
      );
      if (found.rowCount === 0) {
        return res.status(404).json({ error: 'booking_not_found' });
      }
      const row = found.rows[0];
      if (Number(row.teacher_user_id) !== Number(req.auth.userId)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      return res.status(409).json({ error: 'booking_not_pending' });
    }

    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/bookings/:id/complete', requireAuth, requireTeacher, async (req, res) => {
  try {
    const bookingId = parsePositiveInt(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }

    const target = await query(
      `
        SELECT id, teacher_user_id, status
        FROM bookings
        WHERE id = $1
        LIMIT 1
      `,
      [bookingId]
    );
    if (target.rowCount === 0) {
      return res.status(404).json({ error: 'booking_not_found' });
    }
    const targetRow = target.rows[0];
    if (Number(targetRow.teacher_user_id) !== Number(req.auth.userId)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const currentStatus = String(targetRow.status || '');
    if (!['PENDING', 'BOOKED', 'COMPLETED'].includes(currentStatus)) {
      return res.status(409).json({ error: 'booking_not_completable' });
    }

    const hasTeacherPrivateCommentInput = req.body?.teacher_private_comment !== undefined;
    const hasStudentCommentInput = req.body?.student_comment !== undefined || req.body?.teacher_comment !== undefined;
    const teacherPrivateComment = hasTeacherPrivateCommentInput
      ? String(req.body?.teacher_private_comment || '').trim()
      : null;
    const studentComment = hasStudentCommentInput
      ? String((req.body?.student_comment ?? req.body?.teacher_comment) || '').trim()
      : null;

    const isAlreadyCompleted = currentStatus === 'COMPLETED';
    if (isAlreadyCompleted) {
      if (!hasTeacherPrivateCommentInput && !hasStudentCommentInput) {
        return res.status(400).json({ error: 'at_least_one_comment_is_required' });
      }
      if (hasTeacherPrivateCommentInput && !teacherPrivateComment) {
        return res.status(400).json({ error: 'teacher_private_comment is required' });
      }
      if (hasStudentCommentInput && !studentComment) {
        return res.status(400).json({ error: 'student_comment is required' });
      }
    } else {
      if (
        REQUIRE_TEACHER_PRIVATE_COMMENT_ON_COMPLETE &&
        (!hasTeacherPrivateCommentInput || !teacherPrivateComment)
      ) {
        return res.status(400).json({ error: 'teacher_private_comment is required' });
      }
      if (REQUIRE_STUDENT_COMMENT_ON_COMPLETE && (!hasStudentCommentInput || !studentComment)) {
        return res.status(400).json({ error: 'student_comment is required' });
      }
    }

    const updated = await query(
      `
        UPDATE bookings
        SET status = 'COMPLETED',
            completed_at = COALESCE(completed_at, NOW()),
            teacher_private_comment = CASE
              WHEN $3::text IS NULL THEN teacher_private_comment
              ELSE $3::text
            END,
            student_comment = CASE
              WHEN $4::text IS NULL THEN student_comment
              ELSE $4::text
            END,
            teacher_comment = CASE
              WHEN $4::text IS NULL THEN teacher_comment
              ELSE $4::text
            END,
            updated_at = NOW()
        WHERE id = $1
          AND teacher_user_id = $2
          AND status IN ('PENDING', 'BOOKED', 'COMPLETED')
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [
        bookingId,
        req.auth.userId,
        hasTeacherPrivateCommentInput ? teacherPrivateComment : null,
        hasStudentCommentInput ? studentComment : null,
      ]
    );

    if (updated.rowCount === 0) {
      const found = await query(
        `
          SELECT id, teacher_user_id, status
          FROM bookings
          WHERE id = $1
          LIMIT 1
        `,
        [bookingId]
      );
      if (found.rowCount === 0) {
        return res.status(404).json({ error: 'booking_not_found' });
      }
      const row = found.rows[0];
      if (Number(row.teacher_user_id) !== Number(req.auth.userId)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      return res.status(409).json({ error: 'booking_not_completable' });
    }

    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/teachers/me/guest-students/:id/reset-pin', requireAuth, requireTeacher, async (req, res) => {
  return res.status(410).json({ error: 'guest_feature_disabled' });
  try {
    const guestStudentId = parsePositiveInt(req.params.id);
    if (!guestStudentId) {
      return res.status(400).json({ error: 'invalid_guest_student_id' });
    }
    const nextPin = parsePin4(req.body?.pin);
    if (!nextPin) {
      return res.status(400).json({ error: 'pin must be 4 digits' });
    }

    const relation = await query(
      `
        SELECT 1
        FROM bookings
        WHERE teacher_user_id = $1
          AND guest_student_id = $2
        LIMIT 1
      `,
      [req.auth.userId, guestStudentId]
    );
    if (relation.rowCount === 0) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const nextPinHash = await bcrypt.hash(nextPin, 10);
    const updated = await query(
      `
        UPDATE guest_students
        SET pin_hash = $2,
            pin_failed_attempts = 0,
            pin_locked_until = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, phone_normalized, contact_name, created_at, updated_at
      `,
      [guestStudentId, nextPinHash]
    );
    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'guest_student_not_found' });
    }

    return res.json({
      ok: true,
      item: updated.rows[0],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/bookings/:id/cancel', requireAuth, async (req, res) => {
  try {
    await autoCompletePastBookings();

    const bookingId = parsePositiveInt(req.params.id);
    if (!bookingId) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }

    const found = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.start_at,
          b.duration_min,
          b.status,
          tp.timezone,
          tp.student_cancel_day_before_hour,
          make_timestamptz(
            extract(year FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            extract(month FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            extract(day FROM ((b.start_at AT TIME ZONE tp.timezone)::date - 1))::int,
            tp.student_cancel_day_before_hour,
            0,
            0,
            tp.timezone
          ) AS student_cancel_deadline_at
        FROM bookings b
        JOIN teacher_profiles tp ON tp.teacher_user_id = b.teacher_user_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId]
    );

    if (found.rowCount === 0) {
      return res.status(404).json({ error: 'booking_not_found' });
    }

    const booking = found.rows[0];
    const isStudentOwner =
      req.auth.role === 'STUDENT' && Number(booking.student_user_id) === Number(req.auth.userId);
    const isTeacherOwner =
      req.auth.role === 'TEACHER' && Number(booking.teacher_user_id) === Number(req.auth.userId);

    if (!isStudentOwner && !isTeacherOwner) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!['PENDING', 'BOOKED'].includes(String(booking.status || ''))) {
      return res.status(409).json({ error: 'booking_not_active' });
    }

    if (isStudentOwner && isCancelDeadlinePassed(booking.student_cancel_deadline_at)) {
      return res.status(422).json({ error: 'cancel_cutoff_passed' });
    }

    const cancelStatus = isTeacherOwner ? 'CANCELED_BY_TEACHER' : 'CANCELED_BY_STUDENT';
    const reason = String(req.body?.reason || '').trim() || null;
    const updated = await query(
      `
        UPDATE bookings
        SET status = $2,
            canceled_at = NOW(),
            cancel_reason = COALESCE($3, cancel_reason),
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          completed_at,
          teacher_private_comment,
          student_comment,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [bookingId, cancelStatus, reason]
    );

    return res.json({ item: updated.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

function startServer(listenPort = port) {
  const server = app.listen(listenPort, () => {
    console.log(`backend listening on port ${listenPort}`);
    console.log(`app config loaded from ${configPath}`);
  });
  const completionScheduler = startAutoCompletionScheduler();
  const guestRetentionScheduler = startGuestRetentionScheduler();
  server.on('close', () => {
    clearInterval(completionScheduler);
    clearInterval(guestRetentionScheduler);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
