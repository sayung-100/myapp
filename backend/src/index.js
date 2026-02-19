const express = require('express');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { query } = require('./db');
const { signAccessToken, requireAuth } = require('./auth');

dotenv.config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

const LOCAL_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toPublicUser(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
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
      SELECT teacher_user_id, lesson_duration_min, timezone, cancel_cutoff_hours, booking_window_days
      FROM teacher_profiles
      WHERE teacher_user_id = $1
      LIMIT 1
    `,
    [teacherUserId]
  );
  return result.rowCount > 0 ? result.rows[0] : null;
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

async function isBookableStartAt(teacherUserId, startAtIso) {
  const result = await query(
    `
      SELECT 1
      FROM teacher_profiles tp
      JOIN weekly_availabilities wa
        ON wa.teacher_user_id = tp.teacher_user_id
       AND wa.is_active = TRUE
      WHERE tp.teacher_user_id = $1
        AND wa.weekday = extract(dow FROM ($2::timestamptz AT TIME ZONE tp.timezone))::int
        AND (($2::timestamptz AT TIME ZONE tp.timezone)::date =
             (($2::timestamptz + make_interval(mins => tp.lesson_duration_min)) AT TIME ZONE tp.timezone)::date)
        AND (($2::timestamptz AT TIME ZONE tp.timezone)::time >= wa.start_time_local)
        AND ((($2::timestamptz + make_interval(mins => tp.lesson_duration_min)) AT TIME ZONE tp.timezone)::time
             <= wa.end_time_local)
        AND (
          extract(epoch FROM ((($2::timestamptz AT TIME ZONE tp.timezone)::time - wa.start_time_local)))::bigint
          % (tp.lesson_duration_min * 60) = 0
        )
        AND NOT EXISTS (
          SELECT 1
          FROM availability_exceptions ex
          WHERE ex.teacher_user_id = tp.teacher_user_id
            AND ex.date_local = ($2::timestamptz AT TIME ZONE tp.timezone)::date
            AND (
              (ex.start_time_local IS NULL AND ex.end_time_local IS NULL)
              OR (
                $2::timestamptz <
                  make_timestamptz(
                    extract(year FROM ex.date_local)::int,
                    extract(month FROM ex.date_local)::int,
                    extract(day FROM ex.date_local)::int,
                    extract(hour FROM ex.end_time_local)::int,
                    extract(minute FROM ex.end_time_local)::int,
                    extract(second FROM ex.end_time_local),
                    tp.timezone
                  )
                AND
                ($2::timestamptz + make_interval(mins => tp.lesson_duration_min)) >
                  make_timestamptz(
                    extract(year FROM ex.date_local)::int,
                    extract(month FROM ex.date_local)::int,
                    extract(day FROM ex.date_local)::int,
                    extract(hour FROM ex.start_time_local)::int,
                    extract(minute FROM ex.start_time_local)::int,
                    extract(second FROM ex.start_time_local),
                    tp.timezone
                  )
              )
            )
        )
      LIMIT 1
    `,
    [teacherUserId, startAtIso]
  );
  return result.rowCount > 0;
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
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim().toUpperCase();

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name, role are required' });
    }

    if (!['TEACHER', 'STUDENT'].includes(role)) {
      return res.status(400).json({ error: 'role must be TEACHER or STUDENT' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertUserSql = `
      INSERT INTO users (role, email, password_hash, name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, role, email, name, created_at
    `;

    const userResult = await query(insertUserSql, [role, email, passwordHash, name]);
    const user = userResult.rows[0];

    if (role === 'TEACHER') {
      await query(
        `
          INSERT INTO teacher_profiles (teacher_user_id)
          VALUES ($1)
          ON CONFLICT (teacher_user_id) DO NOTHING
        `,
        [user.id]
      );
    }

    const token = signAccessToken(user);
    return res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'email already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const userResult = await query(
      `
        SELECT id, role, email, name, password_hash, created_at
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
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
  return res.json({ ok: true });
});

app.get('/api/v1/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, role, email, name, created_at
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

app.get('/api/v1/teachers/me/availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, weekday, start_time_local, end_time_local, is_active, created_at, updated_at
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

app.post('/api/v1/teachers/me/availability', requireAuth, requireTeacher, async (req, res) => {
  try {
    const weekday = Number(req.body?.weekday);
    const startTimeLocal = parseLocalTime(req.body?.start_time_local);
    const endTimeLocal = parseLocalTime(req.body?.end_time_local);
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
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be boolean' });
    }

    if (isActive && (await hasAvailabilityConflict(req.auth.userId, weekday, startTimeLocal, endTimeLocal))) {
      return res.status(409).json({ error: 'availability_conflict' });
    }

    const created = await query(
      `
        INSERT INTO weekly_availabilities (
          teacher_user_id, weekday, start_time_local, end_time_local, is_active
        )
        VALUES ($1, $2, $3::time, $4::time, $5)
        RETURNING id, weekday, start_time_local, end_time_local, is_active, created_at, updated_at
      `,
      [req.auth.userId, weekday, startTimeLocal, endTimeLocal, isActive]
    );
    return res.status(201).json({ item: created.rows[0] });
  } catch (err) {
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
        SELECT id, weekday, start_time_local, end_time_local, is_active
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

    if (!Number.isInteger(nextWeekday) || nextWeekday < 0 || nextWeekday > 6) {
      return res.status(400).json({ error: 'weekday must be an integer between 0 and 6' });
    }
    if (!nextStartTimeLocal || !nextEndTimeLocal) {
      return res.status(400).json({ error: 'start_time_local and end_time_local are required (HH:MM or HH:MM:SS)' });
    }
    if (nextStartTimeLocal >= nextEndTimeLocal) {
      return res.status(400).json({ error: 'start_time_local must be earlier than end_time_local' });
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
            updated_at = NOW()
        WHERE id = $1 AND teacher_user_id = $2
        RETURNING id, weekday, start_time_local, end_time_local, is_active, created_at, updated_at
      `,
      [id, req.auth.userId, nextWeekday, nextStartTimeLocal, nextEndTimeLocal, nextIsActive]
    );
    return res.json({ item: updated.rows[0] });
  } catch (err) {
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

app.get('/api/v1/teachers', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          tp.lesson_duration_min,
          tp.timezone,
          tp.cancel_cutoff_hours,
          tp.booking_window_days
        FROM users u
        JOIN teacher_profiles tp ON tp.teacher_user_id = u.id
        ORDER BY u.id ASC
      `
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.get('/api/v1/teachers/:teacherId/slots', requireAuth, async (req, res) => {
  try {
    const teacherUserId = parsePositiveInt(req.params.teacherId);
    const fromIso = parseDateTime(req.query.from);
    const toIso = parseDateTime(req.query.to);

    if (!teacherUserId) {
      return res.status(400).json({ error: 'invalid_teacher_id' });
    }
    if (!fromIso || !toIso) {
      return res.status(400).json({ error: 'from and to are required (ISO datetime)' });
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
        candidate_slots AS (
          SELECT
            gs AS start_at,
            gs + make_interval(mins => $5::int) AS end_at
          FROM day_series d
          JOIN weekly_availabilities wa
            ON wa.teacher_user_id = $1
           AND wa.is_active = TRUE
           AND wa.weekday = extract(dow FROM d.day_local)::int
          CROSS JOIN LATERAL (
            SELECT
              make_timestamptz(
                extract(year FROM d.day_local)::int,
                extract(month FROM d.day_local)::int,
                extract(day FROM d.day_local)::int,
                extract(hour FROM wa.start_time_local)::int,
                extract(minute FROM wa.start_time_local)::int,
                extract(second FROM wa.start_time_local),
                $4
              ) AS window_start,
              make_timestamptz(
                extract(year FROM d.day_local)::int,
                extract(month FROM d.day_local)::int,
                extract(day FROM d.day_local)::int,
                extract(hour FROM wa.end_time_local)::int,
                extract(minute FROM wa.end_time_local)::int,
                extract(second FROM wa.end_time_local),
                $4
              ) AS window_end
          ) w
          CROSS JOIN LATERAL generate_series(
            w.window_start,
            w.window_end - make_interval(mins => $5::int),
            make_interval(mins => $5::int)
          ) gs
          WHERE gs >= $2::timestamptz
            AND gs < $3::timestamptz
            AND gs >= NOW()
            AND gs <= NOW() + make_interval(days => $6::int)
            AND NOT EXISTS (
              SELECT 1
              FROM availability_exceptions ex
              WHERE ex.teacher_user_id = $1
                AND ex.date_local = (gs AT TIME ZONE $4)::date
                AND (
                  (ex.start_time_local IS NULL AND ex.end_time_local IS NULL)
                  OR (
                    gs <
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
                    (gs + make_interval(mins => $5::int)) >
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
        )
        SELECT
          c.start_at,
          c.end_at,
          (b.id IS NULL) AS is_available
        FROM candidate_slots c
        LEFT JOIN bookings b
          ON b.teacher_user_id = $1
         AND b.start_at = c.start_at
         AND b.status = 'BOOKED'
        ORDER BY c.start_at ASC
      `,
      [
        teacherUserId,
        fromIso,
        toIso,
        profile.timezone,
        profile.lesson_duration_min,
        profile.booking_window_days,
      ]
    );

    return res.json({
      teacher_user_id: String(teacherUserId),
      timezone: profile.timezone,
      duration_min: profile.lesson_duration_min,
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

    const startAt = new Date(startAtIso);
    const now = new Date();
    const maxAllowed = new Date(now.getTime() + Number(profile.booking_window_days) * 24 * 60 * 60 * 1000);
    if (startAt.getTime() < now.getTime()) {
      return res.status(422).json({ error: 'start_at_in_past' });
    }
    if (startAt.getTime() > maxAllowed.getTime()) {
      return res.status(422).json({ error: 'start_at_exceeds_booking_window' });
    }

    const validSlot = await isBookableStartAt(teacherUserId, startAtIso);
    if (!validSlot) {
      return res.status(422).json({ error: 'slot_not_available' });
    }

    const created = await query(
      `
        INSERT INTO bookings (
          teacher_user_id, student_user_id, start_at, duration_min, status
        )
        VALUES ($1, $2, $3::timestamptz, $4, 'BOOKED')
        RETURNING
          id,
          teacher_user_id,
          student_user_id,
          start_at,
          (start_at + make_interval(mins => duration_min)) AS end_at,
          duration_min,
          status,
          canceled_at,
          cancel_reason,
          created_at,
          updated_at
      `,
      [teacherUserId, req.auth.userId, startAtIso, profile.lesson_duration_min]
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

app.get('/api/v1/bookings/me', requireAuth, requireStudent, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.start_at,
          (b.start_at + make_interval(mins => b.duration_min)) AS end_at,
          b.duration_min,
          b.status,
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

app.get('/api/v1/teachers/me/bookings', requireAuth, requireTeacher, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          b.id,
          b.teacher_user_id,
          b.student_user_id,
          b.start_at,
          (b.start_at + make_interval(mins => b.duration_min)) AS end_at,
          b.duration_min,
          b.status,
          b.canceled_at,
          b.cancel_reason,
          b.created_at,
          b.updated_at,
          s.name AS student_name,
          s.email AS student_email
        FROM bookings b
        JOIN users s ON s.id = b.student_user_id
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

app.post('/api/v1/bookings/:id/cancel', requireAuth, async (req, res) => {
  try {
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
          tp.cancel_cutoff_hours
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
    if (booking.status !== 'BOOKED') {
      return res.status(409).json({ error: 'booking_not_active' });
    }

    if (isStudentOwner) {
      const cutoffAt = new Date(
        new Date(booking.start_at).getTime() - Number(booking.cancel_cutoff_hours) * 60 * 60 * 1000
      );
      if (new Date().getTime() > cutoffAt.getTime()) {
        return res.status(422).json({ error: 'cancel_cutoff_passed' });
      }
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

app.listen(port, () => {
  console.log(`backend listening on port ${port}`);
});
