      const URL_PARAMS = new URLSearchParams(window.location.search);
      const invitedStartAtRaw = String(URL_PARAMS.get('start_at') || '').trim();
      const invitedStartAtDate = invitedStartAtRaw ? new Date(invitedStartAtRaw) : null;
      const state = {
        token: localStorage.getItem('lb_token') || '',
        user: null,
        teachers: [],
        selectedTeacherId: '',
        monthCursor: (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })(),
        teacherWeekCursor: (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return d;
        })(),
        selectedDateKey: '',
        slotsByDate: {},
        availableOnly: false,
        studentGridStepMin: 60,
        teacherGridStepMin: 60,
        studentCalendarView: 'week',
        teacherProfile: null,
        teacherDrag: null,
        teacherDragEndedAt: 0,
        invitedTeacherId: parseOptionalId(URL_PARAMS.get('teacher')) || null,
        invitedStartAtIso:
          invitedStartAtDate && !Number.isNaN(invitedStartAtDate.getTime())
            ? invitedStartAtDate.toISOString()
            : '',
        holidaysByDate: {},
        loadedHolidayYears: {},
        studentBookings: [],
        teacherAvailability: [],
        teacherOneTimeAvailability: [],
        teacherExceptions: [],
        teacherBookings: [],
        teacherActiveBookings: [],
        teacherCompletedBookings: [],
        teacherCreateDraft: null,
        teacherExceptionDraft: null,
        teacherCreateType: 'availability',
        modalReopenGuardUntil: 0,
        teacherCreateSubmitting: false,
        teacherExceptionSubmitting: false,
        teacherTouch: {
          timerId: null,
          started: false,
          startMeta: null,
          startTarget: null,
          startX: 0,
          startY: 0,
          lastOpenAt: 0,
        },
      };
      const PAGE_PATH = String(window.location.pathname || '/').toLowerCase();
      const forcedModeRaw = String(URL_PARAMS.get('mode') || '').toUpperCase();
      const forcedSectionRaw = String(URL_PARAMS.get('section') || '').toLowerCase();
      const PAGE_MODE =
        forcedModeRaw === 'STUDENT' || forcedModeRaw === 'TEACHER'
          ? forcedModeRaw
          : PAGE_PATH.includes('/student')
            ? 'STUDENT'
            : 'TEACHER';
      const PAGE_SECTION =
        forcedSectionRaw === 'calendar' ||
        forcedSectionRaw === 'bookings' ||
        forcedSectionRaw === 'completed' ||
        forcedSectionRaw === 'manage' ||
        forcedSectionRaw === 'all'
          ? forcedSectionRaw
          : PAGE_PATH.includes('-calendar')
            ? 'calendar'
            : PAGE_PATH.includes('-bookings')
              ? 'bookings'
              : PAGE_PATH.includes('-completed')
                ? 'completed'
                : PAGE_PATH.includes('-manage')
                  ? 'manage'
                  : 'all';
      document.body.classList.toggle('mode-teacher', PAGE_MODE === 'TEACHER');
      document.body.classList.toggle('mode-student', PAGE_MODE === 'STUDENT');

      const authStatus = document.getElementById('authStatus');
      const rolePill = document.getElementById('rolePill');
      const toastRegion = document.getElementById('toastRegion');
      const teacherView = document.getElementById('teacherView');
      const studentView = document.getElementById('studentView');
      const teacherSelect = document.getElementById('teacherSelect');
      const monthLabel = document.getElementById('monthLabel');
      const prevMonthBtn = document.getElementById('prevMonthBtn');
      const nextMonthBtn = document.getElementById('nextMonthBtn');
      const studentWeekViewBtn = document.getElementById('studentWeekViewBtn');
      const studentMonthViewBtn = document.getElementById('studentMonthViewBtn');
      const studentGridStep = document.getElementById('studentGridStep');
      const calendarGrid = document.getElementById('calendarGrid');
      const selectedDateLabel = document.getElementById('selectedDateLabel');
      const daySlotSummary = document.getElementById('daySlotSummary');
      const daySlotsList = document.getElementById('daySlotsList');
      const myBookingsBody = document.getElementById('myBookingsBody');
      const availabilityBody = document.getElementById('availabilityBody');
      const exceptionBody = document.getElementById('exceptionBody');
      const teacherBookingsBody = document.getElementById('teacherBookingsBody');
      const teacherCompletedList = document.getElementById('teacherCompletedList');
      const teacherCompletedLessonFilter = document.getElementById('teacherCompletedLessonFilter');

      const studentTotalSlots = document.getElementById('studentTotalSlots');
      const studentOpenSlots = document.getElementById('studentOpenSlots');
      const studentActiveBookings = document.getElementById('studentActiveBookings');
      const studentTeacherMeta = document.getElementById('studentTeacherMeta');
      const studentPolicyWindow = document.getElementById('studentPolicyWindow');
      const studentPolicyCutoff = document.getElementById('studentPolicyCutoff');
      const studentTeacherNotice = document.getElementById('studentTeacherNotice');

      const teacherAvailCount = document.getElementById('teacherAvailCount');
      const teacherExceptionCount = document.getElementById('teacherExceptionCount');
      const teacherActiveBookingCount = document.getElementById('teacherActiveBookingCount');
      const teacherWeekLabel = document.getElementById('teacherWeekLabel');
      const teacherCalendarGrid = document.getElementById('teacherCalendarGrid');
      const teacherOpenSlotList = document.getElementById('teacherOpenSlotList');
      const lessonCatalogList = document.getElementById('lessonCatalogList');
      const teacherGridStep = document.getElementById('teacherGridStep');
      const teacherInviteBtn = document.getElementById('teacherInviteBtn');
      const teacherCreateType = document.getElementById('teacherCreateType');
      const teacherDragHint = document.getElementById('teacherDragHint');
      const teacherCreateModal = document.getElementById('teacherCreateModal');
      const teacherCreateForm = document.getElementById('teacherCreateForm');
      const teacherCreateSaveBtn = document.getElementById('teacherCreateSaveBtn');
      const teacherExceptionModal = document.getElementById('teacherExceptionModal');
      const teacherExceptionQuickForm = document.getElementById('teacherExceptionQuickForm');
      const teacherExceptionSaveBtn = document.getElementById('teacherExceptionSaveBtn');

      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const studentProfileForm = document.getElementById('studentProfileForm');
      const studentPasswordForm = document.getElementById('studentPasswordForm');
      const teacherAccountForm = document.getElementById('teacherAccountForm');
      const teacherPasswordForm = document.getElementById('teacherPasswordForm');
      const availabilityForm = document.getElementById('availabilityForm');
      const exceptionForm = document.getElementById('exceptionForm');
      const teacherProfileForm = document.getElementById('teacherProfileForm');
      const availableOnlyToggle = document.getElementById('availableOnlyToggle');
      const sectionLinks = Array.from(document.querySelectorAll('[data-nav-section]'));
      const TIME_ALIGNMENT_MIN = 30;

      function showToast(message, tone = 'info', durationMs = 2600) {
        if (!toastRegion) return;
        const text = String(message || '').trim();
        if (!text) return;
        const toast = document.createElement('div');
        toast.className = `toast ${tone}`;
        toast.textContent = text;
        toastRegion.appendChild(toast);
        window.setTimeout(() => {
          toast.classList.add('leave');
          window.setTimeout(() => {
            toast.remove();
          }, 260);
        }, durationMs);
      }

      function pushLog(title, payload) {
        void title;
        void payload;
      }

      function translateApiError(errorCode, payload = {}) {
        const code = String(errorCode || '').trim();
        if (!code) return '';
        const map = {
          unauthorized: '로그인이 필요합니다.',
          forbidden: '권한이 없습니다.',
          internal_server_error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          too_many_requests: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          invalid_request: '요청값이 올바르지 않습니다.',
          invalid_id: 'ID 형식이 올바르지 않습니다.',
          not_found: '요청한 데이터를 찾을 수 없습니다.',
          invalid_datetime: '날짜/시간 형식이 올바르지 않습니다.',
          invalid_teacher_id: '선생님 ID 형식이 올바르지 않습니다.',
          invalid_booking_id: '예약 ID 형식이 올바르지 않습니다.',
          teacher_not_found: '선생님 정보를 찾을 수 없습니다.',
          student_not_found: '학생 정보를 찾을 수 없습니다.',
          user_not_found: '사용자 정보를 찾을 수 없습니다.',
          slot_not_available: '예약 가능한 시간이 아닙니다.',
          slot_already_booked: '이미 예약된 시간입니다.',
          start_at_in_past: '지난 시간은 예약할 수 없습니다.',
          start_at_exceeds_booking_window: '예약 가능 기간을 벗어난 시간입니다.',
          duration_min_mismatch: '선택한 수업 블럭 길이와 요청 길이가 다릅니다.',
          booking_not_found: '예약을 찾을 수 없습니다.',
          booking_not_pending: '승인 대기 예약만 승인할 수 있습니다.',
          booking_not_active: '취소 가능한 예약 상태가 아닙니다.',
          booking_not_completable: '완료 처리할 수 없는 예약입니다.',
          cancel_cutoff_passed: '취소 가능 시간이 지나 취소할 수 없습니다.',
          guest_booking_disabled: '비회원 예약 기능이 비활성화되었습니다. 학생 계정으로 로그인해 주세요.',
          guest_student_booking_disabled: '비회원 학생 예약 기능이 비활성화되었습니다. 회원 학생 이메일로 예약해 주세요.',
          guest_feature_disabled: '비회원 관련 기능이 비활성화되었습니다.',
          cancel_reason: '취소 사유를 입력해 주세요.',
          exception_conflict: '이미 등록된 예외 시간과 겹칩니다.',
          availability_conflict: '이미 등록된 수업 블럭과 시간이 겹칩니다.',
          availability_duplicate: '같은 시간표가 이미 존재합니다.',
          one_time_availability_conflict: '이미 등록된 일회성 블럭과 시간이 겹칩니다.',
          one_time_availability_duplicate: '같은 일회성 블럭이 이미 존재합니다.',
          exception_duplicate: '같은 예외 블럭이 이미 존재합니다.',
          time_must_align_to_30_min: '시간은 30분 단위(00분/30분)로만 입력할 수 있습니다.',
          teacher_private_comment: '선생님 메모를 입력해 주세요.',
          student_comment: '학생 전달 코멘트를 입력해 주세요.',
          at_least_one_comment_is_required: '수정할 코멘트를 하나 이상 입력해 주세요.',
          'cancel_reason is required': '취소 사유를 입력해 주세요.',
          'teacher_private_comment is required': '선생님 메모를 입력해 주세요.',
          'student_comment is required': '학생 전달 코멘트를 입력해 주세요.',
          'teacher_user_id must be a positive integer': '선생님 ID는 양의 정수여야 합니다.',
          'email already exists': '이미 사용 중인 아이디입니다.',
          'login_id already exists': '이미 사용 중인 아이디입니다.',
          'phone already exists': '이미 사용 중인 휴대폰번호입니다.',
          'email and password are required': '아이디와 비밀번호를 입력해 주세요.',
          'login_id and password are required': '아이디와 비밀번호를 입력해 주세요.',
          'login_id, phone, password, name, role are required': '아이디/휴대폰/비밀번호/이름/역할을 모두 입력해 주세요.',
          'login_id must be 3~60 characters': '아이디는 3~60자여야 합니다.',
          'at least one of name, phone is required': '이름 또는 휴대폰번호를 입력해 주세요.',
          'name is required': '이름을 입력해 주세요.',
          'name must be 80 characters or fewer': '이름은 80자 이하여야 합니다.',
          'current_password and new_password are required': '현재 비밀번호와 새 비밀번호를 입력해 주세요.',
          invalid_current_password: '현재 비밀번호가 올바르지 않습니다.',
          'new_password must be at least 8 characters': '새 비밀번호는 8자 이상이어야 합니다.',
          'phone is invalid': '휴대폰번호 형식이 올바르지 않습니다.',
          'student_user_id or student_email is required': '회원 학생 정보(학생 ID/이메일)를 입력해 주세요.',
          'start_at is required (ISO datetime)': '예약 시작시간이 필요합니다.',
          'display_name must be 80 characters or fewer': '표시 이름은 80자 이하여야 합니다.',
          'bio must be 2000 characters or fewer': '프로필 소개는 2000자 이하여야 합니다.',
          'student_cancel_day_before_hour must be 0~23': '학생 취소 마감 시각은 0~23 사이여야 합니다.',
          'student_notice must be 4000 characters or fewer': '학생 공지사항은 4000자 이하여야 합니다.',
        };
        return map[code] || '';
      }

      function getErrorMessage(err) {
        if (err?.payload?.error) {
          const localized = translateApiError(err.payload.error, err.payload);
          if (localized) return localized;
          return String(err.payload.error);
        }
        if (err?.message) return String(err.message);
        return String(err);
      }

      async function runAction(label, fn) {
        try {
          await fn();
        } catch (err) {
          const message = getErrorMessage(err);
          pushLog(`${label} FAILED`, { message, payload: err?.payload });
          showToast(`${label} 실패: ${message}`, 'error', 3600);
        }
      }

      function formObject(form) {
        return Object.fromEntries(new FormData(form).entries());
      }

      function parseRequiredId(value, label) {
        const parsed = Number.parseInt(String(value || ''), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`${label}는 양의 정수여야 합니다.`);
        }
        return parsed;
      }

      function parseOptionalId(value) {
        const parsed = Number.parseInt(String(value || ''), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return null;
        }
        return parsed;
      }

      function formatDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleString('ko-KR', { hour12: false });
      }

      function formatTime(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      }

      function escapeHtml(value) {
        return String(value || '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function decodeURIComponentSafe(value) {
        const text = String(value || '');
        try {
          return decodeURIComponent(text);
        } catch (_) {
          return text;
        }
      }

      function statusText(status) {
        const map = {
          PENDING: '승인대기',
          BOOKED: '예약확정',
          CANCELED_BY_STUDENT: '학생취소',
          CANCELED_BY_TEACHER: '선생님취소',
          COMPLETED: '완료',
          NO_SHOW: '노쇼',
        };
        return map[status] || status || '-';
      }

      function statusBadge(status) {
        const safe = String(status || 'UNKNOWN').replace(/[^A-Z_]/g, '');
        return `<span class="status-badge status-${safe}">${statusText(status)}</span>`;
      }

      function toDateKeyFromDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      function toDateKeyFromIso(iso) {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? '' : toDateKeyFromDate(d);
      }

      function parseDateKey(key) {
        return new Date(`${key}T00:00:00`);
      }

      function formatDateKeyLabel(dateKey) {
        const d = parseDateKey(dateKey);
        if (Number.isNaN(d.getTime())) return dateKey;
        return d.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
        });
      }

      const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

      function weekdayLabel(value) {
        const index = Number.parseInt(String(value || ''), 10);
        if (!Number.isInteger(index) || index < 0 || index > 6) return '-';
        return `${WEEKDAY_LABELS[index]}요일`;
      }

      function startOfWeek(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        return d;
      }

      function weekRange(cursorDate) {
        const from = startOfWeek(cursorDate);
        const to = new Date(from);
        to.setDate(to.getDate() + 7);
        return { from, to };
      }

      function startOfMonth(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(1);
        return d;
      }

      function monthGridRange(cursorDate) {
        const first = startOfMonth(cursorDate);
        const from = startOfWeek(first);
        const to = new Date(from);
        to.setDate(to.getDate() + 42);
        return { from, to };
      }

      function formatMonthLabel(cursorDate) {
        const d = startOfMonth(cursorDate);
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
      }

      function currentStudentCalendarRange() {
        if (state.studentCalendarView === 'month') {
          return monthGridRange(state.monthCursor);
        }
        return weekRange(state.monthCursor);
      }

      async function ensureHolidayCacheForYear(year) {
        const key = String(year);
        if (state.loadedHolidayYears[key]) return;
        state.loadedHolidayYears[key] = 'loading';
        try {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
          if (!res.ok) {
            throw new Error(`holiday api failed: ${res.status}`);
          }
          const items = await res.json();
          for (const row of items || []) {
            const dateKey = String(row?.date || '').trim();
            if (!dateKey) continue;
            state.holidaysByDate[dateKey] = String(row?.localName || row?.name || '공휴일');
          }
          state.loadedHolidayYears[key] = 'loaded';
        } catch (err) {
          state.loadedHolidayYears[key] = 'failed';
          pushLog('공휴일 로드 실패', { year, message: err?.message || String(err) });
        }
      }

      async function ensureHolidayCacheForRange(from, to) {
        const startYear = from.getFullYear();
        const endYear = to.getFullYear();
        for (let year = startYear; year <= endYear; year += 1) {
          await ensureHolidayCacheForYear(year);
        }
      }

      function formatWeekLabel(cursorDate) {
        const start = startOfWeek(cursorDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
      }

      function applyStudentCalendarViewUi() {
        if (studentWeekViewBtn) {
          studentWeekViewBtn.classList.toggle('primary', state.studentCalendarView === 'week');
        }
        if (studentMonthViewBtn) {
          studentMonthViewBtn.classList.toggle('primary', state.studentCalendarView === 'month');
        }
        if (prevMonthBtn) {
          prevMonthBtn.textContent = state.studentCalendarView === 'month' ? '이전 달' : '이전 주';
        }
        if (nextMonthBtn) {
          nextMonthBtn.textContent = state.studentCalendarView === 'month' ? '다음 달' : '다음 주';
        }
      }

      function timeLabelFromMinutes(totalMinutes) {
        const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
        const minutes = String(totalMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
      }

      function minutesFromTimeLocal(timeText) {
        const [hh, mm] = String(timeText || '')
          .slice(0, 5)
          .split(':')
          .map((v) => Number(v));
        if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return hh * 60 + mm;
      }

      function addMinutesToLocalTime(timeText, addMinutes) {
        const start = minutesFromTimeLocal(timeText);
        if (start === null) return null;
        const end = start + addMinutes;
        if (end <= 0 || end > 24 * 60) return null;
        return timeLabelFromMinutes(end);
      }

      function isAlignedToMinutes(totalMinutes, stepMinutes = TIME_ALIGNMENT_MIN) {
        if (!Number.isInteger(totalMinutes) || !Number.isInteger(stepMinutes) || stepMinutes <= 0) {
          return false;
        }
        return totalMinutes % stepMinutes === 0;
      }

      function ensureTimeRangeAligned(startTime, endTime, label = '시간') {
        const startMinute = minutesFromTimeLocal(startTime);
        const endMinute = minutesFromTimeLocal(endTime);
        if (startMinute === null || endMinute === null || startMinute >= endMinute) {
          throw new Error(`${label}의 시작/종료를 올바르게 입력해 주세요.`);
        }
        if (!isAlignedToMinutes(startMinute) || !isAlignedToMinutes(endMinute)) {
          throw new Error(`${label}은 30분 단위(00분/30분)로만 입력할 수 있습니다.`);
        }
        return { startMinute, endMinute };
      }

      function buildCalendarInviteUrl(teacherUserId) {
        return `${window.location.origin}/student-calendar.html?teacher=${encodeURIComponent(String(teacherUserId))}`;
      }

      function buildLessonInviteUrl(teacherUserId, startAtIso) {
        const params = new URLSearchParams({
          teacher: String(teacherUserId),
          start_at: String(startAtIso),
        });
        return `${window.location.origin}/student-calendar.html?${params.toString()}`;
      }

      function renderTeacherProfileForm() {
        if (!teacherProfileForm) return;
        const profile = state.teacherProfile || {};
        const cancelHour = Number.parseInt(profile.student_cancel_day_before_hour, 10);
        teacherProfileForm.elements.display_name.value = String(profile.display_name || '');
        teacherProfileForm.elements.bio.value = String(profile.bio || '');
        teacherProfileForm.elements.student_cancel_day_before_hour.value = Number.isInteger(cancelHour)
          ? String(cancelHour)
          : '21';
        teacherProfileForm.elements.timezone.value = String(profile.timezone || 'Asia/Seoul');
        teacherProfileForm.elements.student_notice.value = String(profile.student_notice || '');
      }

      function renderLessonCatalog() {
        if (!lessonCatalogList || PAGE_MODE !== 'TEACHER') return;
        const grouped = new Map();
        for (const slots of Object.values(state.slotsByDate || {})) {
          for (const slot of slots || []) {
            if (!slot.is_available) continue;
            const title = String(slot.lesson_title || '').trim() || '일반 수업';
            if (!grouped.has(title)) {
              grouped.set(title, []);
            }
            grouped.get(title).push(slot);
          }
        }

        const items = Array.from(grouped.entries())
          .map(([title, slots]) => ({
            title,
            slots: slots.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
          }))
          .sort((a, b) => a.title.localeCompare(b.title, 'ko'));

        if (!items.length) {
          lessonCatalogList.innerHTML = '<div class="hint">오픈된 레슨 항목이 없습니다.</div>';
          return;
        }

        lessonCatalogList.innerHTML = '';
        for (const item of items) {
          const firstSlot = item.slots[0];
          const row = document.createElement('div');
          row.className = 'slot-row';
          row.innerHTML = `
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <div class="hint mono">오픈 슬롯 ${item.slots.length}개 · 다음 수업 ${formatDateTime(firstSlot.start_at)}</div>
            </div>
            <div class="actions">
              <button type="button" data-copy-lesson-catalog-start-at="${escapeHtml(firstSlot.start_at)}">링크 복사</button>
            </div>
          `;
          lessonCatalogList.appendChild(row);
        }
      }

      function renderTeacherOpenSlotList() {
        if (!teacherOpenSlotList || PAGE_MODE !== 'TEACHER') return;
        const { from } = weekRange(state.teacherWeekCursor);
        const days = buildWeekDays(from);
        const openSlots = [];
        for (const day of days) {
          const dateKey = toDateKeyFromDate(day);
          const slots = (state.slotsByDate[dateKey] || [])
            .filter((slot) => slot.is_available)
            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          for (const slot of slots) {
            openSlots.push(slot);
          }
        }

        if (!openSlots.length) {
          teacherOpenSlotList.innerHTML = '<div class="hint">이번 주에 학생에게 열려 있는 슬롯이 없습니다.</div>';
          renderLessonCatalog();
          return;
        }

        teacherOpenSlotList.innerHTML = '';
        for (const slot of openSlots) {
          const row = document.createElement('div');
          row.className = 'slot-row';
          const title = String(slot.lesson_title || '').trim() || '수업';
          const durationMin = Number.parseInt(slot.duration_min, 10) || state.teacherGridStepMin || 30;
          row.innerHTML = `
            <div>
              <strong>${escapeHtml(title)}</strong>
              <div class="hint mono">${formatDateTime(slot.start_at)} ~ ${formatDateTime(slot.end_at)}</div>
            </div>
            <div class="actions">
              <button type="button" data-copy-lesson-link-start-at="${escapeHtml(slot.start_at)}">레슨 링크 복사</button>
              <button type="button" data-book-slot-on-behalf="${escapeHtml(slot.start_at)}" data-book-slot-duration="${durationMin}">대리 예약</button>
            </div>
          `;
          teacherOpenSlotList.appendChild(row);
        }
        renderLessonCatalog();
      }

      function clearTeacherTouchState() {
        if (state.teacherTouch.timerId) {
          window.clearTimeout(state.teacherTouch.timerId);
          state.teacherTouch.timerId = null;
        }
        state.teacherTouch.started = false;
        state.teacherTouch.startMeta = null;
        state.teacherTouch.startTarget = null;
        state.teacherTouch.startX = 0;
        state.teacherTouch.startY = 0;
      }

      function setTeacherCreateSubmitting(submitting) {
        state.teacherCreateSubmitting = Boolean(submitting);
        if (teacherCreateSaveBtn) {
          teacherCreateSaveBtn.disabled = state.teacherCreateSubmitting;
          teacherCreateSaveBtn.textContent = state.teacherCreateSubmitting ? '저장 중...' : '일정 저장';
        }
      }

      function setTeacherExceptionSubmitting(submitting) {
        state.teacherExceptionSubmitting = Boolean(submitting);
        if (teacherExceptionSaveBtn) {
          teacherExceptionSaveBtn.disabled = state.teacherExceptionSubmitting;
          teacherExceptionSaveBtn.textContent = state.teacherExceptionSubmitting ? '저장 중...' : '불가 일정 저장';
        }
      }

      function getCellMetaFromEventTarget(target) {
        const cell = target?.closest?.('td.week-cell');
        if (!cell) return null;
        const dateKey = cell.getAttribute('data-date-key');
        const minute = Number.parseInt(cell.getAttribute('data-minute') || '', 10);
        if (!dateKey || !Number.isInteger(minute)) return null;
        return { cell, dateKey, minute };
      }

      function getCellMetaFromPoint(clientX, clientY) {
        const target = document.elementFromPoint(clientX, clientY);
        return getCellMetaFromEventTarget(target);
      }

      function getTeacherDragPreview(drag = state.teacherDrag) {
        if (!drag) return null;

        if (drag.mode === 'create') {
          if (drag.dateKey !== drag.currentDateKey) return null;
          const startMinute = Math.min(drag.startMinute, drag.currentMinute);
          const endMinute = Math.max(drag.startMinute, drag.currentMinute);
          const endMinuteExclusive = endMinute + drag.step;
          if (endMinuteExclusive > 24 * 60) return null;
          return {
            mode: 'create',
            dateKey: drag.dateKey,
            weekday: parseDateKey(drag.dateKey).getDay(),
            startMinute,
            endMinute,
            endMinuteExclusive,
            durationMin: endMinuteExclusive - startMinute,
          };
        }

        if (drag.mode === 'move') {
          const startMinute = drag.currentMinute;
          const endMinuteExclusive = startMinute + drag.originalDuration;
          if (endMinuteExclusive > 24 * 60 || startMinute < 0) return null;
          return {
            mode: 'move',
            availabilityId: drag.availabilityId,
            dateKey: drag.currentDateKey,
            weekday: parseDateKey(drag.currentDateKey).getDay(),
            startMinute,
            endMinute: endMinuteExclusive - drag.step,
            endMinuteExclusive,
            durationMin: drag.originalDuration,
            originalWeekday: drag.originalWeekday,
            originalStartMinute: drag.originalStartMinute,
            originalEndMinuteExclusive: drag.originalEndMinuteExclusive,
            isActive: drag.isActive,
          };
        }

        if (drag.mode === 'resize') {
          if (drag.dateKey !== drag.currentDateKey) return null;
          const rawEndExclusive = drag.currentMinute + drag.step;
          const endMinuteExclusive = Math.max(drag.startMinute + drag.step, rawEndExclusive);
          if (endMinuteExclusive > 24 * 60) return null;
          return {
            mode: 'resize',
            availabilityId: drag.availabilityId,
            dateKey: drag.dateKey,
            weekday: drag.originalWeekday,
            startMinute: drag.startMinute,
            endMinute: endMinuteExclusive - drag.step,
            endMinuteExclusive,
            durationMin: endMinuteExclusive - drag.startMinute,
            originalWeekday: drag.originalWeekday,
            originalStartMinute: drag.originalStartMinute,
            originalEndMinuteExclusive: drag.originalEndMinuteExclusive,
            isActive: drag.isActive,
          };
        }

        return null;
      }

      function renderTeacherDragHint(preview) {
        if (!preview || !state.teacherDrag) {
          teacherDragHint.classList.add('hidden');
          return;
        }
        const modeText = preview.mode === 'create' ? '생성' : preview.mode === 'move' ? '이동' : '길이조절';
        const startText = timeLabelFromMinutes(preview.startMinute);
        const endText = timeLabelFromMinutes(preview.endMinuteExclusive);
        teacherDragHint.textContent = `${modeText} ${startText}-${endText} (${preview.durationMin}분)`;
        const x = Math.min(window.innerWidth - 170, Math.max(8, (state.teacherDrag.pointerX || 20) + 14));
        const y = Math.min(window.innerHeight - 40, Math.max(8, (state.teacherDrag.pointerY || 20) + 14));
        teacherDragHint.style.left = `${x}px`;
        teacherDragHint.style.top = `${y}px`;
        teacherDragHint.classList.remove('hidden');
      }

      function applyPageSection(role) {
        const setVisible = (id, visible) => {
          const el = document.getElementById(id);
          if (el) {
            el.classList.toggle('hidden', !visible);
          }
        };

        if (role === 'STUDENT') {
          const showCalendar = PAGE_SECTION === 'all' || PAGE_SECTION === 'calendar';
          const showBookings = PAGE_SECTION === 'all' || PAGE_SECTION === 'bookings';
          setVisible('studentCalendarSection', showCalendar);
          setVisible('studentBookingsSection', showBookings);
        }

        if (role === 'TEACHER') {
          const showCalendar = PAGE_SECTION === 'all' || PAGE_SECTION === 'calendar';
          const showManage = PAGE_SECTION === 'all' || PAGE_SECTION === 'manage';
          const showBookings = PAGE_SECTION === 'all' || PAGE_SECTION === 'bookings';
          const showCompleted = PAGE_SECTION === 'all' || PAGE_SECTION === 'completed';
          setVisible('teacherCalendarSection', showCalendar);
          setVisible('teacherManageSection', showManage);
          setVisible('teacherBookingsSection', showBookings);
          setVisible('teacherCompletedSection', showCompleted);
        }

        for (const link of sectionLinks) {
          const isActive = String(link.dataset.navSection || '') === PAGE_SECTION;
          link.classList.toggle('active', isActive);
          if (isActive) {
            link.setAttribute('aria-current', 'page');
          } else {
            link.removeAttribute('aria-current');
          }
        }
      }

      function applyTopNavState() {
        const navLinks = Array.from(document.querySelectorAll('.top-links a'));
        const currentPath = String(window.location.pathname || '/').toLowerCase();
        for (const link of navLinks) {
          let hrefPath = '';
          try {
            hrefPath = new URL(link.href, window.location.origin).pathname.toLowerCase();
          } catch (_) {
            hrefPath = '';
          }
          const active = hrefPath && (hrefPath === currentPath || (hrefPath === '/index.html' && currentPath === '/'));
          link.classList.toggle('is-active', Boolean(active));
          if (active) {
            link.setAttribute('aria-current', 'page');
          } else {
            link.removeAttribute('aria-current');
          }
        }
      }

      function renderAuth() {
        if (state.user) {
          const loginId = state.user.login_id || state.user.email || '-';
          const phone = state.user.phone ? ` / ${state.user.phone}` : '';
          authStatus.textContent = `로그인: ${loginId}${phone} (${state.user.role})`;
          rolePill.textContent = state.user.role === 'TEACHER' ? '선생님 모드' : '학생 모드';
          rolePill.classList.remove('hidden');
        } else if (state.token) {
          authStatus.textContent = '토큰은 있으나 사용자 정보는 미확인 상태입니다.';
          rolePill.classList.add('hidden');
        } else {
          authStatus.textContent = '로그인되지 않았습니다.';
          rolePill.classList.add('hidden');
        }
        document.body.classList.toggle('session-ready', Boolean(state.user));

        const role = state.user?.role;
        if (PAGE_MODE === 'TEACHER') {
          teacherView.classList.toggle('hidden', role !== 'TEACHER');
          studentView.classList.add('hidden');
          if (role === 'TEACHER') {
            applyPageSection('TEACHER');
          }
        } else {
          teacherView.classList.add('hidden');
          studentView.classList.remove('hidden');
          applyPageSection('STUDENT');
        }
        renderAccountForms();
      }

      function renderAccountForms() {
        const user = state.user || {};
        if (studentProfileForm) {
          studentProfileForm.elements.name.value = String(user.name || '');
          studentProfileForm.elements.phone.value = String(user.phone || '');
        }
        if (teacherAccountForm) {
          teacherAccountForm.elements.name.value = String(user.name || '');
          teacherAccountForm.elements.phone.value = String(user.phone || '');
        }
      }

      function setAuth(token, user) {
        state.token = token || '';
        state.user = user || null;
        if (state.token) {
          localStorage.setItem('lb_token', state.token);
        } else {
          localStorage.removeItem('lb_token');
        }
        renderAuth();
      }

      async function api(path, options = {}) {
        const { method = 'GET', body, auth = false } = options;
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (auth) {
          if (!state.token) throw new Error('로그인 토큰이 없습니다.');
          headers.Authorization = `Bearer ${state.token}`;
        }

        const res = await fetch(path, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const raw = await res.text();
        let payload = { raw };
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch (_) {
            payload = { raw };
          }
        }

        pushLog(`${method} ${path} -> ${res.status}`, payload);
        if (!res.ok) {
          const err = new Error(`${method} ${path} failed (${res.status})`);
          err.payload = payload;
          if (auth && res.status === 401) {
            setAuth('', null);
            window.location.href = '/index.html';
          }
          throw err;
        }
        return payload;
      }

      async function syncMe() {
        if (!state.token) {
          setAuth('', null);
          return;
        }
        const result = await api('/api/v1/auth/me', { auth: true });
        state.user = result.user;
        renderAuth();
      }

      async function saveMyProfile(formEl) {
        if (!formEl) return;
        const form = formObject(formEl);
        const result = await api('/api/v1/users/me/profile', {
          method: 'PATCH',
          auth: true,
          body: {
            name: String(form.name || '').trim(),
            phone: String(form.phone || '').trim(),
          },
        });
        if (result?.user) {
          state.user = result.user;
          renderAuth();
        } else {
          await syncMe();
        }
      }

      async function changeMyPassword(formEl) {
        if (!formEl) return;
        const form = formObject(formEl);
        await api('/api/v1/users/me/password', {
          method: 'PATCH',
          auth: true,
          body: {
            current_password: String(form.current_password || ''),
            new_password: String(form.new_password || ''),
          },
        });
        formEl.reset();
      }

      function renderTeachers(items) {
        teacherSelect.innerHTML = '';
        if (!items.length) {
          teacherSelect.innerHTML = '<option value="">(선생님 없음)</option>';
          state.selectedTeacherId = '';
          renderStudentMeta();
          return;
        }

        for (const teacher of items) {
          const opt = document.createElement('option');
          opt.value = String(teacher.id);
          opt.textContent = `${teacher.name} (#${teacher.id})`;
          teacherSelect.appendChild(opt);
        }

        if (
          PAGE_MODE === 'TEACHER' &&
          state.user?.role === 'TEACHER' &&
          items.some((it) => String(it.id) === String(state.user.id))
        ) {
          state.selectedTeacherId = String(state.user.id);
        } else if (
          state.invitedTeacherId &&
          items.some((it) => String(it.id) === String(state.invitedTeacherId))
        ) {
          state.selectedTeacherId = String(state.invitedTeacherId);
          state.invitedTeacherId = null;
        } else if (!state.selectedTeacherId || !items.some((it) => String(it.id) === String(state.selectedTeacherId))) {
          state.selectedTeacherId = String(items[0].id);
        }
        teacherSelect.value = state.selectedTeacherId;
        renderStudentMeta();
      }

      function renderStudentMeta() {
        const teacher = state.teachers.find((t) => String(t.id) === String(state.selectedTeacherId));
        if (!teacher) {
          studentTeacherMeta.textContent = '선생님을 선택하세요';
          studentPolicyWindow.textContent = '예약 가능 범위: -';
          studentPolicyCutoff.textContent = '취소 마감: -';
          if (studentTeacherNotice) {
            studentTeacherNotice.textContent = '선생님을 선택하면 공지사항이 표시됩니다.';
          }
          return;
        }

        studentTeacherMeta.textContent = `담당: ${teacher.name} · ${teacher.timezone}`;
        studentPolicyWindow.textContent = `예약 가능 범위: 오늘부터 ${teacher.booking_window_days}일`;
        const cancelHour = Number.parseInt(teacher.student_cancel_day_before_hour, 10);
        studentPolicyCutoff.textContent = Number.isInteger(cancelHour)
          ? `학생 취소 마감: 수업 전날 ${String(cancelHour).padStart(2, '0')}:00`
          : '학생 취소 마감: 수업 전날 21:00';
        if (studentTeacherNotice) {
          const notice = String(teacher.student_notice || '').trim();
          studentTeacherNotice.textContent = notice || '등록된 공지사항이 없습니다.';
        }
      }

      async function loadTeachers() {
        const result = await api('/api/v1/teachers');
        state.teachers = result.items || [];
        renderTeachers(state.teachers);
      }

      function getSlotsForDateKey(dateKey) {
        return state.slotsByDate[dateKey] || [];
      }

      function pickDefaultSelectedDate() {
        if (state.selectedDateKey && getSlotsForDateKey(state.selectedDateKey).length) return;

        const keys = Object.keys(state.slotsByDate).sort();
        const firstWithOpen = keys.find((key) => getSlotsForDateKey(key).some((it) => it.is_available));
        state.selectedDateKey = firstWithOpen || keys[0] || '';
      }

      function renderStudentStats() {
        const allSlots = Object.values(state.slotsByDate).flat();
        const openSlots = allSlots.filter((slot) => slot.is_available);
        const activeBookings = (state.studentBookings || []).filter((booking) =>
          ['PENDING', 'BOOKED'].includes(booking.status)
        );

        studentTotalSlots.textContent = String(allSlots.length);
        studentOpenSlots.textContent = String(openSlots.length);
        studentActiveBookings.textContent = String(activeBookings.length);
      }

      function renderTeacherStats() {
        const activeWeekly = (state.teacherAvailability || []).filter((row) => row.is_active);
        const activeOneTime = (state.teacherOneTimeAvailability || []).filter((row) => row.is_active);
        const activeTeacherBookings = state.teacherActiveBookings || [];

        teacherAvailCount.textContent = String(activeWeekly.length + activeOneTime.length);
        teacherExceptionCount.textContent = String((state.teacherExceptions || []).length);
        teacherActiveBookingCount.textContent = String(activeTeacherBookings.length);
      }

      function buildWeekDays(cursorDate) {
        const start = startOfWeek(cursorDate);
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          return d;
        });
      }

      function renderStudentWeekCalendar() {
        monthLabel.textContent = formatWeekLabel(state.monthCursor);
        const days = buildWeekDays(state.monthCursor);
        const now = new Date();
        const todayKey = toDateKeyFromDate(now);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const step = Math.max(10, Number.parseInt(studentGridStep.value || state.studentGridStepMin, 10) || 60);
        state.studentGridStepMin = step;

        const slotsByDate = new Map();
        for (const [dateKey, slots] of Object.entries(state.slotsByDate || {})) {
          const list = [];
          for (const slot of slots) {
            const startDate = new Date(slot.start_at);
            const endDate = new Date(slot.end_at);
            if (Number.isNaN(startDate.getTime())) continue;
            let startMinute = startDate.getHours() * 60 + startDate.getMinutes();
            let endMinute = Number.isNaN(endDate.getTime())
              ? startMinute + (Number.parseInt(slot.duration_min, 10) || step)
              : endDate.getHours() * 60 + endDate.getMinutes();
            if (!Number.isInteger(endMinute) || endMinute <= startMinute) {
              endMinute = startMinute + step;
            }
            list.push({
              startMinute,
              endMinute,
              slot,
            });
          }
          list.sort((a, b) => a.startMinute - b.startMinute);
          slotsByDate.set(dateKey, list);
        }

        let rows = '';
        for (let minute = 0; minute < 24 * 60; minute += step) {
          const bucketEnd = minute + step;
          let cells = '';
          for (const day of days) {
            const dateKey = toDateKeyFromDate(day);
            const holidayName = state.holidaysByDate[dateKey] || '';
            const daySlots = slotsByDate.get(dateKey) || [];
            const overlapEntries = daySlots.filter((item) => item.startMinute < bucketEnd && item.endMinute > minute);
            const hasAvailable = overlapEntries.some((item) => item.slot?.is_available);
            const hasDisplayableBooked = !state.availableOnly && overlapEntries.some((item) => !item.slot?.is_available);
            const startAvailableEntry =
              overlapEntries.find(
                (item) => item.slot?.is_available && item.startMinute >= minute && item.startMinute < bucketEnd
              ) || null;
            const startBookedEntry =
              overlapEntries.find(
                (item) => !item.slot?.is_available && item.startMinute >= minute && item.startMinute < bucketEnd
              ) || null;
            const classes = ['week-cell'];
            if (dateKey === state.selectedDateKey) classes.push('selected');
            if (dateKey < todayKey || (dateKey === todayKey && minute < nowMinutes)) classes.push('past');
            if (hasAvailable) classes.push('has-available');
            else if (hasDisplayableBooked) classes.push('has-booked');
            if (holidayName) classes.push('holiday');

            let content = `<button type="button" class="week-create-btn" data-pick-date="${dateKey}">+</button>`;
            if (startAvailableEntry?.slot) {
              const slot = startAvailableEntry.slot;
              const slotTitle = (slot.lesson_title || '').trim();
              const label = slotTitle || '수강신청';
              const duration = Number.parseInt(slot.duration_min, 10) || step;
              content = `<button type="button" class="week-slot-btn available" data-book-slot="${slot.start_at}" data-book-duration="${duration}" data-pick-date="${dateKey}" title="${escapeHtml(slotTitle || '예약 가능')}">${escapeHtml(label)}</button>`;
            } else if (startBookedEntry?.slot && !state.availableOnly) {
              content = '<span class="week-booked-chip">마감</span>';
            } else if (overlapEntries.length && state.availableOnly && !hasAvailable) {
              content = '';
            }

            cells += `<td class="${classes.join(' ')}" data-pick-date="${dateKey}">${content}</td>`;
          }
          rows += `<tr><th scope="row" class="week-time">${timeLabelFromMinutes(minute)}</th>${cells}</tr>`;
        }

        const header = days
          .map((day, index) => {
            const dateKey = toDateKeyFromDate(day);
            const isToday = dateKey === todayKey;
            const holidayName = state.holidaysByDate[dateKey] || '';
            const classes = ['week-day-head'];
            if (holidayName) classes.push('holiday');
            return `<th scope="col" class="${classes.join(' ')}"><strong>${WEEKDAY_LABELS[index]}${isToday ? ' · 오늘' : ''}</strong>${day.getMonth() + 1}/${day.getDate()}${holidayName ? `<span class="holiday-caption">${escapeHtml(holidayName)}</span>` : ''}</th>`;
          })
          .join('');

        calendarGrid.innerHTML = `
          <table class="week-table">
            <thead>
              <tr>
                <th scope="col" class="week-time-head">시간</th>
                ${header}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      }

      function renderStudentMonthCalendar() {
        monthLabel.textContent = formatMonthLabel(state.monthCursor);
        const { from } = monthGridRange(state.monthCursor);
        const todayKey = toDateKeyFromDate(new Date());
        const myBookingByDate = new Map();
        for (const booking of state.studentBookings || []) {
          const dateKey = toDateKeyFromIso(booking.start_at);
          if (!dateKey) continue;
          myBookingByDate.set(dateKey, (myBookingByDate.get(dateKey) || 0) + 1);
        }

        const weeks = [];
        for (let week = 0; week < 6; week += 1) {
          const row = [];
          for (let day = 0; day < 7; day += 1) {
            const date = new Date(from);
            date.setDate(from.getDate() + week * 7 + day);
            row.push(date);
          }
          weeks.push(row);
        }

        const currentMonth = startOfMonth(state.monthCursor).getMonth();
        const header = WEEKDAY_LABELS.map((label) => `<th scope="col" class="month-day-head">${label}</th>`).join('');
        const bodyRows = weeks
          .map((week) => {
            const tds = week
              .map((date) => {
                const dateKey = toDateKeyFromDate(date);
                const slots = getSlotsForDateKey(dateKey);
                const openCount = slots.filter((slot) => slot.is_available).length;
                const bookedCount = slots.length - openCount;
                const myCount = myBookingByDate.get(dateKey) || 0;
                const holidayName = state.holidaysByDate[dateKey] || '';
                const classes = ['month-cell'];
                if (date.getMonth() !== currentMonth) classes.push('out-month');
                if (dateKey === todayKey) classes.push('today');
                if (dateKey === state.selectedDateKey) classes.push('selected');
                if (openCount > 0) classes.push('has-available');
                if (bookedCount > 0) classes.push('has-booked');
                if (myCount > 0) classes.push('has-my-booking');
                if (holidayName) classes.push('holiday');
                return `
                  <td class="${classes.join(' ')}" data-pick-date="${dateKey}">
                    <div class="month-date">${date.getDate()}</div>
                    ${holidayName ? `<div class="month-holiday">${escapeHtml(holidayName)}</div>` : ''}
                    <div class="month-metrics">
                      <span class="metric open">가능 ${openCount}</span>
                      <span class="metric close">마감 ${bookedCount}</span>
                      <span class="metric mine">내예약 ${myCount}</span>
                    </div>
                  </td>
                `;
              })
              .join('');
            return `<tr>${tds}</tr>`;
          })
          .join('');

        calendarGrid.innerHTML = `
          <table class="month-table">
            <thead><tr>${header}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        `;
      }

      function renderCalendar() {
        applyStudentCalendarViewUi();
        if (state.studentCalendarView === 'month') {
          renderStudentMonthCalendar();
        } else {
          renderStudentWeekCalendar();
        }

        calendarGrid.onclick = (event) => {
          const bookButton = event.target.closest('[data-book-slot]');
          if (bookButton) {
            const startAt = bookButton.getAttribute('data-book-slot');
            const durationMin = Number.parseInt(bookButton.getAttribute('data-book-duration') || '', 10);
            const pickDate = bookButton.getAttribute('data-pick-date');
            if (pickDate) state.selectedDateKey = pickDate;
            runAction('수강신청', async () => {
              if (!confirmBookingRequest(startAt, durationMin)) return;
              await createBooking(startAt, durationMin);
              await loadSlotsForCurrentMonth();
              await loadMyBookings();
            });
            return;
          }

          const pickTarget = event.target.closest('[data-pick-date]');
          if (!pickTarget) return;
          state.selectedDateKey = pickTarget.getAttribute('data-pick-date');
          renderCalendar();
          renderDaySlots();
        };
      }

      function renderDaySlots() {
        daySlotsList.innerHTML = '';
        if (!state.selectedDateKey) {
          selectedDateLabel.textContent = '선택 가능한 날짜가 없습니다.';
          daySlotSummary.textContent = '총 0개 · 예약 가능 0개 · 마감 0개';
          daySlotsList.innerHTML = '<div class="hint">캘린더 범위를 조정하거나 선생님을 변경해보세요.</div>';
          return;
        }

        const date = parseDateKey(state.selectedDateKey);
        selectedDateLabel.textContent = `${date.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })}`;

        const slots = [...getSlotsForDateKey(state.selectedDateKey)]
          .filter((slot) => (state.availableOnly ? slot.is_available : true))
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const openCount = slots.filter((slot) => slot.is_available).length;
        const closedCount = slots.length - openCount;
        daySlotSummary.textContent = `총 ${slots.length}개 · 예약 가능 ${openCount}개 · 마감 ${closedCount}개`;

        if (!slots.length) {
          daySlotsList.innerHTML = '<div class="hint">선택 조건에 맞는 슬롯이 없습니다.</div>';
          return;
        }

        for (const slot of slots) {
          const row = document.createElement('div');
          row.className = `slot-item ${slot.is_available ? '' : 'booked'}`;
          const isInvitedSlot = Boolean(state.invitedStartAtIso) && String(slot.start_at) === String(state.invitedStartAtIso);
          if (isInvitedSlot) {
            row.style.outline = '2px solid #4b7ec3';
            row.style.outlineOffset = '2px';
          }

          const info = document.createElement('div');
          const slotTitle = escapeHtml(slot.lesson_title || '일반 수업');
          const invitedBadge = isInvitedSlot ? ' · <span class="status-badge status-TRUE">공유 링크</span>' : '';
          info.innerHTML = `<strong>${formatTime(slot.start_at)} - ${formatTime(slot.end_at)}</strong><br /><small>${slotTitle} · ${slot.is_available ? '<span class="status-badge status-AVAILABLE">예약 가능</span>' : '이미 예약됨'}${invitedBadge}</small>`;

          const action = document.createElement('button');
          action.type = 'button';
          action.textContent = slot.is_available ? (isInvitedSlot ? '공유 레슨 예약' : '예약') : '예약됨';
          action.disabled = !slot.is_available;
          if (slot.is_available) action.className = 'primary';

          action.addEventListener('click', () => {
            runAction('예약 생성', async () => {
              const durationMin = Number.parseInt(slot.duration_min, 10) || state.studentGridStepMin;
              if (!confirmBookingRequest(slot.start_at, durationMin)) return;
              await createBooking(slot.start_at, durationMin);
              await loadSlotsForCurrentMonth();
              await loadMyBookings();
            });
          });

          row.appendChild(info);
          row.appendChild(action);
          daySlotsList.appendChild(row);
        }
      }

      async function loadSlotsForCurrentMonth() {
        const teacherId = parseOptionalId(teacherSelect.value || state.selectedTeacherId);
        if (!teacherId) {
          state.slotsByDate = {};
          state.selectedDateKey = '';
          renderCalendar();
          renderDaySlots();
          renderStudentStats();
          renderTeacherOpenSlotList();
          return;
        }
        const isTeacherMode = PAGE_MODE === 'TEACHER' && state.user?.role === 'TEACHER';
        const { from, to } = isTeacherMode ? weekRange(state.teacherWeekCursor) : currentStudentCalendarRange();
        await ensureHolidayCacheForRange(from, to);
        const stepMinForQuery = isTeacherMode ? state.teacherGridStepMin || 30 : state.studentGridStepMin || 30;

        const result = await api(
          `/api/v1/teachers/${teacherId}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&step_min=${encodeURIComponent(String(stepMinForQuery))}`,
          {}
        );

        const grouped = {};
        for (const slot of result.items || []) {
          const key = toDateKeyFromIso(slot.start_at);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(slot);
        }

        state.slotsByDate = grouped;
        const invitedSlotDateKey = state.invitedStartAtIso ? toDateKeyFromIso(state.invitedStartAtIso) : '';
        if (invitedSlotDateKey && grouped[invitedSlotDateKey]?.length) {
          state.selectedDateKey = invitedSlotDateKey;
        } else {
          const today = new Date();
          if (today >= from && today < to) {
            state.selectedDateKey = toDateKeyFromDate(today);
          }
        }
        pickDefaultSelectedDate();
        renderCalendar();
        renderDaySlots();
        renderStudentStats();
        renderTeacherOpenSlotList();
      }

      async function loadTeacherProfile() {
        const result = await api('/api/v1/teachers/me/profile', { auth: true });
        state.teacherProfile = result.item || null;
        renderTeacherProfileForm();
      }

      function renderTeacherCalendar() {
        teacherWeekLabel.textContent = formatWeekLabel(state.teacherWeekCursor);
        const days = buildWeekDays(state.teacherWeekCursor);
        const now = new Date();
        const todayKey = toDateKeyFromDate(now);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const step = Math.max(10, Number.parseInt(teacherGridStep.value || state.teacherGridStepMin, 10) || 60);
        state.teacherGridStepMin = step;

        const activeAvailability = (state.teacherAvailability || []).filter((row) => row.is_active);
        const activeOneTimeAvailability = (state.teacherOneTimeAvailability || []).filter((row) => row.is_active);
        const availabilityById = new Map((state.teacherAvailability || []).map((row) => [Number(row.id), row]));
        const oneTimeByDate = new Map();
        for (const row of activeOneTimeAvailability) {
          const dateKey = String(row.date_local || '').trim();
          if (!dateKey) continue;
          if (!oneTimeByDate.has(dateKey)) {
            oneTimeByDate.set(dateKey, []);
          }
          oneTimeByDate.get(dateKey).push(row);
        }
        const exceptionsByDateKey = new Map();
        for (const ex of state.teacherExceptions || []) {
          const dateKey = String(ex.date_local || '').trim();
          if (!dateKey) continue;
          if (!exceptionsByDateKey.has(dateKey)) {
            exceptionsByDateKey.set(dateKey, []);
          }
          exceptionsByDateKey.get(dateKey).push(ex);
        }
        const bookingBlocksByDate = new Map();
        for (const row of state.teacherBookings || []) {
          const rowStatus = String(row.status || '');
          const startDate = new Date(row.start_at);
          if (Number.isNaN(startDate.getTime())) continue;
          const endDateCandidate = new Date(row.end_at);
          const durationMin = Number.parseInt(row.duration_min, 10) || step;
          const endDate = Number.isNaN(endDateCandidate.getTime())
            ? new Date(startDate.getTime() + durationMin * 60 * 1000)
            : endDateCandidate;
          const shouldBlock =
            rowStatus === 'PENDING' ||
            rowStatus === 'BOOKED' ||
            (rowStatus === 'COMPLETED' && endDate.getTime() > now.getTime());
          if (!shouldBlock) continue;

          const dateKey = toDateKeyFromDate(startDate);
          const startMinute = startDate.getHours() * 60 + startDate.getMinutes();
          const endMinute = endDate.getHours() * 60 + endDate.getMinutes();
          if (!bookingBlocksByDate.has(dateKey)) {
            bookingBlocksByDate.set(dateKey, []);
          }
          bookingBlocksByDate.get(dateKey).push({
            startMinute,
            endMinute: endMinute > startMinute ? endMinute : startMinute + step,
            status: rowStatus,
          });
        }
        for (const items of bookingBlocksByDate.values()) {
          items.sort((a, b) => a.startMinute - b.startMinute);
        }

        let rows = '';
        const dragPreview = getTeacherDragPreview();
        for (let minute = 0; minute < 24 * 60; minute += step) {
          const bucketEnd = minute + step;
          let cells = '';
          for (const day of days) {
            const dateKey = toDateKeyFromDate(day);
            const weekday = day.getDay();
            const holidayName = state.holidaysByDate[dateKey] || '';
            const weeklyWindows = activeAvailability
              .filter((row) => Number(row.weekday) === weekday)
              .map((row) => ({ ...row, source: 'weekly' }));
            const oneTimeWindows = (oneTimeByDate.get(dateKey) || []).map((row) => ({ ...row, source: 'one_time' }));
            const windows = [...oneTimeWindows, ...weeklyWindows];
            const dayExceptions = exceptionsByDateKey.get(dateKey) || [];
            const dayBookings = bookingBlocksByDate.get(dateKey) || [];
            let windowAtStart = null;
            let hasWindow = false;
            const isAllDayException = dayExceptions.some((ex) => !ex.start_time_local && !ex.end_time_local);
            let hasException = isAllDayException;
            let exceptionAtStart = null;

            for (const row of windows) {
              const startMin = minutesFromTimeLocal(row.start_time_local);
              const endMin = minutesFromTimeLocal(row.end_time_local);
              if (startMin === null || endMin === null) continue;
              if (minute < endMin && bucketEnd > startMin) hasWindow = true;
              if (!windowAtStart && startMin >= minute && startMin < bucketEnd) {
                windowAtStart = row;
              }
            }

            if (!isAllDayException) {
              for (const ex of dayExceptions) {
                const exStart = minutesFromTimeLocal(ex.start_time_local);
                const exEnd = minutesFromTimeLocal(ex.end_time_local);
                if (exStart === null || exEnd === null) continue;
                if (minute < exEnd && bucketEnd > exStart) {
                  hasException = true;
                  if (!exceptionAtStart && exStart >= minute && exStart < bucketEnd) {
                    exceptionAtStart = ex;
                  }
                }
              }
            } else if (minute === 0) {
              exceptionAtStart = dayExceptions.find((ex) => !ex.start_time_local && !ex.end_time_local) || null;
            }

            const bookingOverlaps = dayBookings.filter(
              (item) => item.startMinute < bucketEnd && item.endMinute > minute
            );
            const bookingStart =
              bookingOverlaps.find((item) => item.startMinute >= minute && item.startMinute < bucketEnd) || null;
            const bookingStatusAtStart = bookingStart?.status || null;
            const hasBlockedBooking = bookingOverlaps.length > 0;
            const isBookedStart = Boolean(bookingStatusAtStart);
            const classes = ['week-cell', 'week-teacher-cell'];
            if (hasBlockedBooking) classes.push('has-booking');
            if (hasWindow) classes.push('has-window');
            if (hasException) classes.push('has-exception');
            if (holidayName) classes.push('holiday');
            if (dateKey < todayKey || (dateKey === todayKey && minute < nowMinutes)) classes.push('past');
            if (
              dragPreview &&
              dragPreview.dateKey === dateKey &&
              minute >= dragPreview.startMinute &&
              minute <= dragPreview.endMinute
            ) {
              classes.push('drag-range');
            }
            if (
              state.teacherDrag &&
              dateKey ===
                (state.teacherDrag.mode === 'move' ? state.teacherDrag.currentDateKey : state.teacherDrag.dateKey) &&
              minute ===
                (state.teacherDrag.mode === 'move' ? state.teacherDrag.currentMinute : state.teacherDrag.startMinute)
            ) {
              classes.push('drag-anchor');
            }

            const createLabel = state.teacherCreateType === 'exception' ? '■' : '+';
            let content = `<button type="button" class="week-create-btn" data-create-teacher-slot="${dateKey}|${minute}" title="${state.teacherCreateType === 'exception' ? '불가 일정 생성' : '수업 오픈'}">${createLabel}</button>`;
            if (isBookedStart) {
              content =
                bookingStatusAtStart === 'PENDING'
                  ? '<span class="week-booked-chip">대기</span>'
                  : bookingStatusAtStart === 'COMPLETED'
                    ? '<span class="week-booked-chip">완료</span>'
                  : '<span class="week-booked-chip">예약</span>';
            } else if (hasBlockedBooking) {
              content = '';
            } else if (exceptionAtStart) {
              const exReason = escapeHtml((exceptionAtStart.reason || '').trim() || '불가');
              content = `<span class="week-exception-chip" title="${exReason}">불가</span>`;
            } else if (windowAtStart) {
              const title = escapeHtml((windowAtStart.lesson_title || '').trim() || '오픈');
              if (windowAtStart.source === 'one_time') {
                content = `<span class="week-one-time-window" title="단일 오픈">${title}</span>`;
              } else {
                content = `<button type="button" class="week-teacher-window" data-fill-availability-id="${windowAtStart.id}" data-drag-availability-id="${windowAtStart.id}" title="${title}">${title}</button>`;
              }
            } else if (hasWindow || hasException) {
              content = '';
            }

            cells += `<td class="${classes.join(' ')}" data-date-key="${dateKey}" data-minute="${minute}">${content}</td>`;
          }
          rows += `<tr><th scope="row" class="week-time">${timeLabelFromMinutes(minute)}</th>${cells}</tr>`;
        }

        const header = days
          .map((day, index) => {
            const dateKey = toDateKeyFromDate(day);
            const isToday = dateKey === todayKey;
            const holidayName = state.holidaysByDate[dateKey] || '';
            const classes = ['week-day-head'];
            if (holidayName) classes.push('holiday');
            return `<th scope="col" class="${classes.join(' ')}"><strong>${WEEKDAY_LABELS[index]}${isToday ? ' · 오늘' : ''}</strong>${day.getMonth() + 1}/${day.getDate()}${holidayName ? `<span class="holiday-caption">${escapeHtml(holidayName)}</span>` : ''}</th>`;
          })
          .join('');

        teacherCalendarGrid.innerHTML = `
          <table class="week-table">
            <thead>
              <tr>
                <th scope="col" class="week-time-head">시간</th>
                ${header}
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
        renderTeacherDragHint(dragPreview);

        teacherCalendarGrid.onclick = (event) => {
          if (Date.now() - state.teacherDragEndedAt < 220) return;
          if (Date.now() - Number(state.teacherTouch.lastOpenAt || 0) < 380) return;
          const createTarget = event.target.closest('[data-create-teacher-slot]');
          if (createTarget) {
            const value = String(createTarget.getAttribute('data-create-teacher-slot') || '');
            const [dateKey, minuteText] = value.split('|');
            const minute = Number.parseInt(minuteText || '', 10);
            if (dateKey && Number.isInteger(minute)) {
              const endMinuteExclusive = Math.min(24 * 60, minute + step);
              const preview = {
                mode: 'create',
                dateKey,
                weekday: parseDateKey(dateKey).getDay(),
                startMinute: minute,
                endMinute: endMinuteExclusive - step,
                endMinuteExclusive,
                durationMin: endMinuteExclusive - minute,
              };
              if (state.teacherCreateType === 'exception') {
                openTeacherExceptionModal(preview);
              } else {
                openTeacherCreateModal(preview);
              }
            }
            return;
          }
          const fillTarget = event.target.closest('[data-fill-availability-id]');
          if (!fillTarget) return;
          const id = Number.parseInt(fillTarget.getAttribute('data-fill-availability-id'), 10);
          const row = state.teacherAvailability.find((it) => Number(it.id) === id);
          if (!row) return;
          availabilityForm.elements.id.value = String(row.id);
          availabilityForm.elements.weekday.value = String(row.weekday);
          availabilityForm.elements.start_time_local.value = String(row.start_time_local).slice(0, 5);
          availabilityForm.elements.end_time_local.value = String(row.end_time_local).slice(0, 5);
          availabilityForm.elements.is_active.value = row.is_active ? 'true' : 'false';
          availabilityForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };

        const finalizeTeacherDrag = () => {
          const drag = state.teacherDrag;
          const preview = getTeacherDragPreview(drag);
          state.teacherDrag = null;
          state.teacherDragEndedAt = Date.now();
          renderTeacherCalendar();
          if (!drag || !preview) return;
          if (!drag.moved && preview.mode !== 'create') return;

          const startTime = timeLabelFromMinutes(preview.startMinute);
          const endTime = timeLabelFromMinutes(preview.endMinuteExclusive);

          if (preview.mode === 'create') {
            if (state.teacherCreateType === 'exception') {
              openTeacherExceptionModal(preview);
            } else {
              openTeacherCreateModal(preview);
            }
            return;
          }

          const noChange =
            preview.weekday === preview.originalWeekday &&
            preview.startMinute === preview.originalStartMinute &&
            preview.endMinuteExclusive === preview.originalEndMinuteExclusive;
          if (noChange) return;

          runAction('클래스 수정', async () => {
            const actionText = preview.mode === 'move' ? '이동' : '길이조절';
            const ok = window.confirm(`${actionText}: ${preview.dateKey} ${startTime}-${endTime}로 변경할까요?`);
            if (!ok) return;
            await api(`/api/v1/teachers/me/availability/${preview.availabilityId}`, {
              method: 'PATCH',
              auth: true,
              body: {
                weekday: preview.weekday,
                start_time_local: startTime,
                end_time_local: endTime,
                is_active: preview.isActive,
              },
            });
            await loadTeacherAvailability();
            await loadTeachers();
            await loadSlotsForCurrentMonth();
          });
        };

        const startTeacherDrag = ({ meta, target, clientX, clientY, shiftResize = false }) => {
          if (!meta) return false;
          const dragAvailabilityTarget = target?.closest?.('[data-drag-availability-id]');
          if (dragAvailabilityTarget) {
            const availabilityId = Number.parseInt(
              dragAvailabilityTarget.getAttribute('data-drag-availability-id') || '',
              10
            );
            const row = availabilityById.get(availabilityId);
            const rowStartMinute = minutesFromTimeLocal(row?.start_time_local);
            const rowEndMinuteExclusive = minutesFromTimeLocal(row?.end_time_local);
            if (!row || rowStartMinute === null || rowEndMinuteExclusive === null) return false;
            const mode = shiftResize ? 'resize' : 'move';
            state.teacherDrag = {
              mode,
              availabilityId,
              dateKey: meta.dateKey,
              startMinute: rowStartMinute,
              currentDateKey: meta.dateKey,
              currentMinute: mode === 'resize' ? rowEndMinuteExclusive - step : meta.minute,
              originalWeekday: Number(row.weekday),
              originalStartMinute: rowStartMinute,
              originalEndMinuteExclusive: rowEndMinuteExclusive,
              originalDuration: rowEndMinuteExclusive - rowStartMinute,
              isActive: Boolean(row.is_active),
              step,
              moved: false,
              pointerX: clientX,
              pointerY: clientY,
            };
          } else {
            state.teacherDrag = {
              mode: 'create',
              dateKey: meta.dateKey,
              startMinute: meta.minute,
              currentDateKey: meta.dateKey,
              currentMinute: meta.minute,
              step,
              moved: false,
              pointerX: clientX,
              pointerY: clientY,
            };
          }
          renderTeacherCalendar();
          return true;
        };

        const openTeacherCreateFromCell = ({ dateKey, minute }) => {
          if (!dateKey || !Number.isInteger(minute)) return;
          const startMinute = Math.max(0, Math.min(24 * 60 - step, minute));
          const endMinuteExclusive = Math.min(24 * 60, startMinute + step);
          const preview = {
            mode: 'create',
            dateKey,
            weekday: parseDateKey(dateKey).getDay(),
            startMinute,
            endMinute: endMinuteExclusive - step,
            endMinuteExclusive,
            durationMin: endMinuteExclusive - startMinute,
          };
          if (state.teacherCreateType === 'exception') {
            openTeacherExceptionModal(preview);
          } else {
            openTeacherCreateModal(preview);
          }
        };

        const updateTeacherDrag = ({ meta, clientX, clientY }) => {
          if (!state.teacherDrag || !meta) return;
          if (state.teacherDrag.mode !== 'move' && meta.dateKey !== state.teacherDrag.dateKey) return;
          const changed =
            meta.minute !== state.teacherDrag.currentMinute || meta.dateKey !== state.teacherDrag.currentDateKey;
          state.teacherDrag.currentMinute = meta.minute;
          state.teacherDrag.currentDateKey = meta.dateKey;
          state.teacherDrag.pointerX = clientX;
          state.teacherDrag.pointerY = clientY;
          if (changed) {
            state.teacherDrag.moved = true;
            renderTeacherCalendar();
            return;
          }
          renderTeacherDragHint(getTeacherDragPreview());
        };

        teacherCalendarGrid.onmousedown = (event) => {
          if (event.button !== 0) return;
          const meta = getCellMetaFromEventTarget(event.target);
          if (!meta) return;
          event.preventDefault();
          const started = startTeacherDrag({
            meta,
            target: event.target,
            clientX: event.clientX,
            clientY: event.clientY,
            shiftResize: event.shiftKey,
          });
          if (!started) return;
          window.addEventListener(
            'mouseup',
            () => {
              finalizeTeacherDrag();
            },
            { once: true }
          );
        };

        teacherCalendarGrid.onmousemove = (event) => {
          if (!state.teacherDrag) return;
          const meta = getCellMetaFromEventTarget(event.target);
          updateTeacherDrag({
            meta,
            clientX: event.clientX,
            clientY: event.clientY,
          });
        };

        teacherCalendarGrid.onmouseup = () => {
          finalizeTeacherDrag();
        };

        teacherCalendarGrid.ontouchstart = (event) => {
          const touch = event.touches?.[0];
          if (!touch) return;
          const meta = getCellMetaFromPoint(touch.clientX, touch.clientY);
          if (!meta) return;
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          state.teacherTouch.startMeta = meta;
          state.teacherTouch.startTarget = target;
          state.teacherTouch.startX = touch.clientX;
          state.teacherTouch.startY = touch.clientY;
          state.teacherTouch.started = false;
          if (state.teacherTouch.timerId) {
            window.clearTimeout(state.teacherTouch.timerId);
          }
          state.teacherTouch.timerId = window.setTimeout(() => {
            const started = startTeacherDrag({
              meta,
              target,
              clientX: touch.clientX,
              clientY: touch.clientY,
              shiftResize: false,
            });
            state.teacherTouch.started = Boolean(started);
          }, 120);
        };

        teacherCalendarGrid.ontouchmove = (event) => {
          const touch = event.touches?.[0];
          if (!touch) return;
          const dx = Math.abs(touch.clientX - Number(state.teacherTouch.startX || touch.clientX));
          const dy = Math.abs(touch.clientY - Number(state.teacherTouch.startY || touch.clientY));
          const movedEnough = dx >= 8 || dy >= 8;
          if (!state.teacherTouch.started && movedEnough && state.teacherTouch.startMeta) {
            if (state.teacherTouch.timerId) {
              window.clearTimeout(state.teacherTouch.timerId);
              state.teacherTouch.timerId = null;
            }
            const started = startTeacherDrag({
              meta: state.teacherTouch.startMeta,
              target: state.teacherTouch.startTarget,
              clientX: state.teacherTouch.startX,
              clientY: state.teacherTouch.startY,
              shiftResize: false,
            });
            state.teacherTouch.started = Boolean(started);
          }
          if (!state.teacherTouch.started || !state.teacherDrag) return;
          const meta = getCellMetaFromPoint(touch.clientX, touch.clientY);
          updateTeacherDrag({
            meta,
            clientX: touch.clientX,
            clientY: touch.clientY,
          });
          event.preventDefault();
        };

        teacherCalendarGrid.ontouchend = () => {
          if (state.teacherTouch.timerId) {
            window.clearTimeout(state.teacherTouch.timerId);
            state.teacherTouch.timerId = null;
          }
          if (state.teacherTouch.started && state.teacherDrag) {
            finalizeTeacherDrag();
          } else if (state.teacherTouch.startMeta) {
            state.teacherTouch.lastOpenAt = Date.now();
            openTeacherCreateFromCell({
              dateKey: state.teacherTouch.startMeta.dateKey,
              minute: state.teacherTouch.startMeta.minute,
            });
          }
          state.teacherTouch.started = false;
          state.teacherTouch.startMeta = null;
          state.teacherTouch.startTarget = null;
        };

        teacherCalendarGrid.ontouchcancel = () => {
          if (state.teacherTouch.timerId) {
            window.clearTimeout(state.teacherTouch.timerId);
            state.teacherTouch.timerId = null;
          }
          if (state.teacherTouch.started && state.teacherDrag) {
            finalizeTeacherDrag();
          }
          state.teacherTouch.started = false;
          state.teacherTouch.startMeta = null;
          state.teacherTouch.startTarget = null;
        };
      }

      function renderMyBookings(items) {
        myBookingsBody.innerHTML = '';
        if (!items.length) {
          myBookingsBody.innerHTML = '<tr><td colspan="7">예약 없음</td></tr>';
          return;
        }

        for (const row of items) {
          const canCancel = ['PENDING', 'BOOKED'].includes(row.status);
          const actionButtons = [canCancel ? `<button type="button" data-cancel-my-booking="${row.id}">취소</button>` : '']
            .filter(Boolean)
            .join(' ');
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.id}</td>
            <td>${row.teacher_email || row.teacher_name || row.teacher_user_id}</td>
            <td class="mono">${formatDateTime(row.start_at)}</td>
            <td class="mono">${formatDateTime(row.end_at)}</td>
            <td>${statusBadge(row.status)}</td>
            <td>${escapeHtml(row.student_comment || row.teacher_comment || '')}</td>
            <td>${actionButtons}</td>
          `;
          myBookingsBody.appendChild(tr);
        }
      }

      async function loadMyBookings() {
        if (state.user?.role === 'STUDENT') {
          const result = await api('/api/v1/bookings/me', { auth: true });
          state.studentBookings = result.items || [];
        } else {
          state.studentBookings = [];
        }
        renderMyBookings(state.studentBookings);
        renderStudentStats();
        if (PAGE_MODE === 'STUDENT') {
          renderCalendar();
        }
      }

      async function createBooking(startAtIso, durationMin) {
        const teacherId = parseRequiredId(teacherSelect.value, 'teacher_id');
        const duration = Number.parseInt(durationMin, 10);
        if (!Number.isInteger(duration) || duration <= 0) {
          throw new Error('예약 길이(duration)가 올바르지 않습니다.');
        }
        if (state.user?.role === 'STUDENT') {
          await api('/api/v1/bookings', {
            method: 'POST',
            auth: true,
            body: {
              teacher_user_id: teacherId,
              start_at: startAtIso,
              duration_min: duration,
            },
          });
          return;
        }
        throw new Error('학생 계정으로 로그인 후 예약해 주세요.');
      }

      async function createBookingOnBehalf(startAtIso, durationMin) {
        if (state.user?.role !== 'TEACHER') {
          throw new Error('선생님만 대리 예약을 등록할 수 있습니다.');
        }
        const duration = Number.parseInt(durationMin, 10) || state.teacherGridStepMin || 30;
        const startLabel = formatDateTime(startAtIso);
        const endLabel = formatDateTime(new Date(new Date(startAtIso).getTime() + duration * 60 * 1000).toISOString());

        const memberIdentityInput = window.prompt(
          `[대리 예약]\n${startLabel} ~ ${endLabel}\n학생 로그인 ID 또는 숫자 학생 ID를 입력하세요.`,
          ''
        );
        if (memberIdentityInput === null) return;
        const memberIdentity = String(memberIdentityInput || '').trim();
        if (!memberIdentity) {
          throw new Error('학생 로그인 ID 또는 학생 ID는 필수입니다.');
        }
        const memberNumericId = parseOptionalId(memberIdentity);
        const requestBody = {
          start_at: startAtIso,
        };
        if (memberNumericId) {
          requestBody.student_user_id = memberNumericId;
        } else {
          requestBody.student_email = memberIdentity.toLowerCase();
        }
        await api('/api/v1/teachers/me/bookings', {
          method: 'POST',
          auth: true,
          body: requestBody,
        });
      }

      function confirmBookingRequest(startAtIso, durationMin) {
        const start = new Date(startAtIso);
        if (Number.isNaN(start.getTime())) {
          return window.confirm('이 시간으로 예약하시겠습니까?');
        }
        const duration = Number.parseInt(durationMin, 10) || state.studentGridStepMin || 30;
        const end = new Date(start.getTime() + duration * 60 * 1000);
        const teacher = state.teachers.find((t) => String(t.id) === String(state.selectedTeacherId));
        const teacherName = teacher?.name || `#${state.selectedTeacherId || '-'}`;
        return window.confirm(
          `[예약 확인]\n선생님: ${teacherName}\n시간: ${formatDateTime(start.toISOString())} ~ ${formatDateTime(
            end.toISOString()
          )}\n예약할까요?`
        );
      }

      async function cancelBooking(bookingId) {
        if (state.user?.role === 'STUDENT' || state.user?.role === 'TEACHER') {
          await api(`/api/v1/bookings/${bookingId}/cancel`, {
            method: 'POST',
            auth: true,
          });
          return;
        }
        throw new Error('로그인 후 취소할 수 있습니다.');
      }

      async function approveBooking(bookingId) {
        await api(`/api/v1/teachers/me/bookings/${bookingId}/approve`, {
          method: 'POST',
          auth: true,
        });
      }

      async function completeBooking(bookingId, { teacherPrivateComment, studentComment } = {}) {
        const body = {};
        if (teacherPrivateComment !== undefined) {
          body.teacher_private_comment = teacherPrivateComment;
        }
        if (studentComment !== undefined) {
          body.student_comment = studentComment;
        }
        await api(`/api/v1/teachers/me/bookings/${bookingId}/complete`, {
          method: 'POST',
          auth: true,
          body,
        });
      }

      function openTeacherCreateModal(preview) {
        if (Date.now() < Number(state.modalReopenGuardUntil || 0)) {
          return;
        }
        state.teacherCreateDraft = preview;
        teacherCreateForm.reset();
        teacherCreateForm.elements.date_local.value = formatDateKeyLabel(preview.dateKey);
        teacherCreateForm.elements.start_time_local.value = timeLabelFromMinutes(preview.startMinute);
        teacherCreateForm.elements.end_time_local.value = timeLabelFromMinutes(preview.endMinuteExclusive);
        teacherCreateForm.elements.repeat_mode.value = 'single';
        teacherCreateForm.elements.is_active.value = 'true';
        setTeacherCreateSubmitting(false);
        teacherCreateModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }

      function closeTeacherCreateModal() {
        teacherCreateModal.classList.add('hidden');
        setTeacherCreateSubmitting(false);
        state.modalReopenGuardUntil = Date.now() + 420;
        state.teacherCreateDraft = null;
        clearTeacherTouchState();
        if (teacherExceptionModal.classList.contains('hidden')) {
          document.body.style.overflow = '';
        }
      }

      function openTeacherExceptionModal(preview) {
        if (Date.now() < Number(state.modalReopenGuardUntil || 0)) {
          return;
        }
        state.teacherExceptionDraft = preview;
        teacherExceptionQuickForm.reset();
        teacherExceptionQuickForm.elements.date_local.value = preview.dateKey;
        teacherExceptionQuickForm.elements.start_time_local.value = timeLabelFromMinutes(preview.startMinute);
        teacherExceptionQuickForm.elements.end_time_local.value = timeLabelFromMinutes(preview.endMinuteExclusive);
        teacherExceptionQuickForm.elements.reason.value = '수업 불가';
        setTeacherExceptionSubmitting(false);
        teacherExceptionModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }

      function closeTeacherExceptionModal() {
        teacherExceptionModal.classList.add('hidden');
        setTeacherExceptionSubmitting(false);
        state.modalReopenGuardUntil = Date.now() + 420;
        state.teacherExceptionDraft = null;
        clearTeacherTouchState();
        if (teacherCreateModal.classList.contains('hidden')) {
          document.body.style.overflow = '';
        }
      }

      async function createTeacherExceptionFromModal() {
        const dateLocal = String(teacherExceptionQuickForm.elements.date_local.value || '').trim();
        const reason = String(teacherExceptionQuickForm.elements.reason.value || '').trim();
        const startTime = String(teacherExceptionQuickForm.elements.start_time_local.value || '').trim();
        const endTime = String(teacherExceptionQuickForm.elements.end_time_local.value || '').trim();
        if (!dateLocal) {
          throw new Error('날짜를 선택해 주세요.');
        }
        ensureTimeRangeAligned(startTime, endTime, '불가 시간');

        const body = {
          date_local: dateLocal,
          reason: reason || '수업 불가',
          start_time_local: startTime,
          end_time_local: endTime,
        };

        await api('/api/v1/teachers/me/exceptions', {
          method: 'POST',
          auth: true,
          body,
        });

        pushLog('불가 일정 생성', {
          date_local: dateLocal,
          start_time_local: body.start_time_local,
          end_time_local: body.end_time_local,
          reason: body.reason,
        });

        closeTeacherExceptionModal();
        await loadTeacherExceptions();
        await loadSlotsForCurrentMonth();
      }

      async function createTeacherAvailabilityFromDraft() {
        const preview = state.teacherCreateDraft;
        if (!preview) {
          throw new Error('생성할 드래그 범위 정보가 없습니다.');
        }

        const repeatMode = String(teacherCreateForm.elements.repeat_mode.value || 'single');
        const startTime = String(teacherCreateForm.elements.start_time_local.value || '').slice(0, 5);
        const endTime = String(teacherCreateForm.elements.end_time_local.value || '').slice(0, 5);
        const isActive = String(teacherCreateForm.elements.is_active.value || 'true') === 'true';
        const classTitle = String(teacherCreateForm.elements.class_title.value || '').trim();
        const classNote = String(teacherCreateForm.elements.class_note.value || '').trim();

        ensureTimeRangeAligned(startTime, endTime, '수업 시간');

        if (repeatMode === 'single') {
          await api('/api/v1/teachers/me/one-time-availability', {
            method: 'POST',
            auth: true,
            body: {
              date_local: preview.dateKey,
              start_time_local: startTime,
              end_time_local: endTime,
              is_active: isActive,
              lesson_title: classTitle,
              lesson_note: classNote,
            },
          });
        } else {
          await api('/api/v1/teachers/me/availability', {
            method: 'POST',
            auth: true,
            body: {
              weekday: preview.weekday,
              start_time_local: startTime,
              end_time_local: endTime,
              is_active: isActive,
              lesson_title: classTitle,
              lesson_note: classNote,
            },
          });
        }

        pushLog('클래스 생성 모드', {
          date: preview.dateKey,
          start_time_local: startTime,
          end_time_local: endTime,
          repeat_mode: repeatMode,
          class_title: classTitle || null,
          class_note: classNote || null,
          is_active: isActive,
        });

        closeTeacherCreateModal();
        await loadTeacherAvailability();
        await loadTeacherOneTimeAvailability();
        await loadTeachers();
        await loadSlotsForCurrentMonth();
      }

      async function loadStudentDashboard() {
        const invitedDate = state.invitedStartAtIso ? new Date(state.invitedStartAtIso) : null;
        if (invitedDate && !Number.isNaN(invitedDate.getTime())) {
          state.monthCursor = new Date(invitedDate);
          state.selectedDateKey = toDateKeyFromDate(invitedDate);
        } else {
          state.monthCursor = new Date();
        }
        await loadTeachers();
        await loadSlotsForCurrentMonth();
        await loadMyBookings();
      }

      function renderAvailability(items) {
        availabilityBody.innerHTML = '';
        if (!items.length) {
          availabilityBody.innerHTML = '<tr><td colspan="7">데이터 없음</td></tr>';
          return;
        }

        for (const row of items) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.id}</td>
            <td>${weekdayLabel(row.weekday)}</td>
            <td class="mono">${row.start_time_local}</td>
            <td class="mono">${row.end_time_local}</td>
            <td>${row.lesson_title || '-'}</td>
            <td>${row.is_active ? '<span class="status-badge status-TRUE">활성</span>' : '<span class="status-badge status-FALSE">비활성</span>'}</td>
            <td><button type="button" data-fill-availability="${row.id}" data-fill-availability-weekday="${row.weekday}" data-fill-availability-active="${row.is_active ? 'true' : 'false'}" data-fill-availability-title="${row.lesson_title || ''}" data-fill-availability-note="${row.lesson_note || ''}">불러오기</button></td>
          `;
          availabilityBody.appendChild(tr);
        }
      }

      function renderExceptions(items) {
        exceptionBody.innerHTML = '';
        if (!items.length) {
          exceptionBody.innerHTML = '<tr><td colspan="6">데이터 없음</td></tr>';
          return;
        }

        for (const row of items) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.id}</td>
            <td class="mono">${row.date_local}</td>
            <td class="mono">${row.start_time_local || ''}</td>
            <td class="mono">${row.end_time_local || ''}</td>
            <td>${row.reason || ''}</td>
            <td><button type="button" data-fill-exception="${row.id}">불러오기</button></td>
          `;
          exceptionBody.appendChild(tr);
        }
      }

      function renderTeacherBookings(items) {
        teacherBookingsBody.innerHTML = '';
        if (!items.length) {
          teacherBookingsBody.innerHTML = '<tr><td colspan="8">데이터 없음</td></tr>';
          return;
        }

        for (const row of items) {
          const canApprove = row.status === 'PENDING';
          const canCancel = ['PENDING', 'BOOKED'].includes(row.status);
          const canComplete = ['PENDING', 'BOOKED'].includes(row.status);
          const actions = [
            canApprove ? `<button type="button" data-approve-teacher-booking="${row.id}">승인</button>` : '',
            canCancel ? `<button type="button" data-cancel-teacher-booking="${row.id}">거절/취소</button>` : '',
            canComplete ? `<button type="button" data-complete-teacher-booking="${row.id}">완료처리</button>` : '',
          ]
            .filter(Boolean)
            .join(' ');
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.id}</td>
            <td>${row.student_email || row.student_name || row.student_user_id}</td>
            <td class="mono">${formatDateTime(row.start_at)}</td>
            <td class="mono">${formatDateTime(row.end_at)}</td>
            <td>${statusBadge(row.status)}</td>
            <td>${escapeHtml(row.student_comment || row.teacher_comment || '')}</td>
            <td>${escapeHtml(row.teacher_private_comment || '')}</td>
            <td>${actions}</td>
          `;
          teacherBookingsBody.appendChild(tr);
        }
      }

      function renderTeacherCompletedList(items) {
        if (!teacherCompletedList) return;
        const lessonTitles = Array.from(
          new Set((items || []).map((row) => String(row.lesson_title || '').trim() || '미분류'))
        ).sort((a, b) => a.localeCompare(b, 'ko'));
        if (teacherCompletedLessonFilter) {
          const previous = String(teacherCompletedLessonFilter.value || 'all');
          teacherCompletedLessonFilter.innerHTML = '';
          const allOption = document.createElement('option');
          allOption.value = 'all';
          allOption.textContent = '전체 레슨';
          teacherCompletedLessonFilter.appendChild(allOption);
          for (const title of lessonTitles) {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            teacherCompletedLessonFilter.appendChild(option);
          }
          if (lessonTitles.includes(previous)) {
            teacherCompletedLessonFilter.value = previous;
          } else {
            teacherCompletedLessonFilter.value = 'all';
          }
        }

        const selectedLesson = String(teacherCompletedLessonFilter?.value || 'all');
        const filtered = (items || []).filter((row) => {
          if (selectedLesson === 'all') return true;
          const lessonTitle = String(row.lesson_title || '').trim() || '미분류';
          return lessonTitle === selectedLesson;
        });

        teacherCompletedList.innerHTML = '';
        if (!filtered.length) {
          teacherCompletedList.innerHTML = '<div class="hint">완료 수업 이력이 없습니다.</div>';
          return;
        }

        const groups = new Map();
        for (const row of filtered) {
          const key = String(row.lesson_title || '').trim() || '미분류';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }

        for (const [lessonTitle, rows] of groups.entries()) {
          const section = document.createElement('section');
          section.className = 'subpanel';
          section.innerHTML = `<h4>${escapeHtml(lessonTitle)} <small class="hint">(${rows.length}건)</small></h4>`;

          for (const row of rows) {
            const card = document.createElement('article');
            card.className = 'history-card';
            const studentName = row.student_email || row.student_name || row.student_user_id || '-';
            const studentCommentRaw = String(row.student_comment || row.teacher_comment || '');
            const teacherMemoRaw = String(row.teacher_private_comment || '');
            const studentComment = escapeHtml(studentCommentRaw);
            const teacherMemo = escapeHtml(teacherMemoRaw);
            card.innerHTML = `
              <div class="history-card-head">
                <div class="history-title">#${row.id} · ${escapeHtml(String(studentName))}</div>
                <div>${statusBadge(row.status)}</div>
              </div>
              <div class="history-meta">
                <div><strong>수업시간</strong><br /><span class="mono">${formatDateTime(row.start_at)} ~ ${formatDateTime(row.end_at)}</span></div>
                <div><strong>학생 전달 코멘트</strong><br />${studentComment || '-'}</div>
                <div><strong>선생님 메모</strong><br />${teacherMemo || '-'}</div>
              </div>
              <div class="history-actions">
                <button type="button" data-edit-completed-student="${row.id}" data-current-value="${encodeURIComponent(studentCommentRaw)}">학생 코멘트 수정</button>
                <button type="button" data-edit-completed-private="${row.id}" data-current-value="${encodeURIComponent(teacherMemoRaw)}">선생님 메모 수정</button>
              </div>
            `;
            section.appendChild(card);
          }
          teacherCompletedList.appendChild(section);
        }
      }

      async function loadTeacherAvailability() {
        const result = await api('/api/v1/teachers/me/availability', { auth: true });
        state.teacherAvailability = result.items || [];
        renderAvailability(state.teacherAvailability);
        renderTeacherStats();
        renderTeacherCalendar();
      }

      async function loadTeacherOneTimeAvailability() {
        const result = await api('/api/v1/teachers/me/one-time-availability', { auth: true });
        state.teacherOneTimeAvailability = result.items || [];
        renderTeacherStats();
        renderTeacherCalendar();
      }

      async function loadTeacherExceptions() {
        const result = await api('/api/v1/teachers/me/exceptions', { auth: true });
        state.teacherExceptions = result.items || [];
        renderExceptions(state.teacherExceptions);
        renderTeacherStats();
        renderTeacherCalendar();
      }

      async function loadTeacherBookings() {
        const result = await api('/api/v1/teachers/me/bookings', { auth: true });
        state.teacherBookings = result.items || [];
        state.teacherActiveBookings = state.teacherBookings.filter((row) => ['PENDING', 'BOOKED'].includes(row.status));
        state.teacherCompletedBookings = state.teacherBookings.filter((row) => row.status === 'COMPLETED');
        renderTeacherBookings(state.teacherActiveBookings);
        renderTeacherCompletedList(state.teacherCompletedBookings);
        renderTeacherStats();
        renderTeacherCalendar();
      }

      async function loadTeacherDashboard() {
        state.teacherWeekCursor = new Date();
        state.monthCursor = new Date(state.teacherWeekCursor);
        const { from, to } = weekRange(state.teacherWeekCursor);
        await ensureHolidayCacheForRange(from, to);
        await loadTeacherProfile();
        await loadTeacherAvailability();
        await loadTeacherOneTimeAvailability();
        await loadTeacherExceptions();
        await loadTeacherBookings();
        await loadSlotsForCurrentMonth();
        renderTeacherCalendar();
      }

      document.getElementById('logoutBtn').addEventListener('click', () => {
        runAction('로그아웃', async () => {
          if (state.token) {
            await api('/api/v1/auth/logout', { method: 'POST', auth: true });
          }
          setAuth('', null);
          state.teachers = [];
          state.selectedTeacherId = '';
          state.slotsByDate = {};
          state.studentBookings = [];
          state.teacherAvailability = [];
          state.teacherOneTimeAvailability = [];
          state.teacherExceptions = [];
          state.teacherBookings = [];
          state.teacherProfile = null;
          state.holidaysByDate = {};
          state.loadedHolidayYears = {};
          state.invitedTeacherId = null;
          state.studentCalendarView = 'week';
          applyStudentCalendarViewUi();
          myBookingsBody.innerHTML = '';
          availabilityBody.innerHTML = '';
          exceptionBody.innerHTML = '';
          teacherBookingsBody.innerHTML = '';
          calendarGrid.innerHTML = '';
          teacherCalendarGrid.innerHTML = '';
          daySlotsList.innerHTML = '';
          teacherDragHint.classList.add('hidden');
          closeTeacherCreateModal();
          closeTeacherExceptionModal();
          renderStudentMeta();
          renderStudentStats();
          renderTeacherStats();
          if (PAGE_MODE === 'STUDENT') {
            window.location.href = '/student.html';
          } else {
            window.location.href = '/index.html';
          }
        });
      });

      document.getElementById('topLogoutBtn').addEventListener('click', () => {
        document.getElementById('logoutBtn').click();
      });

      teacherCreateType.addEventListener('change', () => {
        state.teacherCreateType = teacherCreateType.value === 'exception' ? 'exception' : 'availability';
        renderTeacherCalendar();
      });

      document.getElementById('teacherCreateCancelBtn').addEventListener('click', () => {
        closeTeacherCreateModal();
      });

      function promptRequiredText(message, initialValue = '') {
        let seed = initialValue;
        while (true) {
          const input = window.prompt(message, seed);
          if (input === null) return null;
          const value = String(input || '').trim();
          if (value) return value;
          showToast('필수 입력 항목입니다.', 'error');
          seed = '';
        }
      }

      teacherCreateModal.addEventListener('click', (event) => {
        if (event.target === teacherCreateModal) {
          closeTeacherCreateModal();
        }
      });

      teacherCreateForm.addEventListener('submit', (event) => {
        event.preventDefault();
        runAction('수업 일정 저장', async () => {
          if (state.teacherCreateSubmitting) return;
          setTeacherCreateSubmitting(true);
          try {
            await createTeacherAvailabilityFromDraft();
          } finally {
            setTeacherCreateSubmitting(false);
          }
        });
      });

      document.getElementById('teacherExceptionCancelBtn').addEventListener('click', () => {
        closeTeacherExceptionModal();
      });

      teacherExceptionModal.addEventListener('click', (event) => {
        if (event.target === teacherExceptionModal) {
          closeTeacherExceptionModal();
        }
      });

      teacherExceptionQuickForm.addEventListener('submit', (event) => {
        event.preventDefault();
        runAction('불가 일정 저장', async () => {
          if (state.teacherExceptionSubmitting) return;
          setTeacherExceptionSubmitting(true);
          try {
            await createTeacherExceptionFromModal();
          } finally {
            setTeacherExceptionSubmitting(false);
          }
        });
      });

      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        runAction('로그인', async () => {
          const form = formObject(loginForm);
          const result = await api('/api/v1/auth/login', {
            method: 'POST',
            body: { login_id: form.login_id, password: form.password },
          });
          setAuth(result.token, result.user);
          if (PAGE_MODE === 'TEACHER' && state.user?.role !== 'TEACHER') {
            window.location.href = '/student.html';
            return;
          }
          if (PAGE_MODE === 'STUDENT' && state.user?.role === 'TEACHER') {
            window.location.href = '/teacher.html';
            return;
          }
          if (state.user?.role === 'TEACHER') {
            await loadTeacherDashboard();
          } else {
            await loadStudentDashboard();
          }
        });
      });

      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        runAction('회원가입', async () => {
          const form = formObject(registerForm);
          const result = await api('/api/v1/auth/register', {
            method: 'POST',
            body: {
              login_id: form.login_id,
              phone: form.phone,
              password: form.password,
              name: form.name,
              role: form.role,
            },
          });
          setAuth(result.token, result.user);
          if (PAGE_MODE === 'TEACHER' && state.user?.role !== 'TEACHER') {
            window.location.href = '/student.html';
            return;
          }
          if (PAGE_MODE === 'STUDENT' && state.user?.role === 'TEACHER') {
            window.location.href = '/teacher.html';
            return;
          }
          if (state.user?.role === 'TEACHER') {
            await loadTeacherDashboard();
          } else {
            await loadStudentDashboard();
          }
        });
      });

      teacherSelect.addEventListener('change', () => {
        state.selectedTeacherId = teacherSelect.value;
        renderStudentMeta();
        runAction('선생님 전환', loadSlotsForCurrentMonth);
      });

      document.getElementById('teachersRefreshBtn').addEventListener('click', () => {
        runAction('선생님 조회', async () => {
          await loadTeachers();
          await loadSlotsForCurrentMonth();
        });
      });

      prevMonthBtn.addEventListener('click', () => {
        if (state.studentCalendarView === 'month') {
          const next = new Date(state.monthCursor);
          next.setMonth(next.getMonth() - 1, 1);
          state.monthCursor = next;
          runAction('이전 달 슬롯 조회', loadSlotsForCurrentMonth);
          return;
        }
        const next = new Date(state.monthCursor);
        next.setDate(next.getDate() - 7);
        state.monthCursor = next;
        runAction('이전 주 슬롯 조회', loadSlotsForCurrentMonth);
      });

      nextMonthBtn.addEventListener('click', () => {
        if (state.studentCalendarView === 'month') {
          const next = new Date(state.monthCursor);
          next.setMonth(next.getMonth() + 1, 1);
          state.monthCursor = next;
          runAction('다음 달 슬롯 조회', loadSlotsForCurrentMonth);
          return;
        }
        const next = new Date(state.monthCursor);
        next.setDate(next.getDate() + 7);
        state.monthCursor = next;
        runAction('다음 주 슬롯 조회', loadSlotsForCurrentMonth);
      });

      document.getElementById('todayBtn').addEventListener('click', () => {
        const today = new Date();
        state.monthCursor = new Date(today);
        state.selectedDateKey = toDateKeyFromDate(today);
        runAction('오늘 기준 캘린더 조회', loadSlotsForCurrentMonth);
      });

      document.getElementById('monthRefreshBtn').addEventListener('click', () => {
        runAction('캘린더 새로고침', loadSlotsForCurrentMonth);
      });

      studentWeekViewBtn?.addEventListener('click', () => {
        state.studentCalendarView = 'week';
        applyStudentCalendarViewUi();
        runAction('주 캘린더 전환', loadSlotsForCurrentMonth);
      });

      studentMonthViewBtn?.addEventListener('click', () => {
        state.studentCalendarView = 'month';
        applyStudentCalendarViewUi();
        runAction('월 캘린더 전환', loadSlotsForCurrentMonth);
      });

      studentGridStep.addEventListener('change', () => {
        state.studentGridStepMin = Number.parseInt(studentGridStep.value, 10) || 60;
        runAction('학생 캘린더 격자 변경', loadSlotsForCurrentMonth);
      });

      availableOnlyToggle.addEventListener('change', () => {
        state.availableOnly = availableOnlyToggle.checked;
        renderCalendar();
        renderDaySlots();
      });

      document.getElementById('teacherPrevWeekBtn').addEventListener('click', () => {
        const next = new Date(state.teacherWeekCursor);
        next.setDate(next.getDate() - 7);
        runAction('선생님 이전 주 이동', async () => {
          state.teacherWeekCursor = next;
          state.monthCursor = new Date(next);
          const { from, to } = weekRange(state.teacherWeekCursor);
          await ensureHolidayCacheForRange(from, to);
          await loadSlotsForCurrentMonth();
          renderTeacherCalendar();
        });
      });

      document.getElementById('teacherNextWeekBtn').addEventListener('click', () => {
        const next = new Date(state.teacherWeekCursor);
        next.setDate(next.getDate() + 7);
        runAction('선생님 다음 주 이동', async () => {
          state.teacherWeekCursor = next;
          state.monthCursor = new Date(next);
          const { from, to } = weekRange(state.teacherWeekCursor);
          await ensureHolidayCacheForRange(from, to);
          await loadSlotsForCurrentMonth();
          renderTeacherCalendar();
        });
      });

      document.getElementById('teacherTodayBtn').addEventListener('click', () => {
        runAction('선생님 이번 주 이동', async () => {
          state.teacherWeekCursor = new Date();
          state.monthCursor = new Date(state.teacherWeekCursor);
          const { from, to } = weekRange(state.teacherWeekCursor);
          await ensureHolidayCacheForRange(from, to);
          await loadSlotsForCurrentMonth();
          renderTeacherCalendar();
        });
      });

      teacherGridStep.addEventListener('change', () => {
        state.teacherGridStepMin = Number.parseInt(teacherGridStep.value, 10) || 60;
        runAction('선생님 캘린더 격자 변경', async () => {
          await loadSlotsForCurrentMonth();
          renderTeacherCalendar();
        });
      });

      document.getElementById('teacherWeekRefreshBtn').addEventListener('click', () => {
        runAction('선생님 캘린더 새로고침', async () => {
          state.monthCursor = new Date(state.teacherWeekCursor);
          const { from, to } = weekRange(state.teacherWeekCursor);
          await ensureHolidayCacheForRange(from, to);
          await loadTeacherProfile();
          await loadTeacherAvailability();
          await loadTeacherOneTimeAvailability();
          await loadTeacherExceptions();
          await loadTeacherBookings();
          await loadSlotsForCurrentMonth();
        });
      });

      teacherInviteBtn.addEventListener('click', () => {
        runAction('학생 초대 링크 복사', async () => {
          if (!state.user?.id) {
            throw new Error('로그인 사용자 정보를 확인할 수 없습니다.');
          }
          const inviteUrl = buildCalendarInviteUrl(state.user.id);
          await navigator.clipboard.writeText(inviteUrl);
          pushLog('학생 캘린더 링크 생성', { invite_url: inviteUrl });
          showToast('학생 캘린더 링크를 복사했습니다.', 'success');
        });
      });

      document.getElementById('teacherOpenSlotRefreshBtn')?.addEventListener('click', () => {
        runAction('오픈 슬롯 새로고침', async () => {
          state.monthCursor = new Date(state.teacherWeekCursor);
          await loadSlotsForCurrentMonth();
        });
      });

      teacherOpenSlotList?.addEventListener('click', (e) => {
        const lessonStartAt = e.target?.dataset?.copyLessonLinkStartAt;
        if (lessonStartAt) {
          runAction('레슨 링크 복사', async () => {
            if (!state.user?.id) {
              throw new Error('로그인 사용자 정보를 확인할 수 없습니다.');
            }
            const lessonUrl = buildLessonInviteUrl(state.user.id, lessonStartAt);
            await navigator.clipboard.writeText(lessonUrl);
            pushLog('레슨 링크 생성', { lesson_url: lessonUrl, start_at: lessonStartAt });
            showToast('레슨 링크를 복사했습니다.', 'success');
          });
          return;
        }

        const proxyStartAt = e.target?.dataset?.bookSlotOnBehalf;
        if (!proxyStartAt) return;
        const proxyDuration = Number.parseInt(e.target?.dataset?.bookSlotDuration || '', 10) || 30;
        runAction('대리 예약 등록', async () => {
          await createBookingOnBehalf(proxyStartAt, proxyDuration);
          await loadTeacherBookings();
          await loadSlotsForCurrentMonth();
        });
      });

      lessonCatalogList?.addEventListener('click', (e) => {
        const startAt = e.target?.dataset?.copyLessonCatalogStartAt;
        if (!startAt) return;
        runAction('레슨 항목 링크 복사', async () => {
          if (!state.user?.id) {
            throw new Error('로그인 사용자 정보를 확인할 수 없습니다.');
          }
          const lessonUrl = buildLessonInviteUrl(state.user.id, startAt);
          await navigator.clipboard.writeText(lessonUrl);
          showToast('레슨 링크를 복사했습니다.', 'success');
        });
      });

      document.getElementById('teacherProfileSaveBtn')?.addEventListener('click', () => {
        runAction('선생님 설정 저장', async () => {
          const form = formObject(teacherProfileForm);
          const cancelHour = Number.parseInt(String(form.student_cancel_day_before_hour || ''), 10);
          if (!Number.isInteger(cancelHour) || cancelHour < 0 || cancelHour > 23) {
            throw new Error('학생 취소 마감 시각은 0~23 사이여야 합니다.');
          }
          await api('/api/v1/teachers/me/profile', {
            method: 'PATCH',
            auth: true,
            body: {
              display_name: String(form.display_name || ''),
              bio: String(form.bio || ''),
              student_cancel_day_before_hour: cancelHour,
              student_notice: String(form.student_notice || ''),
              timezone: String(form.timezone || '').trim() || undefined,
            },
          });
          await loadTeacherProfile();
          await loadTeachers();
          await loadSlotsForCurrentMonth();
          renderStudentMeta();
        });
      });

      document.getElementById('teacherProfileRefreshBtn')?.addEventListener('click', () => {
        runAction('선생님 설정 다시불러오기', loadTeacherProfile);
      });

      document.getElementById('studentProfileSaveBtn')?.addEventListener('click', () => {
        runAction('학생 프로필 저장', async () => {
          await saveMyProfile(studentProfileForm);
          showToast('프로필이 저장되었습니다.', 'success');
        });
      });

      document.getElementById('studentProfileRefreshBtn')?.addEventListener('click', () => {
        runAction('학생 프로필 다시불러오기', syncMe);
      });

      document.getElementById('studentPasswordSaveBtn')?.addEventListener('click', () => {
        runAction('학생 비밀번호 변경', async () => {
          await changeMyPassword(studentPasswordForm);
          showToast('비밀번호가 변경되었습니다.', 'success');
        });
      });

      document.getElementById('teacherAccountSaveBtn')?.addEventListener('click', () => {
        runAction('선생님 계정 저장', async () => {
          await saveMyProfile(teacherAccountForm);
          showToast('계정 정보가 저장되었습니다.', 'success');
        });
      });

      document.getElementById('teacherAccountRefreshBtn')?.addEventListener('click', () => {
        runAction('선생님 계정 다시불러오기', syncMe);
      });

      document.getElementById('teacherPasswordSaveBtn')?.addEventListener('click', () => {
        runAction('선생님 비밀번호 변경', async () => {
          await changeMyPassword(teacherPasswordForm);
          showToast('비밀번호가 변경되었습니다.', 'success');
        });
      });

      document.getElementById('myBookingsRefreshBtn').addEventListener('click', () => {
        runAction('내 예약 조회', loadMyBookings);
      });

      myBookingsBody.addEventListener('click', (e) => {
        const bookingId = e.target?.dataset?.cancelMyBooking;
        if (!bookingId) return;
        runAction('내 예약 취소', async () => {
          await cancelBooking(bookingId);
          await loadMyBookings();
          await loadSlotsForCurrentMonth();
        });
      });

      document.getElementById('availabilityCreateBtn').addEventListener('click', () => {
        runAction('시간표 등록', async () => {
          const form = formObject(availabilityForm);
          ensureTimeRangeAligned(form.start_time_local, form.end_time_local, '시간표');
          await api('/api/v1/teachers/me/availability', {
            method: 'POST',
            auth: true,
            body: {
              weekday: Number(form.weekday),
              start_time_local: form.start_time_local,
              end_time_local: form.end_time_local,
              is_active: form.is_active === 'true',
              lesson_title: form.lesson_title,
              lesson_note: form.lesson_note,
            },
          });
          await loadTeacherAvailability();
        });
      });

      document.getElementById('availabilityUpdateBtn').addEventListener('click', () => {
        runAction('시간표 수정', async () => {
          const id = parseRequiredId(availabilityForm.elements.id.value, 'availability id');
          const form = formObject(availabilityForm);
          ensureTimeRangeAligned(form.start_time_local, form.end_time_local, '시간표');
          await api(`/api/v1/teachers/me/availability/${id}`, {
            method: 'PATCH',
            auth: true,
            body: {
              weekday: Number(form.weekday),
              start_time_local: form.start_time_local,
              end_time_local: form.end_time_local,
              is_active: form.is_active === 'true',
              lesson_title: form.lesson_title,
              lesson_note: form.lesson_note,
            },
          });
          await loadTeacherAvailability();
        });
      });

      document.getElementById('availabilityDeleteBtn').addEventListener('click', () => {
        runAction('시간표 삭제', async () => {
          const id = parseRequiredId(availabilityForm.elements.id.value, 'availability id');
          await api(`/api/v1/teachers/me/availability/${id}`, {
            method: 'DELETE',
            auth: true,
          });
          await loadTeacherAvailability();
        });
      });

      document.getElementById('availabilityRefreshBtn').addEventListener('click', () => {
        runAction('시간표 조회', loadTeacherAvailability);
      });

      availabilityBody.addEventListener('click', (e) => {
        const id = e.target?.dataset?.fillAvailability;
        if (!id) return;
        const tr = e.target.closest('tr');
        availabilityForm.elements.id.value = id;
        availabilityForm.elements.weekday.value = String(e.target?.dataset?.fillAvailabilityWeekday || tr.children[1].textContent.trim());
        availabilityForm.elements.start_time_local.value = tr.children[2].textContent.trim().slice(0, 5);
        availabilityForm.elements.end_time_local.value = tr.children[3].textContent.trim().slice(0, 5);
        availabilityForm.elements.is_active.value = e.target.dataset.fillAvailabilityActive === 'false' ? 'false' : 'true';
        availabilityForm.elements.lesson_title.value = e.target.dataset.fillAvailabilityTitle || '';
        availabilityForm.elements.lesson_note.value = e.target.dataset.fillAvailabilityNote || '';
      });

      document.getElementById('exceptionCreateBtn').addEventListener('click', () => {
        runAction('예외 등록', async () => {
          const form = formObject(exceptionForm);
          const hasStart = Boolean(form.start_time_local.trim());
          const hasEnd = Boolean(form.end_time_local.trim());
          if (!hasStart || !hasEnd) {
            throw new Error('예외는 시작/종료 시간을 모두 입력해야 합니다.');
          }
          ensureTimeRangeAligned(form.start_time_local.trim(), form.end_time_local.trim(), '예외 시간');

          const body = {
            date_local: form.date_local,
            reason: form.reason,
            start_time_local: form.start_time_local,
            end_time_local: form.end_time_local,
          };

          await api('/api/v1/teachers/me/exceptions', {
            method: 'POST',
            auth: true,
            body,
          });
          await loadTeacherExceptions();
        });
      });

      document.getElementById('exceptionDeleteBtn').addEventListener('click', () => {
        runAction('예외 삭제', async () => {
          const id = parseRequiredId(exceptionForm.elements.id.value, 'exception id');
          await api(`/api/v1/teachers/me/exceptions/${id}`, {
            method: 'DELETE',
            auth: true,
          });
          await loadTeacherExceptions();
        });
      });

      document.getElementById('exceptionRefreshBtn').addEventListener('click', () => {
        runAction('예외 조회', loadTeacherExceptions);
      });

      exceptionBody.addEventListener('click', (e) => {
        const id = e.target?.dataset?.fillException;
        if (!id) return;
        const tr = e.target.closest('tr');
        exceptionForm.elements.id.value = id;
        exceptionForm.elements.date_local.value = tr.children[1].textContent.trim();
        exceptionForm.elements.start_time_local.value = tr.children[2].textContent.trim().slice(0, 5);
        exceptionForm.elements.end_time_local.value = tr.children[3].textContent.trim().slice(0, 5);
        exceptionForm.elements.reason.value = tr.children[4].textContent.trim();
      });

      document.getElementById('teacherBookingsRefreshBtn').addEventListener('click', () => {
        runAction('선생님 예약 조회', loadTeacherBookings);
      });

      document.getElementById('teacherCompletedRefreshBtn')?.addEventListener('click', () => {
        runAction('완료 수업 조회', loadTeacherBookings);
      });

      teacherCompletedLessonFilter?.addEventListener('change', () => {
        renderTeacherCompletedList(state.teacherCompletedBookings || []);
      });

      teacherBookingsBody.addEventListener('click', (e) => {
        const approveId = e.target?.dataset?.approveTeacherBooking;
        if (approveId) {
          runAction('예약 승인', async () => {
            await approveBooking(approveId);
            await loadTeacherBookings();
            await loadSlotsForCurrentMonth();
          });
          return;
        }

        const completeId = e.target?.dataset?.completeTeacherBooking;
        if (completeId) {
          runAction('수업 완료 처리', async () => {
            const studentComment = promptRequiredText('학생에게 전달할 코멘트를 입력해 주세요. (필수)');
            if (studentComment === null) return;
            const teacherPrivateComment = promptRequiredText('선생님 내부 메모를 입력해 주세요. (필수)');
            if (teacherPrivateComment === null) return;
            await completeBooking(completeId, {
              teacherPrivateComment,
              studentComment,
            });
            await loadTeacherBookings();
            await loadSlotsForCurrentMonth();
          });
          return;
        }

        const bookingId = e.target?.dataset?.cancelTeacherBooking;
        if (!bookingId) return;
        runAction('선생님 예약 취소', async () => {
          await cancelBooking(bookingId);
          await loadTeacherBookings();
          await loadSlotsForCurrentMonth();
        });
      });

      teacherCompletedList?.addEventListener('click', (e) => {
        const studentCommentId = e.target?.dataset?.editCompletedStudent;
        if (studentCommentId) {
          runAction('학생 전달 코멘트 수정', async () => {
            const current = decodeURIComponentSafe(e.target?.dataset?.currentValue || '');
            const next = promptRequiredText('학생에게 전달할 코멘트를 입력해 주세요. (필수)', current);
            if (next === null) return;
            await completeBooking(studentCommentId, { studentComment: next });
            await loadTeacherBookings();
          });
          return;
        }

        const privateCommentId = e.target?.dataset?.editCompletedPrivate;
        if (privateCommentId) {
          runAction('선생님 메모 수정', async () => {
            const current = decodeURIComponentSafe(e.target?.dataset?.currentValue || '');
            const next = promptRequiredText('선생님 내부 메모를 입력해 주세요. (필수)', current);
            if (next === null) return;
            await completeBooking(privateCommentId, { teacherPrivateComment: next });
            await loadTeacherBookings();
          });
        }
      });

      window.addEventListener('unhandledrejection', (e) => {
        pushLog('UI_REJECTION', {
          message: e.reason?.message || String(e.reason),
          payload: e.reason?.payload,
        });
      });

      window.addEventListener('error', (e) => {
        pushLog('UI_ERROR', { message: e.message });
      });

      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!teacherCreateModal.classList.contains('hidden')) {
          closeTeacherCreateModal();
        }
        if (!teacherExceptionModal.classList.contains('hidden')) {
          closeTeacherExceptionModal();
        }
      });

      async function bootstrap() {
        applyTopNavState();
        studentGridStep.value = '60';
        teacherGridStep.value = '60';
        teacherCreateType.value = state.teacherCreateType;
        state.studentGridStepMin = 60;
        state.teacherGridStepMin = 60;
        applyStudentCalendarViewUi();
        if (exceptionForm?.elements?.date_local && !exceptionForm.elements.date_local.value) {
          exceptionForm.elements.date_local.value = toDateKeyFromDate(new Date());
        }
        if (PAGE_MODE === 'STUDENT' && state.invitedStartAtIso) {
          const invited = new Date(state.invitedStartAtIso);
          if (!Number.isNaN(invited.getTime())) {
            state.monthCursor = new Date(invited);
            state.selectedDateKey = toDateKeyFromDate(invited);
          }
        }
        renderAuth();
        renderStudentMeta();
        renderStudentStats();
        renderTeacherStats();
        if (PAGE_MODE === 'TEACHER' && !state.token) {
          window.location.href = '/index.html';
          return;
        }

        try {
          if (state.token) {
            await syncMe();
          } else {
            setAuth('', null);
          }

          if (PAGE_MODE === 'TEACHER') {
            if (!state.user || state.user.role !== 'TEACHER') {
              window.location.href = '/index.html';
              return;
            }
            await loadTeacherDashboard();
            return;
          }

          if (PAGE_MODE === 'STUDENT' && state.user?.role === 'TEACHER') {
            window.location.href = '/teacher.html';
            return;
          }

          state.monthCursor = new Date();
          await loadTeachers();
          await loadSlotsForCurrentMonth();
          if (state.user?.role === 'STUDENT') {
            await loadMyBookings();
          } else {
            state.studentBookings = [];
            renderMyBookings(state.studentBookings);
            renderStudentStats();
          }
        } catch (err) {
          pushLog('세션 복원 FAILED', { message: getErrorMessage(err), payload: err?.payload });
          setAuth('', null);
          if (PAGE_MODE === 'TEACHER') {
            window.location.href = '/index.html';
          }
        }
      }

      bootstrap();
