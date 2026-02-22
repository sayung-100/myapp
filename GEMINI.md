# Lesson Booking MVP - AI 협업 가이드 및 프로젝트 기록

이 파일은 Gemini CLI와 Codex 등 다양한 AI 에이전트 간의 협업을 돕고, 프로젝트의 현재 상태를 유지하기 위한 핵심 문서입니다.

## 1. 프로젝트 개요
*   **목적:** 교사와 학생 간의 레슨 예약 시스템 (MVP)
*   **주요 기능:** JWT 기반 인증, 주간 시간표 설정, 예약 예외 처리, 캘린더 기반 슬롯 예약/취소

## 2. 기술 스택 (Tech Stack)
*   **Backend:** Node.js, Express, `pg` (PostgreSQL), `jsonwebtoken`
*   **Frontend:** Vanilla JS, CSS Variables (Single Page HTML)
*   **Database:** PostgreSQL 16 (Schema: `db/` 디렉토리 참조)
*   **Infrastructure:** Docker Compose (Nginx, Node, Postgres)

## 3. 아키텍처 핵심 로직
*   **슬롯 계산:** 백엔드 `index.js`에서 PostgreSQL의 `generate_series`를 사용하여 가용 시간 슬롯을 실시간으로 생성함.
*   **예외 처리:** `availability_exceptions` 테이블을 참조하여 특정 날짜/시간의 슬롯을 차단함.
*   **프론트엔드:** 별도의 빌드 도구 없이 `frontend/index.html` 내의 script 태그에서 모든 비즈니스 로직과 UI 업데이트를 처리함.

## 4. AI 협업 및 작업 지침 (AI Handover Guidelines)
*   **코드 스타일:** 
    *   백엔드는 `backend/src/index.js`에 집중된 Monolithic 스타일을 유지하되, 로직이 비대해지면 모듈화 가능.
    *   프론트엔드는 Vanilla JS의 가독성을 중시하며 CSS 변수를 활용한 디자인 시스템 유지.
*   **작업 이력:**
    *   2026-02-21: Gemini CLI가 초기 프로젝트 분석 완료 및 `GEMINI.md` 생성.
*   **다음 AI 에이전트에게:** 
    1.  이 파일을 가장 먼저 읽고 현재 구조를 파악하세요.
    2.  `backend/src/index.js`와 `frontend/index.html`이 핵심 파일입니다.
    3.  새로운 기능을 추가할 때는 기존의 SQL 기반 슬롯 계산 로직과의 정합성을 반드시 확인하세요.

## 5. 진행 예정 사항
*   [ ] Gemini CLI를 통한 초기 기능 확장 (초벌 코딩)
*   [ ] 이후 Codex를 통한 코드 최적화 및 리팩토링
