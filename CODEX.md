# CODEX 협업 가이드

이 문서는 Codex 작업 기준과 매일 인수인계 루틴을 정의합니다.

## 1) 역할
- Codex: 구현 마무리, 리팩토링, 회귀 위험 점검, 검수/테스트 자동화
- Gemini: 빠른 초안 구현, 시나리오 확장, 아이디어 탐색

## 2) 기본 원칙
- 기능 구현 후 반드시 재현 가능한 검증 명령을 남긴다.
- 변경 이유와 영향 범위를 인수인계 문서에 기록한다.
- 큰 변경은 `README.md` 또는 `docs/`에 사용 방법을 함께 갱신한다.

## 3) 일일 인수인계 루틴
1. `bash "/Volumes/Extreme SSD/workspace/scripts/daily-handover.sh"`
2. 필요 시 스모크 테스트 실행
   - `bash "/Volumes/Extreme SSD/workspace/scripts/smoke-test-api.sh"`
3. 생성/갱신된 `docs/handover-YYYY-MM-DD.md`에 아래 항목 보강
   - 오늘 완료 작업
   - 검증 결과
   - 리스크/미해결 이슈
   - 다음 액션 1~3개
4. 커밋 메시지에 `docs:` 또는 `chore:` 접두어로 기록

## 4) Codex 검수 체크리스트
- API 계약(요청/응답/에러코드)이 문서와 일치하는가
- 시간/타임존/경계값 로직에 회귀 위험이 없는가
- 인증/인가 경로가 역할별로 올바른가
- 프론트 UI 변경이 실제 API 상태와 동기화되는가
- 재현 스크립트 또는 테스트 명령이 남아 있는가

## 5) 협업 인수인계 파일 규칙
- Gemini 전용 메모: `/Volumes/Extreme SSD/workspace/GEMINI.md`
- Codex 전용 메모: `/Volumes/Extreme SSD/workspace/CODEX.md`
- 일일 로그: `/Volumes/Extreme SSD/workspace/docs/handover-YYYY-MM-DD.md`
