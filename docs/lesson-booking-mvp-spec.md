# 레슨 예약 MVP 스펙

## 0) 범위 및 역할
- 제품: 개인 레슨(피아노, 요가 등) 웹 예약 MVP
- 역할:
  - 선생님(관리자): 로그인, 주간 가능 시간/예외 관리, 예약 목록 조회, 예약 취소
  - 수강생: 예약/취소, 내 예약 조회
- 제외 범위(추후): 결제, 정산, 문자/카카오 알림

## 1) 가정
- 하나의 레슨은 선생님 1명, 수강생 1명으로 구성한다.
- 기본 레슨 시간은 60분이며 선생님이 변경할 수 있다.
- 시간대는 선생님 기준 `timezone`으로 고정하며 기본값은 `Asia/Seoul`이다.
- 취소 마감은 레슨 시작 6시간 전이다.
- 예약 가능 범위는 `start_at <= now + 30 days`(포함, 현재 시각 기준)이다.
- 예약 모델은 슬롯 기반(`start_at`)이다.
- 예약 생성 API는 `{start_at}`만 받으며 `end_at`은 서버가 duration으로 계산한다.
- 활성 예약 중복은 DB 부분 유니크 인덱스로 방지한다.
  - `UNIQUE(teacher_user_id, start_at) WHERE status='BOOKED'`
- `COMPLETED` 상태는 유니크 충돌 대상에서 제외한다.

## 2) MVP 기능 / 추후 기능
### MVP
- 선생님 인증(세션 또는 토큰)
- 수강생 인증(이메일/비밀번호)
- 선생님 주간 가능 시간 CRUD
- 선생님 날짜 예외(휴무/차단 시간)
- 수강생 슬롯 조회 API
- 예약 생성/취소
- 예약 목록 조회(선생님/수강생)
- 기본 감사 필드(`created_at`, `updated_at`)

### 추후
- 결제/정산
- 리마인더/알림 연동
- 대기열
- 정기 예약
- 다중 선생님(조직) 지원

## 3) 유저 플로우
### 선생님 플로우
1. 선생님이 로그인한다.
2. 레슨 duration(기본 60분)을 설정한다.
3. 주간 가능 시간대를 등록한다.
4. 예외(휴무/임시 차단)를 등록한다.
5. 다가오는 예약을 확인한다.
6. 필요 시 정책에 따라 예약을 취소한다.

### 수강생 플로우
1. 수강생이 로그인한다.
2. 선생님 페이지에서 기간을 선택한다.
3. 가능한 슬롯(`start_at`, 계산된 `end_at`)을 조회한다.
4. `{start_at}`로 예약을 요청한다.
5. 서버가 정책 검증 후 예약을 생성한다.
6. 내 예약을 조회하고 6시간 규칙 내에서 취소한다.

## 4) 데이터 모델

### users
- `id` (PK, bigserial)
- `role` (enum: `TEACHER`, `STUDENT`)
- `email` (unique)
- `password_hash`
- `name`
- `created_at`, `updated_at`

인덱스
- `UNIQUE(email)`
- `INDEX(role)`

### teacher_profiles
- `teacher_user_id` (PK, FK -> users.id)
- `lesson_duration_min` (int, 기본 60)
- `timezone` (text, 기본 `Asia/Seoul`)
- `cancel_cutoff_hours` (int, 기본 6)
- `booking_window_days` (int, 기본 30)
- `created_at`, `updated_at`

### weekly_availabilities
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `weekday` (0-6)
- `start_time_local` (time)
- `end_time_local` (time)
- `is_active` (bool)
- `created_at`, `updated_at`

인덱스
- `INDEX(teacher_user_id, weekday, is_active)`

### availability_exceptions
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `date_local` (date)
- `start_time_local` (time, nullable; null이면 종일 휴무)
- `end_time_local` (time, nullable)
- `reason` (text)
- `created_at`, `updated_at`

인덱스
- `INDEX(teacher_user_id, date_local)`

### bookings
- `id` (PK)
- `teacher_user_id` (FK -> users.id)
- `student_user_id` (FK -> users.id)
- `start_at` (timestamptz)
- `duration_min` (int)
- `status` (enum: `BOOKED`, `CANCELED_BY_STUDENT`, `CANCELED_BY_TEACHER`, `COMPLETED`, `NO_SHOW`)
- `canceled_at` (timestamptz, nullable)
- `cancel_reason` (text, nullable)
- `created_at`, `updated_at`

인덱스/제약
- 활성 슬롯 중복 방지를 위한 부분 유니크 인덱스:
  - `UNIQUE(teacher_user_id, start_at) WHERE status='BOOKED'`
- `INDEX(student_user_id, start_at DESC)`
- `INDEX(teacher_user_id, start_at DESC)`

## 5) API 엔드포인트

### 인증(Auth)
- `POST /api/v1/auth/register` (public)
- `POST /api/v1/auth/login` (public)
- `POST /api/v1/auth/logout` (authenticated)

오류 코드
- `400` 유효성 검증 실패
- `401` 인증 실패
- `409` 이메일 중복

### 선생님 시간표
- `GET /api/v1/teachers/me/availability` (teacher)
- `POST /api/v1/teachers/me/availability` (teacher)
- `PATCH /api/v1/teachers/me/availability/:id` (teacher)
- `DELETE /api/v1/teachers/me/availability/:id` (teacher)

오류 코드
- `400`, `401`, `403`, `404`, `409`

### 선생님 예외
- `GET /api/v1/teachers/me/exceptions` (teacher)
- `POST /api/v1/teachers/me/exceptions` (teacher)
- `DELETE /api/v1/teachers/me/exceptions/:id` (teacher)

오류 코드
- `400`, `401`, `403`, `404`, `409`

### 슬롯 조회
- `GET /api/v1/teachers/:teacherId/slots?from=...&to=...` (student/auth)
- 응답 항목:
  - `start_at`
  - `end_at` (duration 기반 서버 계산값)
  - `is_available`

오류 코드
- `400`, `401`, `404`

### 예약
- `POST /api/v1/bookings` (student)
- 요청 본문: `{ "start_at": "2026-02-20T10:00:00+09:00" }`
- 서버가 `end_at`을 계산하고 `duration_min`을 저장한다.

- `GET /api/v1/bookings/me` (student)
- `GET /api/v1/teachers/me/bookings` (teacher)
- `POST /api/v1/bookings/:id/cancel` (owner/teacher)

오류 코드
- `400` 잘못된 datetime / 정책 위반
- `401` 인증 실패
- `403` 권한 없음
- `404` 리소스 없음
- `409` 이미 예약된 슬롯(유니크 충돌)
- `422` `start_at <= now + 30 days` 위반 또는 취소 마감 위반

## 6) 엣지 케이스 및 정책
- 동시 예약: DB 부분 유니크 인덱스를 최종 보호 장치로 사용한다.
- 중복 요청 재시도: 유니크 충돌은 비즈니스 오류(`409`)로 반환한다.
- 과거 시각 예약: `422`로 거절한다.
- +30일 초과 예약: `start_at <= now + 30 days` 규칙으로 `422` 처리한다.
- 슬롯 조회-예약 시차: 예약 트랜잭션 시점에서 최종 검증한다.
- 취소 6시간 경계값: `now <= start_at - interval '6 hours'`이면 허용한다.
- 선생님의 마감 이후 취소: 관리자 안전장치로 허용하되 로그를 남긴다.
- 노쇼 처리: 선생님/배치에서 `NO_SHOW`로 전환한다.
- 완료 처리: 레슨 종료 후 `BOOKED -> COMPLETED` 전환한다.
- `COMPLETED`는 활성 슬롯 유니크 충돌 검사에서 제외한다.

## 7) 테스트 시나리오 (15)
1. 수강생이 30일 이내 유효 슬롯 예약 -> 성공
2. 동일 teacher+start_at 동시 예약 -> 1건 성공, 1건 `409`
3. 잘못된 datetime 형식으로 예약 -> `400`
4. 과거 시각 예약 -> `422`
5. 정확히 `now + 30 days` 예약 -> 성공
6. `now + 30 days` 초과 예약 -> `422`
7. 6시간 이전 취소 -> 성공
8. 6시간 이후 취소 -> `422`
9. 선생님이 마감 이후 예약 취소 -> 성공 + 감사 로그
10. 슬롯 응답에 duration 기반 `end_at` 포함
11. 선생님 duration 변경 시 이후 슬롯 `end_at`에 반영
12. 종일 휴무 예외 등록 시 해당 날짜 슬롯 전체 제거
13. 부분 시간 예외 등록 시 겹치는 슬롯만 제거
14. 동일 start_at의 COMPLETED 예약은 새 BOOKED 예약을 막지 않음
15. 수강생은 본인 예약만, 선생님은 본인 수업 예약만 조회 가능

## 8) 마일스톤
1. 프로젝트 초기화(레포/프론트/백엔드/DB/compose/env/migrate/seed)
2. 인증(Auth)
3. 시간표/예외
4. 예약 API
5. QA 강화
