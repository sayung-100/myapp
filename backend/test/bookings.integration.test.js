const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { startServer } = require('../src/index');

const PASSWORD = 'password123!';
const TEST_TIMEZONE = 'Asia/Seoul';

let server;
let baseUrl;

function buildSlotStartUtc() {
  const slotStart = new Date();
  slotStart.setUTCDate(slotStart.getUTCDate() + 1);
  slotStart.setUTCHours(10, 0, 0, 0);
  return slotStart;
}

function getDateTimePartsInTimezone(date, timezone = TEST_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return map;
}

function formatLocalDateInTimezone(date, timezone = TEST_TIMEZONE) {
  const parts = getDateTimePartsInTimezone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatLocalTimeInTimezone(date, timezone = TEST_TIMEZONE) {
  const parts = getDateTimePartsInTimezone(date, timezone);
  return `${parts.hour}:${parts.minute}`;
}

function getWeekdayInTimezone(date, timezone = TEST_TIMEZONE) {
  const dateKey = formatLocalDateInTimezone(date, timezone);
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function closeServer(httpServer) {
  if (!httpServer) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsedBody = null;
  if (text) {
    parsedBody = JSON.parse(text);
  }

  return { status: response.status, body: parsedBody };
}

async function login(email) {
  const response = await requestJson('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email,
      password: PASSWORD,
    },
  });

  assert.equal(response.status, 200, `login failed for ${email}`);
  assert.ok(response.body?.token, `missing token for ${email}`);
  return response.body.token;
}

function findSlot(items, slotStart) {
  return items.find((item) => new Date(item.start_at).getTime() === slotStart.getTime());
}

async function seedBookableScenario({
  cancelCutoffHours = 6,
  bookingWindowDays = 30,
  slotStart = buildSlotStartUtc(),
  availabilityStartTimeLocal,
  availabilityEndTimeLocal,
} = {}) {
  await pool.query(`
    TRUNCATE TABLE
      bookings,
      guest_students,
      availability_exceptions,
      weekly_availabilities,
      teacher_profiles,
      users
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const teacherResult = await pool.query(
    `
      INSERT INTO users (role, email, password_hash, name)
      VALUES ('TEACHER', 'teacher@example.com', $1, 'Demo Teacher')
      RETURNING id
    `,
    [passwordHash]
  );
  const teacherId = Number(teacherResult.rows[0].id);

  await pool.query(
    `
      INSERT INTO users (role, email, password_hash, name)
      VALUES ('STUDENT', 'student@example.com', $1, 'Demo Student')
    `,
    [passwordHash]
  );

  await pool.query(
    `
      INSERT INTO teacher_profiles (
        teacher_user_id, lesson_duration_min, timezone, cancel_cutoff_hours, booking_window_days
      )
      VALUES ($1, 60, $4, $2, $3)
    `,
    [teacherId, cancelCutoffHours, bookingWindowDays, TEST_TIMEZONE]
  );
  const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
  const startTimeLocal = availabilityStartTimeLocal || formatLocalTimeInTimezone(slotStart, TEST_TIMEZONE);
  const endTimeLocal = availabilityEndTimeLocal || formatLocalTimeInTimezone(slotEnd, TEST_TIMEZONE);

  await pool.query(
    `
      INSERT INTO weekly_availabilities (
        teacher_user_id, weekday, start_time_local, end_time_local, is_active
      )
      VALUES ($1, $2, $3::time, $4::time, TRUE)
    `,
    [teacherId, getWeekdayInTimezone(slotStart, TEST_TIMEZONE), startTimeLocal, endTimeLocal]
  );

  return {
    teacherId,
    slotStart,
    slotStartIso: slotStart.toISOString(),
    fromIso: new Date(slotStart.getTime() - 60 * 60 * 1000).toISOString(),
    toIso: new Date(slotStart.getTime() + 4 * 60 * 60 * 1000).toISOString(),
  };
}

test.before(async () => {
  server = startServer(0);
  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await closeServer(server);
  await pool.end();
});

test('student booking is pending, marks slot unavailable, and duplicate booking returns 409', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');

  const slotsBefore = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}&step_min=60`,
    { token: studentToken }
  );
  assert.equal(slotsBefore.status, 200);

  const targetBefore = findSlot(slotsBefore.body.items, scenario.slotStart);
  assert.ok(targetBefore, 'bookable slot missing before booking');
  assert.equal(targetBefore.is_available, true);

  const created = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.status, 'PENDING');

  const duplicate = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'slot_already_booked');

  const slotsAfter = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}&step_min=60`,
    { token: studentToken }
  );
  assert.equal(slotsAfter.status, 200);

  const targetAfter = findSlot(slotsAfter.body.items, scenario.slotStart);
  assert.ok(targetAfter, 'bookable slot missing after booking');
  assert.equal(targetAfter.is_available, false);
});

test('student cannot cancel after cutoff', async () => {
  const scenario = await seedBookableScenario({ cancelCutoffHours: 999 });
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');

  const created = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(created.status, 201);

  const approved = await requestJson(`/api/v1/teachers/me/bookings/${created.body.item.id}/approve`, {
    method: 'POST',
    token: teacherToken,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.item.status, 'BOOKED');

  const canceled = await requestJson(`/api/v1/bookings/${created.body.item.id}/cancel`, {
    method: 'POST',
    token: studentToken,
    body: { reason: 'too late' },
  });
  assert.equal(canceled.status, 422);
  assert.equal(canceled.body.error, 'cancel_cutoff_passed');
});

test('teacher can cancel after cutoff as override', async () => {
  const scenario = await seedBookableScenario({ cancelCutoffHours: 999 });
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');

  const created = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(created.status, 201);

  const approved = await requestJson(`/api/v1/teachers/me/bookings/${created.body.item.id}/approve`, {
    method: 'POST',
    token: teacherToken,
  });
  assert.equal(approved.status, 200);

  const canceled = await requestJson(`/api/v1/bookings/${created.body.item.id}/cancel`, {
    method: 'POST',
    token: teacherToken,
    body: { reason: 'teacher override' },
  });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.item.status, 'CANCELED_BY_TEACHER');
  assert.equal(canceled.body.item.cancel_reason, 'teacher override');
});

test('booking rejects start_at in the past', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');
  const pastStartIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const response = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: pastStartIso,
    },
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'start_at_in_past');
});

test('booking accepts near booking window limit and rejects over limit', async () => {
  const windowDays = 30;
  const now = new Date();
  const within = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
  within.setUTCMinutes(0, 0, 0);
  if (within.getUTCHours() === 23) {
    within.setUTCHours(22, 0, 0, 0);
  }
  const beyond = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000);
  beyond.setUTCMinutes(0, 0, 0);

  const scenario = await seedBookableScenario({
    bookingWindowDays: windowDays,
    slotStart: within,
  });
  const studentToken = await login('student@example.com');

  const withinResponse = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: within.toISOString(),
    },
  });
  assert.equal(withinResponse.status, 201);

  const beyondResponse = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: beyond.toISOString(),
    },
  });
  assert.equal(beyondResponse.status, 422);
  assert.equal(beyondResponse.body.error, 'start_at_exceeds_booking_window');
});

test('all-day exception removes matching day slots and blocks booking', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');

  const createException = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: formatLocalDateInTimezone(scenario.slotStart, TEST_TIMEZONE),
      reason: 'day off',
    },
  });
  assert.equal(createException.status, 201);

  const slots = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}&step_min=60`,
    { token: studentToken }
  );
  assert.equal(slots.status, 200);
  assert.equal(findSlot(slots.body.items, scenario.slotStart), undefined);

  const booking = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(booking.status, 422);
  assert.equal(booking.body.error, 'slot_not_available');
});

test('partial exception blocks only overlapping slot', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');
  const nextSlot = new Date(scenario.slotStart.getTime() + 60 * 60 * 1000);
  const nextSlotEnd = new Date(nextSlot.getTime() + 60 * 60 * 1000);

  await pool.query(
    `
      INSERT INTO weekly_availabilities (
        teacher_user_id, weekday, start_time_local, end_time_local, is_active
      )
      VALUES ($1, $2, $3::time, $4::time, TRUE)
    `,
    [
      scenario.teacherId,
      getWeekdayInTimezone(scenario.slotStart, TEST_TIMEZONE),
      formatLocalTimeInTimezone(nextSlot, TEST_TIMEZONE),
      formatLocalTimeInTimezone(nextSlotEnd, TEST_TIMEZONE),
    ]
  );

  const createException = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: formatLocalDateInTimezone(scenario.slotStart, TEST_TIMEZONE),
      start_time_local: formatLocalTimeInTimezone(scenario.slotStart, TEST_TIMEZONE),
      end_time_local: formatLocalTimeInTimezone(nextSlot, TEST_TIMEZONE),
      reason: 'meeting',
    },
  });
  assert.equal(createException.status, 201);

  const slots = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}&step_min=60`,
    { token: studentToken }
  );
  assert.equal(slots.status, 200);
  assert.equal(findSlot(slots.body.items, scenario.slotStart), undefined);

  const stillAvailable = findSlot(slots.body.items, nextSlot);
  assert.ok(stillAvailable, 'next slot should still be visible');
  assert.equal(stillAvailable.is_available, true);
});

test('past booked lesson is auto-completed when bookings are queried', async () => {
  const scenario = await seedBookableScenario();
  const teacherToken = await login('teacher@example.com');
  const studentIdResult = await pool.query(`SELECT id FROM users WHERE email = 'student@example.com' LIMIT 1`);
  const studentId = Number(studentIdResult.rows[0].id);
  const pastStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const inserted = await pool.query(
    `
      INSERT INTO bookings (teacher_user_id, student_user_id, start_at, duration_min, status)
      VALUES ($1, $2, $3::timestamptz, 60, 'BOOKED')
      RETURNING id
    `,
    [scenario.teacherId, studentId, pastStart]
  );
  const bookingId = String(inserted.rows[0].id);

  const list = await requestJson('/api/v1/teachers/me/bookings', {
    token: teacherToken,
  });
  assert.equal(list.status, 200);

  const row = (list.body.items || []).find((item) => String(item.id) === bookingId);
  assert.ok(row, 'booking row should exist');
  assert.equal(row.status, 'COMPLETED');
  assert.ok(row.completed_at, 'completed_at should be set');
});

test('teacher can manually complete before end time and save split comments', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');

  const created = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(created.status, 201);
  const bookingId = String(created.body.item.id);

  const completed = await requestJson(`/api/v1/teachers/me/bookings/${bookingId}/complete`, {
    method: 'POST',
    token: teacherToken,
    body: {
      teacher_private_comment: '교사용: 숙제 체크 필요',
      student_comment: '학생용: 숙제 3쪽까지',
    },
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.item.status, 'COMPLETED');
  assert.equal(completed.body.item.teacher_private_comment, '교사용: 숙제 체크 필요');
  assert.equal(completed.body.item.student_comment, '학생용: 숙제 3쪽까지');
  assert.ok(completed.body.item.completed_at);

  const updatedComment = await requestJson(`/api/v1/teachers/me/bookings/${bookingId}/complete`, {
    method: 'POST',
    token: teacherToken,
    body: {
      teacher_private_comment: '교사용: 코멘트 수정',
      student_comment: '학생용: 코멘트 수정',
    },
  });
  assert.equal(updatedComment.status, 200);
  assert.equal(updatedComment.body.item.status, 'COMPLETED');
  assert.equal(updatedComment.body.item.teacher_private_comment, '교사용: 코멘트 수정');
  assert.equal(updatedComment.body.item.student_comment, '학생용: 코멘트 수정');

  const slots = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}&step_min=60`,
    { token: studentToken }
  );
  assert.equal(slots.status, 200);
  const target = findSlot(slots.body.items, scenario.slotStart);
  assert.ok(target, 'slot should still be visible');
  assert.equal(target.is_available, false, 'manually completed future booking must keep slot blocked');
});

test('teacher complete requires both private and student comments', async () => {
  const scenario = await seedBookableScenario();
  const studentToken = await login('student@example.com');
  const teacherToken = await login('teacher@example.com');

  const created = await requestJson('/api/v1/bookings', {
    method: 'POST',
    token: studentToken,
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
    },
  });
  assert.equal(created.status, 201);

  const bookingId = String(created.body.item.id);
  const missing = await requestJson(`/api/v1/teachers/me/bookings/${bookingId}/complete`, {
    method: 'POST',
    token: teacherToken,
    body: {
      student_comment: '학생에게 전달',
    },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'teacher_private_comment is required');
});

test('public guest booking supports create, lookup, and cancel by phone+pin', async () => {
  const scenario = await seedBookableScenario();

  const created = await requestJson('/api/v1/public/bookings', {
    method: 'POST',
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
      student_name: '홍길동',
      phone: '010-1234-5678',
      pin: '1234',
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.status, 'PENDING');
  assert.equal(created.body.item.is_guest_student, true);
  assert.ok(created.body.public_access?.token, 'public access token should be returned');

  const lookup = await requestJson('/api/v1/public/bookings/lookup', {
    method: 'POST',
    body: {
      phone: '01012345678',
      pin: '1234',
    },
  });
  assert.equal(lookup.status, 200);
  assert.ok(Array.isArray(lookup.body.items));
  const found = lookup.body.items.find((row) => String(row.id) === String(created.body.item.id));
  assert.ok(found, 'created guest booking must be found by lookup');

  const canceled = await requestJson(`/api/v1/public/bookings/${created.body.item.id}/cancel`, {
    method: 'POST',
    body: {
      phone: '01012345678',
      pin: '1234',
      reason: 'guest cancel',
    },
  });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.item.status, 'CANCELED_BY_STUDENT');
});

test('public guest cancel requires reason', async () => {
  const scenario = await seedBookableScenario();

  const created = await requestJson('/api/v1/public/bookings', {
    method: 'POST',
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
      student_name: '사유필수',
      phone: '01022223333',
      pin: '4321',
    },
  });
  assert.equal(created.status, 201);

  const canceled = await requestJson(`/api/v1/public/bookings/${created.body.item.id}/cancel`, {
    method: 'POST',
    body: {
      phone: '01022223333',
      pin: '4321',
    },
  });
  assert.equal(canceled.status, 400);
  assert.equal(canceled.body.error, 'cancel_reason is required');
});

test('public guest booking can be canceled by manage token', async () => {
  const scenario = await seedBookableScenario();

  const created = await requestJson('/api/v1/public/bookings', {
    method: 'POST',
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
      student_name: '김영희',
      phone: '01099998888',
      pin: '5678',
    },
  });
  assert.equal(created.status, 201);
  const bookingId = created.body.item.id;
  const token = created.body.public_access?.token;
  assert.ok(token, 'manage token should exist');

  const canceled = await requestJson(`/api/v1/public/bookings/${bookingId}/cancel-by-token`, {
    method: 'POST',
    body: {
      token,
      reason: 'link cancel',
    },
  });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.item.status, 'CANCELED_BY_STUDENT');
});

test('teacher can reset guest pin manually', async () => {
  const scenario = await seedBookableScenario();
  const teacherToken = await login('teacher@example.com');

  const created = await requestJson('/api/v1/public/bookings', {
    method: 'POST',
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
      student_name: '게스트',
      phone: '01077776666',
      pin: '1111',
    },
  });
  assert.equal(created.status, 201);

  const guestRow = await pool.query(
    `
      SELECT id
      FROM guest_students
      WHERE phone_normalized = '01077776666'
      LIMIT 1
    `
  );
  const guestId = String(guestRow.rows[0].id);

  const reset = await requestJson(`/api/v1/teachers/me/guest-students/${guestId}/reset-pin`, {
    method: 'POST',
    token: teacherToken,
    body: { pin: '2222' },
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.ok, true);

  const oldLookup = await requestJson('/api/v1/public/bookings/lookup', {
    method: 'POST',
    body: {
      phone: '01077776666',
      pin: '1111',
    },
  });
  assert.equal(oldLookup.status, 401);

  const newLookup = await requestJson('/api/v1/public/bookings/lookup', {
    method: 'POST',
    body: {
      phone: '01077776666',
      pin: '2222',
    },
  });
  assert.equal(newLookup.status, 200);
  assert.ok((newLookup.body.items || []).length >= 1);
});

test('guest pin is locked after repeated failures', async () => {
  const scenario = await seedBookableScenario();

  const created = await requestJson('/api/v1/public/bookings', {
    method: 'POST',
    body: {
      teacher_user_id: scenario.teacherId,
      start_at: scenario.slotStartIso,
      student_name: '락아웃',
      phone: '01012344321',
      pin: '2468',
    },
  });
  assert.equal(created.status, 201);

  for (let i = 0; i < 4; i += 1) {
    const wrong = await requestJson('/api/v1/public/bookings/lookup', {
      method: 'POST',
      body: {
        phone: '01012344321',
        pin: '0000',
      },
    });
    assert.equal(wrong.status, 401);
  }

  const locked = await requestJson('/api/v1/public/bookings/lookup', {
    method: 'POST',
    body: {
      phone: '01012344321',
      pin: '0000',
    },
  });
  assert.equal(locked.status, 423);
  assert.equal(locked.body.error, 'guest_pin_locked');

  const stillLocked = await requestJson('/api/v1/public/bookings/lookup', {
    method: 'POST',
    body: {
      phone: '01012344321',
      pin: '2468',
    },
  });
  assert.equal(stillLocked.status, 423);
  assert.equal(stillLocked.body.error, 'guest_pin_locked');
});
