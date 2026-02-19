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
- 프론트: `http://localhost:8080`
- 백엔드 헬스체크: `http://localhost:4000/health`
- 프론트 프록시 헬스체크: `http://localhost:8080/api/health`

## 4) 마이그레이션 / 시드
```bash
docker compose run --rm backend npm run migrate
docker compose run --rm backend npm run seed
```

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
- `POST /api/v1/bookings/:id/cancel` (student owner or teacher owner)

시드 사용자 (비밀번호: `password123!`)
- `teacher@example.com` (TEACHER)
- `student@example.com` (STUDENT)

## 참고
- 인증은 JWT 기반 무상태(Stateless) 액세스 토큰 방식입니다.
- 프론트(`http://localhost:8080`)는 로그인 role에 따라 선생님/학생 화면이 분리됩니다.
- 학생 화면은 월간 캘린더 기반으로 슬롯을 조회하고 바로 예약/취소할 수 있습니다.
