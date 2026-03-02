const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { startServer } = require('../src/index');

const PASSWORD = 'password123!';

let server;
let baseUrl;

function buildSlotStartUtc() {
  const slotStart = new Date();
  slotStart.setUTCDate(slotStart.getUTCDate() + 1);
  slotStart.setUTCHours(10, 0, 0, 0);
  return slotStart;
}

function formatLocalDateUtc(date) {
  return date.toISOString().slice(0, 10);
}

function formatLocalTimeUtc(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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
  availabilityStartTimeLocal = '09:00:00',
  availabilityEndTimeLocal = '13:00:00',
} = {}) {
  await pool.query(`
    TRUNCATE TABLE
      bookings,
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
      VALUES ($1, 60, 'UTC', $2, $3)
    `,
    [teacherId, cancelCutoffHours, bookingWindowDays]
  );
  await pool.query(
    `
      INSERT INTO weekly_availabilities (
        teacher_user_id, weekday, start_time_local, end_time_local, is_active
      )
      VALUES ($1, $2, $3::time, $4::time, TRUE)
    `,
    [teacherId, slotStart.getUTCDay(), availabilityStartTimeLocal, availabilityEndTimeLocal]
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
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}`,
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
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}`,
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
    availabilityStartTimeLocal: '00:00:00',
    availabilityEndTimeLocal: '23:59:59',
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
      date_local: formatLocalDateUtc(scenario.slotStart),
      reason: 'day off',
    },
  });
  assert.equal(createException.status, 201);

  const slots = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}`,
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

  const createException = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: formatLocalDateUtc(scenario.slotStart),
      start_time_local: formatLocalTimeUtc(scenario.slotStart),
      end_time_local: formatLocalTimeUtc(nextSlot),
      reason: 'meeting',
    },
  });
  assert.equal(createException.status, 201);

  const slots = await requestJson(
    `/api/v1/teachers/${scenario.teacherId}/slots?from=${encodeURIComponent(scenario.fromIso)}&to=${encodeURIComponent(scenario.toIso)}`,
    { token: studentToken }
  );
  assert.equal(slots.status, 200);
  assert.equal(findSlot(slots.body.items, scenario.slotStart), undefined);

  const stillAvailable = findSlot(slots.body.items, nextSlot);
  assert.ok(stillAvailable, 'next slot should still be visible');
  assert.equal(stillAvailable.is_available, true);
});
