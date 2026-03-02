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
