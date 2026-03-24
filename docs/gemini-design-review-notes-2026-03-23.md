# Gemini 디자인 검수 주의사항 (2026-03-23)

## 검수 목적
- 기능 추가 없이 현재 UI/UX 완성도를 올리기 위한 디자인 리뷰를 받는다.
- 리뷰 대상은 시각 완성도, 사용성, 문구 일관성, 접근성 품질이다.

## 검수 입력 자료
- 코드 기준 파일
  - `/Volumes/Extreme SSD/workspace/frontend/app.html`
  - `/Volumes/Extreme SSD/workspace/frontend/lesson-booking-app.css`
  - `/Volumes/Extreme SSD/workspace/frontend/lesson-booking-app.js`
- 회귀 스냅샷
  - `/Volumes/Extreme SSD/workspace/docs/regression-snapshots/2026-03-23`
- QA 체크리스트
  - `/Volumes/Extreme SSD/workspace/docs/ui-qa-checklist-2026-03-23.md`

## 반드시 지킬 제약
1. 기능 추가 금지
- 새로운 API, 새로운 화면, 새로운 사용자 플로우 제안 금지
- 기존 동작을 바꾸는 구조 개편 제안 금지

2. 개발자 노출 요소 재도입 금지
- API 로그 패널, 토큰 노출 박스, 디버그 버튼 류 제안 금지
- 테스트 편의용 고정 계정 자동입력 UX 제안 금지

3. 기존 정책 흐름 유지
- 예약/취소 정책, 승인 플로우(PENDING -> BOOKED), 게스트 예약 정책 변경 금지
- 백엔드 엔드포인트/파라미터명 변경 제안 금지

4. 기술 제약 존중
- 프론트는 Vanilla JS + 정적 HTML 구조 유지
- `frontend/app.html`, `frontend/lesson-booking-app.css`, `frontend/lesson-booking-app.js` 중심으로만 개선

## Gemini에게 요청할 리뷰 범위
1. 시각/레이아웃
- 정보 밀도는 유지하되, 중요도 대비 계층이 명확한지
- 색상 대비와 버튼 우선순위가 명확한지
- 카드/테이블/캘린더가 모바일에서 답답하지 않은지

2. 사용성
- 첫 진입 시 사용자가 해야 할 행동이 즉시 보이는지
- 버튼 라벨이 사용자 언어인지(기술 용어/영문 잔재 여부)
- 동일 의미의 문구가 화면마다 일관되는지

3. 접근성
- 키보드 포커스 이동이 자연스러운지
- 상태 텍스트/현재 페이지 표시가 보조기기 친화적인지
- 작은 글자/좁은 터치영역이 남아있는지

4. 모바일 품질
- 390x844 기준에서 상단 네비, 캘린더 툴바, 모달 입력 흐름이 불편하지 않은지
- 스크롤 충돌(가로/세로)과 입력창 가림 가능성이 있는지

## Gemini 피드백 출력 형식 요청
- 우선순위 `상/중/하`로 나눠서 제시
- 각 항목은 `문제 -> 사용자 영향 -> 수정 가이드` 순서
- 기능 추가 제안은 제외하고, 현재 구조 내 수정안만 제시

## 참고
- 실기기 최종 확인은 별도 수행 필요
  - iPhone Safari: 키보드 오픈 시 입력 가림
  - Android Chrome: 길게 누르기/드래그 제스처

