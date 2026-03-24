# UI 리디자인 작업 기록 (2026-02-24)

## 1) 사용자 요청 원문
> 우선 사용자에게 보여주려면 실 사용 화면이 매우중요할것 같아.
> 일반적인 스케쥴 캘린더 어플과 타 예약어플을 참고해서 화면을 디자인해봐. 내가 나중에 그림도 제시하면서 해줄수있으니 일단 외부내용 참고해서 만들어보고, 어떤 기능이 가능한지 사용자 설명페이지도 따로 작성해놔.
> 이 모든내용도 잘 기록해둬서 다른 에이전트가 확인해도 그대로 작업을 이어갈수있도록 정리해 (나의요청문구와 너가 받아드린 내용 등)

## 2) 요청 해석(에이전트)
- 기존 기능(API)는 유지하고, 사용자에게 보여줄 프론트 화면을 실사용 중심으로 개선한다.
- 일정/예약 앱의 일반적인 UX 패턴(캘린더 탐색, 오늘 이동, 예약 가능 상태 가시화, 정책 노출)을 반영한다.
- 기능 설명 전용 페이지를 별도 경로로 만든다.
- 작업 의도와 범위를 다음 에이전트가 이어받기 쉽도록 문서화한다.

## 3) 외부 참고 소스(패턴 추출)
1. Google Calendar Help - 캘린더 보기 변경(일/주/월/일정)
   - 링크: https://support.google.com/calendar/answer/6110849
   - 반영 패턴: 월간 탐색 중심 UI, 뷰 전환 개념 중 `Today` 빠른 이동 패턴 채택
2. Calendly Help - Event Types 관리
   - 링크: https://help.calendly.com/hc/en-us/articles/360035734731-How-to-manage-your-event-types
   - 반영 패턴: 예약 유형/시간 설정을 운영 화면에서 분리해 관리하는 정보 구조
3. Calendly Help - Availability Schedules
   - 링크: https://help.calendly.com/hc/en-us/articles/226766767-How-to-use-availability-schedules
   - 반영 패턴: 반복 가능 시간(weekly)과 예외 일정(exception)을 분리하는 모델
4. Microsoft Learn - bookingSchedulingPolicy
   - 링크: https://learn.microsoft.com/en-us/graph/api/resources/bookingschedulingpolicy
   - 반영 패턴: 최소 리드타임/예약 가능 기간/취소 윈도우를 사용자에게 명시

## 4) 실제 반영 내용
- 학생 대시보드:
  - 월간 캘린더 + 일별 슬롯 패널 유지
  - `Today` 버튼 추가
  - `예약 가능만 보기` 필터 추가
  - 요약 카드(월 슬롯 수/예약 가능 슬롯/내 활성 예약) 추가
  - 선생님 정책 메타(예약 가능 범위, 취소 컷오프) 표시
- 선생님 대시보드:
  - 요약 카드(활성 시간표/예외 수/활성 예약 수) 추가
  - Availability / Exceptions / Bookings를 운영 카드 형태로 재배치
- 공통:
  - 상단 내비게이션(대시보드/사용자 설명서) 추가
  - API 로그를 접을 수 있는 패널로 변경
  - 모바일 대응 레이아웃 정리
  - 페이지 진입 애니메이션(리빌 + 스태거) 추가

## 5) 새로 만든 사용자 설명 페이지
- 경로: `/guide.html`
- 목적: 학생/선생님 관점의 사용 가능한 기능, 실제 사용 순서, 정책 안내 제공
- 포함 항목:
  - 기능 목록(학생/선생님)
  - 역할별 사용 플로우
  - 화면 요소 의미
  - 정책/제약 안내

## 6) 변경 파일
- `/Volumes/Extreme SSD/workspace/frontend/index.html` (전면 리디자인 + 대시보드 지표/필터/Today 추가)
- `/Volumes/Extreme SSD/workspace/frontend/guide.html` (신규 사용자 설명 페이지)
- `/Volumes/Extreme SSD/workspace/frontend/Dockerfile` (`*.html` 복사로 가이드 페이지 배포 포함)
- `/Volumes/Extreme SSD/workspace/README.md` (가이드 URL/리디자인 기록 문서 링크 추가)
- `/Volumes/Extreme SSD/workspace/db/seeds/001_seed.sql` (시드 재적용 시 teacher_profiles 기본 정책 복구되도록 UPSERT 강화)

## 7) 후속 제안(다음 에이전트용)
1. 사용자가 제공할 실제 레퍼런스 이미지(스크린샷/와이어프레임) 기반으로 UI 세부 조정
2. 학생 화면의 캘린더 뷰를 월/주 전환으로 확장
3. 선생님 화면의 시간표 입력 UX를 폼 + 인라인 편집 방식으로 단순화
4. E2E 스모크(로그인→예약→취소) 자동 캡처 스크립트 추가
