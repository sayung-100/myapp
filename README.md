# 레슨 예약 MVP

개인 레슨(피아노/요가 등) 웹 예약 MVP 단일 레포입니다.

현재 단계: **1) 프로젝트 초기화 + 2) 인증(Auth) + 3) 시간표/예외 + 4) 슬롯/예약 API**
- 포함: 프론트/백엔드/DB 기본 구조, Docker Compose, 마이그레이션/시드, 스펙 문서
- 포함: 기본 인증 API (`register`, `login`, `logout`, `me`)
- 포함: 선생님 시간표/예외 API
- 포함: 슬롯 조회/예약 생성/예약 취소/예약 목록 API
- 미구현: 결제/알림/노쇼 자동 전환, 모바일 앱 전용 UI

## 구조
- `docs/lesson-booking-mvp-spec.md`: 제품/API/데이터 스펙 (슬롯 기반 정책 반영)
- `frontend/`: 정적 UI + `/api` 리버스 프록시
- `backend/`: Node.js(Express) 서비스 + 마이그레이션/시드 실행 스크립트
- `db/`: SQL 마이그레이션/시드

## 사전 요구사항
- Docker + Docker Compose

## 1) 환경 파일 생성
```bash
cp .env.example .env
```

## 2) 서비스 전체 실행
```bash
docker compose up --build -d
```

## 3) 동작 확인
- 로그인: `http://localhost:8080/index.html`
- 학생 통합 대시보드: `http://localhost:8080/student.html`
- 학생 캘린더: `http://localhost:8080/student-calendar.html`
- 학생 예약 목록: `http://localhost:8080/student-bookings.html`
- 선생님 통합 대시보드: `http://localhost:8080/teacher.html`
- 선생님 캘린더: `http://localhost:8080/teacher-calendar.html`
- 선생님 시간표/예외 관리: `http://localhost:8080/teacher-manage.html`
- 선생님 예약 관리: `http://localhost:8080/teacher-bookings.html`
- 사용자 설명서: `http://localhost:8080/guide.html`
- 백엔드 헬스체크: `http://localhost:4000/health`
- 프론트 프록시 헬스체크: `http://localhost:8080/api/health`

## 선생님 불가 일정(휴무/차단) 설정 방법
- 캘린더 방식(권장)
  1. `http://localhost:8080/teacher-calendar.html` 접속
  2. 상단 `생성 모드`를 `불가 시간/휴무`로 변경
  3. 캘린더에서 날짜/시간을 15분 단위로 드래그
  4. 뜨는 모달에서 날짜, 시간(또는 `종일 차단`), 사유를 입력 후 저장
  5. 저장 즉시 선생님 캘린더에 `불가`로 표시되고 학생 슬롯에서 제외
- 기존 폼 방식
  - `http://localhost:8080/teacher-manage.html`의 `예외(Exceptions)` 섹션에서 날짜/시간/사유를 직접 등록/삭제

## 4) 마이그레이션 / 시드
```bash
docker compose run --rm backend npm run migrate
docker compose run --rm backend npm run seed
```

## 4-1) 백엔드 통합 테스트
```bash
docker compose run --rm backend npm test
```
- 주의: 테스트는 예약/시간표 관련 테이블을 초기화(`TRUNCATE ... RESTART IDENTITY`)합니다.

## 5) 중지
```bash
docker compose down
```

## 인증 API (MVP)
- `POST /api/v1/auth/register`
  - body: `{"email":"new@example.com","password":"password123!","name":"새 사용자","role":"STUDENT"}`
- `POST /api/v1/auth/login`
  - body: `{"email":"teacher@example.com","password":"password123!"}`
- `POST /api/v1/auth/logout` (`Authorization: Bearer <token>` 필요)
- `GET /api/v1/auth/me` (`Authorization: Bearer <token>` 필요)

## 선생님 시간표 API (MVP)
- `GET /api/v1/teachers/me/availability` (teacher)
- `POST /api/v1/teachers/me/availability` (teacher)
- `PATCH /api/v1/teachers/me/availability/:id` (teacher)
- `DELETE /api/v1/teachers/me/availability/:id` (teacher)

## 선생님 예외 API (MVP)
- `GET /api/v1/teachers/me/exceptions` (teacher)
- `POST /api/v1/teachers/me/exceptions` (teacher)
- `DELETE /api/v1/teachers/me/exceptions/:id` (teacher)

## 선생님/슬롯 API (MVP)
- `GET /api/v1/teachers` (authenticated)
- `GET /api/v1/teachers/:teacherId/slots?from=...&to=...` (authenticated)

## 예약 API (MVP)
- `POST /api/v1/bookings` (student)
  - body: `{"teacher_user_id":1,"start_at":"2026-02-20T10:00:00+09:00"}`
- `GET /api/v1/bookings/me` (student)
- `GET /api/v1/teachers/me/bookings` (teacher)
- `POST /api/v1/teachers/me/bookings/:id/approve` (teacher)
- `POST /api/v1/bookings/:id/cancel` (student owner or teacher owner)

시드 사용자 (비밀번호: `password123!`)
- `teacher@example.com` (TEACHER)
- `student@example.com` (STUDENT)

## 참고
- 인증은 JWT 기반 무상태(Stateless) 액세스 토큰 방식입니다.
- 프론트(`http://localhost:8080`)는 로그인 role에 따라 선생님/학생 화면이 분리됩니다.
- 학생 화면은 월간 캘린더 기반으로 슬롯을 조회하고 바로 예약/취소할 수 있습니다.

## AI 협업 문서 운영
- Gemini 메모: `GEMINI.md`
- Codex 메모: `CODEX.md`
- 일일 인수인계: `docs/handover-YYYY-MM-DD.md`
- UI 리디자인 기록: `docs/ui-redesign-2026-02-24.md`
- UI/UX QA 체크리스트: `docs/ui-qa-checklist-2026-03-23.md`
- Gemini 디자인 검수 주의사항: `docs/gemini-design-review-notes-2026-03-23.md`
- AI 앱 제작 회고(Notion/블로그 초안): `docs/notion-ai-app-build-case-study-2026-03-23.md`
- AI 앱 제작 회고(Notion/블로그 완성본): `docs/notion-blog-full-nondev-ai-app-2026-03-23.md`

매일 인수인계 스냅샷 생성:
```bash
bash "/Volumes/Extreme SSD/workspace/scripts/daily-handover.sh"
```

스모크 테스트까지 포함해 기록:
```bash
RUN_SMOKE=1 bash "/Volumes/Extreme SSD/workspace/scripts/daily-handover.sh"
```
