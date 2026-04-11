# LessonHub AGENTS.md

이 문서는 이 저장소에서 작업하는 코딩 에이전트용 운영 규칙이다.
목적은 세 가지다.
- 추측으로 수정하지 않는다.
- 변경 전 영향 범위를 확인한다.
- 변경 후 검증 결과를 남긴다.

## 1. 작업 시작 전 읽을 문서
아래 순서대로 읽는다.
1. `/Volumes/Extreme_SSD/workspace/README.md`
2. `/Volumes/Extreme_SSD/workspace/CODEX.md`
3. `/Volumes/Extreme_SSD/workspace/docs/handover-YYYY-MM-DD.md` 중 최신 파일
4. `/Volumes/Extreme_SSD/workspace/docs/ai-handover-2026-03-30.md`
5. `/Volumes/Extreme_SSD/workspace/docs/ai-collaboration-playbook-2026-04-02.md`

## 2. 저장소와 서비스 기준
- 루트 워크스페이스가 소스 오브 트루스다.
- `.Codex/worktrees/...`는 기준으로 쓰지 않는다.
- 저장소 구조는 `frontend/`, `backend/`, `db/`, `docs/`다.
- 백엔드는 Node.js + Express + PostgreSQL + JWT다.
- 프론트는 정적 HTML + Vanilla JS다.
- 기본 포트는 프론트 `18080`, 백엔드 `4000`이다.
- 서비스 시간대는 `Asia/Seoul`이다.
- 역할은 `POWER_ADMIN`, `TEACHER`, `STUDENT`다.

## 3. 도메인 규칙
- 학생 예약은 담당 선생님 연결 상태를 전제로 본다.
- 예약 길이는 `teacher_profiles.lesson_duration_min`를 기준으로 계산한다.
- 슬롯 계산은 시간표, 단건 가용시간, 예외, 기존 예약, 예약 가능 기간을 함께 본다.
- `users.is_active = FALSE` 사용자는 인증, 조회, 연결 로직에서 제외한다.
- 파워관리자 삭제는 soft delete다.
- 선생님 비활성화 시 학생 연결 해제 영향까지 확인한다.

## 4. 먼저 확인할 파일
- 백엔드 엔트리: `/Volumes/Extreme_SSD/workspace/backend/src/index.js`
- 인증 보조: `/Volumes/Extreme_SSD/workspace/backend/src/auth.js`
- 프론트 메인: `/Volumes/Extreme_SSD/workspace/frontend/app.html`
- 프론트 메인 로직: `/Volumes/Extreme_SSD/workspace/frontend/lesson-booking-app.js`
- 파워관리자 로직: `/Volumes/Extreme_SSD/workspace/frontend/power-admin-app.js`
- 로그인 흐름 파일: `/Volumes/Extreme_SSD/workspace/frontend/index.html`, `/Volumes/Extreme_SSD/workspace/frontend/teacher-login.html`, `/Volumes/Extreme_SSD/workspace/frontend/student-login.html`, `/Volumes/Extreme_SSD/workspace/frontend/login-flow.js`
- 관련 마이그레이션: `/Volumes/Extreme_SSD/workspace/db/migrations/014_power_admin_and_timezone.sql`, `/Volumes/Extreme_SSD/workspace/db/migrations/015_user_soft_deletion.sql`, `/Volumes/Extreme_SSD/workspace/db/migrations/016_admin_patch_notes_and_power_admin_login_fix.sql`

다음 파일은 공용 위험 파일이다.
- `/Volumes/Extreme_SSD/workspace/backend/src/index.js`
- `/Volumes/Extreme_SSD/workspace/frontend/lesson-booking-app.js`
- `/Volumes/Extreme_SSD/workspace/frontend/app.html`
- `/Volumes/Extreme_SSD/workspace/frontend/login-flow.js`

이 파일을 수정할 때는 수정 전에 영향 범위를 먼저 적는다.

## 5. 역할 정의

### planner
- 책임: 작업 범위, 읽을 파일, 검증 계획을 먼저 정한다.
- 입력: 사용자 요청, 최신 핸드오버, 관련 코드와 문서.
- 출력: 수정 대상 파일, 영향 범위, 검증 명령, 보류 이슈.
- 금지 행동: 코드를 읽기 전에 구현 방향을 확정하지 않는다. 검증 계획 없이 작업을 넘기지 않는다.

### coder
- 책임: 합의된 범위 안에서만 구현한다.
- 입력: planner가 정리한 범위, 기존 코드, 스키마, API 계약.
- 출력: 코드 변경, 필요한 테스트, 필요한 문서 갱신.
- 금지 행동: 추측 구현, 하드코딩, 요청 범위를 넘는 리팩토링, 임시 디버그 코드 방치.

### reviewer
- 책임: 회귀, 권한 누락, 시간 계산 오류, 테스트 공백을 찾는다.
- 입력: 변경 파일, 영향 범위 메모, 테스트 결과.
- 출력: 수정 필요 사항, 남은 리스크, 추가 검증 항목.
- 금지 행동: 근거 없는 승인, 스타일 취향만의 지적, 요구사항 변경.

### tester
- 책임: 실행한 검증과 실행하지 못한 검증을 분리해 기록한다.
- 입력: 변경 목적, 검증 명령, 기대 결과.
- 출력: 실행 명령, 결과, 실패 증상, 미실행 항목.
- 금지 행동: 실행하지 않은 테스트를 통과로 적지 않는다. 실패를 숨기지 않는다.

## 6. 작업 흐름
1. 문서와 관련 코드를 먼저 읽는다.
2. 세션 시작 시 아래 형식으로 범위를 적는다.

```md
## 이번 세션 소유 범위
- 담당:
- 목표:
- 직접 수정할 파일:
- 건드리지 않을 파일:
- 실행할 검증:
```

3. 아래 조건 중 하나면 수정 전에 영향 범위를 적는다.
- 공용 위험 파일 수정
- DB 스키마 수정
- 인증, 권한, 예약, 슬롯 계산 수정
- 로그인 흐름 수정
- 파워관리자 기능 수정

4. 영향 범위 메모에는 아래만 적는다.
- 왜 수정하는지
- 직접 수정할 파일
- 같이 읽은 파일
- 영향을 받는 역할
- 실행할 검증

5. 수정은 작은 단위로 나눈다.
6. 구현 후 바로 테스트한다.
7. 리뷰 후 아래 형식으로 결과를 남긴다.

```md
## 이번 세션 결과
- 완료:
- 미완료:
- 확인한 리스크:
- 실행한 검증:
- 다음 사람이 바로 볼 파일:
```

## 7. 구현 규칙
- 추측 구현 금지. 코드, 스키마, 문서 중 하나로 근거를 확인한 뒤 수정한다.
- 하드코딩 금지. 포트, 시간대, 역할, API 경로, 정책값은 기존 설정을 따른다.
- 불필요한 리팩토링 금지. 요청 해결에 직접 필요할 때만 구조를 바꾼다.
- 요청 범위를 넘는 수정 금지. 다른 문제를 발견하면 메모만 남긴다.
- 예외 처리와 로그를 남긴다. 실패 위치를 추적할 수 있어야 한다.
- 테스트 가능한 형태로 구현한다. 분기가 늘면 검증 지점도 같이 만든다.
- 프론트 수정 시 화면 상태와 API 상태가 맞는지 확인한다.
- DB 변경 시 마이그레이션, 시드, 테스트 데이터 영향을 같이 본다.
- 문서나 설정 예시가 바뀌면 `README.md`나 관련 `docs/`도 같이 갱신한다.

다음 경우는 항상 같이 확인한다.
- 인증, 관리자 로직 수정: `is_active`, 학생-선생 연결 해제, 마지막 POWER_ADMIN 보호
- 슬롯, 예약 로직 수정: `Asia/Seoul`, `lesson_duration_min`, 예외, 중복 판정, 예약 가능 기간
- 로그인 수정: `index.html`, `teacher-login.html`, `student-login.html`, `login-flow.js`
- 파워관리자 수정: `/api/v1/admin/*`, `frontend/power-admin-app.js`

## 8. 완료 조건
- 완료 보고 첫 줄에 변경 목적을 1~2문장으로 적는다.
- 완료 보고에 변경 파일과 변경 이유를 적는다.
- 실행한 테스트 결과를 적는다.
- 테스트하지 못한 항목은 이유와 함께 적는다.
- 디버그 코드, 임시 출력, 불필요한 로그를 제거한다.
- 문서나 설정 예시가 바뀌었으면 같이 갱신한다.
- 남은 리스크가 있으면 적는다.

완료 보고에는 아래 5개만 남긴다.
- 변경 요약
- 실행한 검증 명령
- 검증 결과
- 미실행 또는 실패한 검증
- 남은 리스크

## 9. 실패 기록 규칙
- 실패한 시도는 숨기지 않는다.
- 회귀나 반복 실수는 최신 `docs/handover-YYYY-MM-DD.md`에 남긴다.
- 같은 유형의 실수가 두 번 이상 나오면 팀 규칙으로 올린다.

기록 형식:

```md
## 실패 기록
- 실수 내용:
- 원인:
- 놓친 신호:
- 재발 방지 규칙:
- 다음 체크포인트:
```

아래는 반드시 기록한다.
- 인증, 권한, soft delete, 마지막 POWER_ADMIN 보호 로직 회귀
- 학생-선생 연결 누락으로 예약 흐름이 깨진 경우
- `lesson_duration_min`, 시간대, 날짜 경계, 슬롯 중복 판정 오류
- 테스트는 통과했지만 수동 흐름에서 실패한 경우
- Docker, migrate, seed, smoke 절차가 문서와 달라 막힌 경우

## 10. 커밋 전 체크리스트
- 관련 기능을 직접 실행했거나 테스트했다.
- 가능한 경우 `lint`, `format`, `test`를 실행했다.
- 변경 파일을 다시 읽었다.
- 하드코딩, 디버그 코드, 임시 출력, 불필요한 로그를 제거했다.
- 영향 범위를 다시 확인했다.
- 문서, 설정, 예시 명령 갱신이 필요한지 확인했다.
- 공용 위험 파일 변경이면 관련 역할 흐름을 다시 확인했다.
- DB 변경이면 migrate, seed, 기존 데이터 영향을 확인했다.

권장 검증 명령:

```bash
docker compose up --build -d
docker compose run --rm backend npm test
bash "/Volumes/Extreme_SSD/workspace/scripts/daily-handover.sh"
RUN_SMOKE=1 bash "/Volumes/Extreme_SSD/workspace/scripts/daily-handover.sh"
```

상황별 추가 검증:

```bash
node --check /Volumes/Extreme_SSD/workspace/backend/src/index.js
node --check /Volumes/Extreme_SSD/workspace/backend/src/auth.js
node --check /Volumes/Extreme_SSD/workspace/frontend/lesson-booking-app.js
node --check /Volumes/Extreme_SSD/workspace/frontend/login-flow.js
node --check /Volumes/Extreme_SSD/workspace/frontend/power-admin-app.js
docker compose run --rm backend npm run migrate
docker compose run --rm backend npm run seed
bash "/Volumes/Extreme_SSD/workspace/scripts/smoke-test-api.sh"
```

테스트를 생략하면 이유를 적는다.
예: 문서만 수정, Docker 미기동, 외부 의존성 장애, 브라우저 자동화 환경 제한.

## 11. 작업 후 아이디어 규칙
- 요청 범위를 넘는 아이디어는 구현하지 말고 제안으로만 남긴다.
- 아이디어 메모는 아래 4개만 적는다.
- 문제
- 기대 효과
- 필요한 파일
- 예상 검증

## 12. 현 저장소에서 자주 놓치는 것
- 오래된 문서에 `8080`이나 예전 관리자 비밀번호가 남아 있을 수 있다. 현재 기준은 `18080`, `poweradmin / pa12345678`이다.
- `._*` 같은 macOS 메타파일 때문에 Docker 빌드가 깨질 수 있다.
- 큰 변경 후에는 `docs/handover-YYYY-MM-DD.md`에 완료 작업, 검증 결과, 리스크, 다음 액션을 남긴다.
