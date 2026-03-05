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
  return buildSlotStartUtcDaysAhead(1);
}

function buildSlotStartUtcDaysAhead(daysAhead = 1) {
  const slotStart = new Date();
  slotStart.setUTCDate(slotStart.getUTCDate() + daysAhead);
  slotStart.setUTCHours(10, 0, 0, 0);
  return slotStart;
}

function buildSoonSlotStartUtc() {
  const slotStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  slotStart.setUTCMinutes(0, 0, 0);
  if (slotStart.getTime() <= Date.now()) {
    slotStart.setUTCHours(slotStart.getUTCHours() + 1, 0, 0, 0);
  }
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
  let effectiveSlotStart = new Date(slotStart);
  let slotEnd = new Date(effectiveSlotStart.getTime() + 60 * 60 * 1000);
  let startTimeLocal = availabilityStartTimeLocal || formatLocalTimeInTimezone(effectiveSlotStart, TEST_TIMEZONE);
  let endTimeLocal = availabilityEndTimeLocal || formatLocalTimeInTimezone(slotEnd, TEST_TIMEZONE);
  if (!availabilityStartTimeLocal && !availabilityEndTimeLocal) {
    let guard = 0;
    while (startTimeLocal >= endTimeLocal && guard < 24) {
      effectiveSlotStart = new Date(effectiveSlotStart.getTime() - 60 * 60 * 1000);
      slotEnd = new Date(effectiveSlotStart.getTime() + 60 * 60 * 1000);
      startTimeLocal = formatLocalTimeInTimezone(effectiveSlotStart, TEST_TIMEZONE);
      endTimeLocal = formatLocalTimeInTimezone(slotEnd, TEST_TIMEZONE);
      guard += 1;
    }
  }

  await pool.query(
    `
      INSERT INTO weekly_availabilities (
        teacher_user_id, weekday, start_time_local, end_time_local, is_active
      )
      VALUES ($1, $2, $3::time, $4::time, TRUE)
    `,
    [teacherId, getWeekdayInTimezone(effectiveSlotStart, TEST_TIMEZONE), startTimeLocal, endTimeLocal]
  );

  return {
    teacherId,
    slotStart: effectiveSlotStart,
    slotStartIso: effectiveSlotStart.toISOString(),
    fromIso: new Date(effectiveSlotStart.getTime() - 60 * 60 * 1000).toISOString(),
    toIso: new Date(effectiveSlotStart.getTime() + 4 * 60 * 60 * 1000).toISOString(),
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

test('student booking is pending, marks slot unavailable, and duplicate booking is blocked', async () => {
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
  assert.equal(duplicate.status, 422);
  assert.equal(duplicate.body.error, 'slot_not_available');

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
  const scenario = await seedBookableScenario({ slotStart: buildSoonSlotStartUtc() });
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

test('teacher profile can update student notice and day-before cancel hour', async () => {
  await seedBookableScenario();
  const teacherToken = await login('teacher@example.com');
  const studentToken = await login('student@example.com');

  const updated = await requestJson('/api/v1/teachers/me/profile', {
    method: 'PATCH',
    token: teacherToken,
    body: {
      student_cancel_day_before_hour: 19,
      student_notice: '이번 주는 교재 3권 지참 바랍니다.',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.item.student_cancel_day_before_hour, 19);
  assert.equal(updated.body.item.student_notice, '이번 주는 교재 3권 지참 바랍니다.');

  const teachers = await requestJson('/api/v1/teachers', { token: studentToken });
  assert.equal(teachers.status, 200);
  assert.equal(teachers.body.items[0].student_cancel_day_before_hour, 19);
  assert.equal(teachers.body.items[0].student_notice, '이번 주는 교재 3권 지참 바랍니다.');
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
  const within = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  within.setUTCHours(10, 0, 0, 0);
  const beyond = new Date(now.getTime() + (windowDays + 5) * 24 * 60 * 60 * 1000);
  beyond.setUTCHours(10, 0, 0, 0);

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
      start_at: scenario.slotStartIso,
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

test('duplicate availability and exception rows are blocked', async () => {
  const scenario = await seedBookableScenario();
  const teacherToken = await login('teacher@example.com');

  const duplicateWeekly = await requestJson('/api/v1/teachers/me/availability', {
    method: 'POST',
    token: teacherToken,
    body: {
      weekday: getWeekdayInTimezone(scenario.slotStart, TEST_TIMEZONE),
      start_time_local: formatLocalTimeInTimezone(scenario.slotStart, TEST_TIMEZONE),
      end_time_local: formatLocalTimeInTimezone(new Date(scenario.slotStart.getTime() + 60 * 60 * 1000), TEST_TIMEZONE),
      is_active: false,
    },
  });
  assert.equal(duplicateWeekly.status, 409);
  assert.equal(duplicateWeekly.body.error, 'availability_duplicate');

  const dateLocal = formatLocalDateInTimezone(scenario.slotStart, TEST_TIMEZONE);
  const startLocal = formatLocalTimeInTimezone(scenario.slotStart, TEST_TIMEZONE);
  const endLocal = formatLocalTimeInTimezone(new Date(scenario.slotStart.getTime() + 60 * 60 * 1000), TEST_TIMEZONE);
  const firstException = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: dateLocal,
      start_time_local: startLocal,
      end_time_local: endLocal,
      reason: '중복테스트',
    },
  });
  assert.equal(firstException.status, 201);

  const duplicateException = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: dateLocal,
      start_time_local: startLocal,
      end_time_local: endLocal,
      reason: '중복테스트2',
    },
  });
  assert.equal(duplicateException.status, 409);
  assert.equal(duplicateException.body.error, 'exception_conflict');
});

test('teacher can create bookings on behalf of member and guest students', async () => {
  const scenarioForMember = await seedBookableScenario();
  let teacherToken = await login('teacher@example.com');
  const studentIdResult = await pool.query(`SELECT id FROM users WHERE email = 'student@example.com' LIMIT 1`);
  const studentId = Number(studentIdResult.rows[0].id);
  const memberSlots = await requestJson(
    `/api/v1/teachers/${scenarioForMember.teacherId}/slots?from=${encodeURIComponent(scenarioForMember.fromIso)}&to=${encodeURIComponent(scenarioForMember.toIso)}&step_min=60`,
    { token: teacherToken }
  );
  assert.equal(memberSlots.status, 200);
  const memberStartAt = (memberSlots.body.items || []).find((item) => item.is_available)?.start_at;
  assert.ok(memberStartAt, 'open slot is required for member on-behalf booking');

  const memberBooking = await requestJson('/api/v1/teachers/me/bookings', {
    method: 'POST',
    token: teacherToken,
    body: {
      start_at: memberStartAt,
      student_user_id: studentId,
    },
  });
  assert.equal(memberBooking.status, 201);
  assert.equal(memberBooking.body.item.status, 'BOOKED');
  assert.equal(memberBooking.body.item.student_user_id, String(studentId));

  const scenarioForGuest = await seedBookableScenario({ slotStart: buildSlotStartUtcDaysAhead(3) });
  teacherToken = await login('teacher@example.com');
  const guestSlots = await requestJson(
    `/api/v1/teachers/${scenarioForGuest.teacherId}/slots?from=${encodeURIComponent(scenarioForGuest.fromIso)}&to=${encodeURIComponent(scenarioForGuest.toIso)}&step_min=60`,
    { token: teacherToken }
  );
  assert.equal(guestSlots.status, 200);
  const guestStartAt = (guestSlots.body.items || []).find((item) => item.is_available)?.start_at;
  assert.ok(guestStartAt, 'open slot is required for guest on-behalf booking');

  const guestBooking = await requestJson('/api/v1/teachers/me/bookings', {
    method: 'POST',
    token: teacherToken,
    body: {
      start_at: guestStartAt,
      student_name: '현장등록',
      phone: '010-8888-7777',
      pin: '1357',
    },
  });
  assert.equal(guestBooking.status, 201);
  assert.equal(guestBooking.body.item.status, 'BOOKED');
  assert.equal(guestBooking.body.item.is_guest_student, true);
  assert.ok(guestBooking.body.public_access?.token);
});

test('teacher availability and exceptions require 30-minute aligned times', async () => {
  await seedBookableScenario();
  const teacherToken = await login('teacher@example.com');

  const availability = await requestJson('/api/v1/teachers/me/availability', {
    method: 'POST',
    token: teacherToken,
    body: {
      weekday: 1,
      start_time_local: '09:15',
      end_time_local: '10:15',
      is_active: true,
    },
  });
  assert.equal(availability.status, 400);
  assert.equal(availability.body.error, 'time_must_align_to_30_min');

  const oneTime = await requestJson('/api/v1/teachers/me/one-time-availability', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: '2026-03-10',
      start_time_local: '09:45',
      end_time_local: '10:45',
      is_active: true,
    },
  });
  assert.equal(oneTime.status, 400);
  assert.equal(oneTime.body.error, 'time_must_align_to_30_min');

  const exception = await requestJson('/api/v1/teachers/me/exceptions', {
    method: 'POST',
    token: teacherToken,
    body: {
      date_local: '2026-03-10',
      start_time_local: '13:15',
      end_time_local: '14:15',
      reason: '테스트',
    },
  });
  assert.equal(exception.status, 400);
  assert.equal(exception.body.error, 'time_must_align_to_30_min');
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
      student_comment: '학생용: 코멘트 수정',
    },
  });
  assert.equal(updatedComment.status, 200);
  assert.equal(updatedComment.body.item.status, 'COMPLETED');
  assert.equal(updatedComment.body.item.teacher_private_comment, '교사용: 숙제 체크 필요');
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
  const scenario = await seedBookableScenario({ slotStart: buildSlotStartUtcDaysAhead(3) });

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
  const scenario = await seedBookableScenario({ slotStart: buildSlotStartUtcDaysAhead(3) });

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
  const scenario = await seedBookableScenario({ slotStart: buildSlotStartUtcDaysAhead(3) });

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
