# UI/UX QA 체크리스트 (2026-03-23)

## 목표
- 기능 추가 없이 현재 UI/UX 품질을 마감한다.
- 사용자 관점에서 흐름이 끊기지 않는지 확인한다.
- 모바일 사용성, 접근성, 문구 일관성을 함께 점검한다.

## 실행 환경
- 로컬 경로: `/Volumes/Extreme SSD/workspace`
- 실행: `docker-compose up -d --build frontend`
- 백엔드 상태 확인: `bash scripts/smoke-test-api.sh`
- 점검 기준일: 2026-03-23

## 시나리오 QA (사용자 흐름)
1. 로그인/진입
- [x] `index.html` 200 응답
- [x] 로그인 전 상단 로그아웃 버튼 비노출
- [x] 로그인 섹션 문구/입력 항목 정상 표시

2. 학생 흐름
- [x] `student.html` 200 응답
- [x] 선생님 선택, 주간 이동, 오늘 이동 버튼 렌더 확인
- [x] 예약 가능/불가 슬롯 시각 구분 확인
- [x] 비회원 조회 패널 렌더 확인

3. 예약 API 흐름
- [x] 로그인 -> 슬롯조회 -> 예약생성 -> 취소 -> 교사조회까지 스모크 통과
- [x] 결과: `SMOKE_TEST_PASS` 확인

4. 안내/지원 화면
- [x] `guide.html` 200 응답
- [x] 전체 화면 레이아웃 깨짐 없음

## 모바일 점검
1. 뷰포트 기준
- [x] 390x844 기준 스냅샷 생성
- [x] 네비게이션 가로 스크롤/터치 영역(최소 44px) 유지
- [x] 토스트 위치, 모달 하단 safe-area 패딩 유지

2. 실기기 권장 재확인
- [ ] iPhone Safari 실기기에서 키보드 오픈 시 입력 가림 확인
- [ ] Android Chrome 실기기에서 길게 누르기/드래그 제스처 확인

## 접근성 점검
- [x] 포커스 링(`:focus-visible`) 노출 확인
- [x] 현재 페이지 내비게이션에 `aria-current="page"` 적용
- [x] 상태 텍스트 영역에 `role="status" aria-live="polite"` 적용
- [x] 표 헤더 `scope="col"`, 시간축 행 헤더 `scope="row"` 적용
- [x] `prefers-reduced-motion`, `prefers-contrast` 대응 스타일 추가

## 문구/용어 통일 점검
- [x] `Today` -> `오늘`, `This Week` -> `이번 주`
- [x] 개발자 느낌 문구 제거(로그 패널/토큰 노출 없음)
- [x] 관리 테이블 헤더를 사용자 용어(시작/종료/상태/예약번호)로 정리

## 회귀 스냅샷
- 저장 경로: `/Volumes/Extreme SSD/workspace/docs/regression-snapshots/2026-03-23`
- 생성 파일
  - `index-desktop.png`
  - `index-mobile.png`
  - `app-desktop.png`
  - `app-mobile.png`
  - `student-desktop.png`
  - `student-mobile.png`
  - `guide-desktop.png`
  - `guide-mobile.png`

## 검증 명령 기록
```bash
node --check /Volumes/Extreme\ SSD/workspace/frontend/lesson-booking-app.js
docker-compose up -d --build frontend
bash /Volumes/Extreme\ SSD/workspace/scripts/smoke-test-api.sh
```

