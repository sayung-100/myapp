# Lesson Booking MVP - Gemini 인수인계 메모

## 1) 현재 구조 요약
- 목적: 교사/학생 레슨 예약 MVP
- 백엔드: Node.js + Express + PostgreSQL(`pg`) + JWT
- 프론트: Vanilla JS + 정적 HTML 다중 페이지(`frontend/*.html`)
- 인프라: Docker Compose (`frontend`, `backend`, `db`)

## 2) 2026-03-02 기준 핵심 변경
- 인증 로그아웃은 서버 토큰 폐기 방식으로 동작
  - `auth_token_revocations` 테이블 도입
- 예약 생성은 `PENDING` 상태로 생성되고, 교사 승인 시 `BOOKED`
  - `POST /api/v1/teachers/me/bookings/:id/approve`
- 슬롯 점유 판정은 `PENDING`/`BOOKED` 둘 다 차단
- 시간표(`weekly_availabilities`)에 수업 메타데이터 추가
  - `lesson_title`, `lesson_note`
- UI는 역할 페이지 + 섹션 분할 페이지로 접근 가능
  - 학생: `student.html`, `student-calendar.html`, `student-bookings.html`
  - 교사: `teacher.html`, `teacher-calendar.html`, `teacher-manage.html`, `teacher-bookings.html`
- 교사 캘린더에서 `생성 모드`를 `불가 시간/휴무`로 바꾸면 드래그 기반 예외 등록 가능
  - 예외 모달: 날짜, 종일 여부, 시간 범위, 사유
  - 기존 `teacher-manage.html` 예외 폼도 유지(백업 경로)

## 3) Gemini 작업 시 우선 체크
1. 먼저 `README.md`, `CODEX.md`, 최신 `docs/handover-YYYY-MM-DD.md` 확인
2. 백엔드 수정 시 `db/migrations` 반영 여부를 같이 확인
3. 프론트 수정 시 `teacher.html` 기준 변경 후 `student.html` 동기화 여부 점검
4. 승인 플로우(`PENDING -> BOOKED`)를 깨지 않도록 API/화면 모두 검증
5. 예외 등록 후 캘린더 즉시 반영(`loadTeacherExceptions -> renderTeacherCalendar`) 유지 여부 확인

## 4) 필수 검증 명령
```bash
docker compose run --rm backend npm test
docker compose exec -T backend npm run -s migrate
docker compose up --build -d backend frontend
```

## 5) 참고 문서
- 일일 인수인계: `/Users/ndh/workspace/docs/handover-YYYY-MM-DD.md`
- 작업 기록: `/Users/ndh/workspace/docs/worklog-2026-03-02.md`

## 6) 2026-03-02 추가 반영 (최신)
- 설정파일 기반 운영값 적용
  - 파일: `/Users/ndh/workspace/backend/config/app.config.json`
  - 로더: `/Users/ndh/workspace/backend/src/config.js`
  - 반영된 설정: 게스트 취소사유 필수, PIN 락아웃 정책, 완료 코멘트 필수 정책, 스케줄러 주기
- DB 스키마 추가
  - `/Users/ndh/workspace/db/migrations/009_guest_pin_lockout_and_comment_split.sql`
  - `guest_students.pin_failed_attempts`, `guest_students.pin_locked_until`
  - `bookings.teacher_private_comment`, `bookings.student_comment`
- API 정책
  - 교사 완료처리: `teacher_private_comment` + `student_comment` 분리 저장
  - 게스트 취소(일반/토큰): `reason` 필수
  - 게스트 PIN 연속 실패 시 `423 guest_pin_locked`
- 프론트 정책
  - 학생 예약목록은 `student_comment` 표시
  - 교사 예약목록은 학생코멘트/교사메모 분리 표시
  - 완료/코멘트 수정 시 두 코멘트 필수 입력

## 7) 재검증 명령 (최신)
```bash
docker-compose build backend
docker-compose run --rm backend npm test
docker-compose up --build -d backend frontend
docker-compose exec -T backend npm run -s migrate
bash /Users/ndh/workspace/scripts/smoke-test-api.sh
```

## 8) 2026-03-06 추가 인수인계
- 취소 정책
  - 학생 취소(회원/비회원)는 `수업 전날 N시` 정책 적용
  - DB 필드: `teacher_profiles.student_cancel_day_before_hour` (기본 21)
  - 관련 API는 취소 컷오프를 `cancel_cutoff_hours` 대신 위 정책으로 계산
- 공지사항
  - DB 필드: `teacher_profiles.student_notice`
  - `/api/v1/teachers`, `/api/v1/teachers/:teacherId/slots`, `/api/v1/teachers/me/profile`에서 노출
  - 프론트 학생 화면에 선생님 공지 패널 추가
- 중복 생성 방지
  - 마이그레이션 `010_teacher_cancel_policy_notice_and_dedup.sql`
  - 기존 중복 레코드 정리 + 유니크 인덱스 적용
  - API 충돌 에러 코드: `availability_duplicate`, `one_time_availability_duplicate`, `exception_duplicate`
- 교사 대리예약
  - 신규 API: `POST /api/v1/teachers/me/bookings`
  - 입력: `start_at` + (`student_user_id|student_email`) 또는 (`student_name`,`phone`,`pin`)
  - 생성 상태: `BOOKED`
- 링크 분리
  - 캘린더 링크: `student-calendar.html?teacher=<id>`
  - 레슨 링크: `student-calendar.html?teacher=<id>&start_at=<ISO>`
  - 교사 캘린더에 오픈 슬롯 리스트 + 레슨 링크 복사 + 대리예약 버튼 추가
- 버그 수정
  - 교사 예약 승인/취소 탭에서 거절/취소 미동작: 프론트 `cancelBooking` 분기 수정
  - 완료 수업 이력의 “완료시각” 표시 제거
