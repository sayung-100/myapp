# Lesson Booking MVP

Single-repo bootstrap for a private lesson (piano/yoga/etc.) web booking MVP.

Current phase: **1) Project Bootstrap only**
- Included: frontend + backend + database baseline, Docker Compose, migration/seed scripts, project spec.
- Not included yet: auth, availability business logic, booking business logic.

## Structure
- `docs/lesson-booking-mvp-spec.md`: product/API/data spec (slot-based policy aligned)
- `frontend/`: static UI + `/api` reverse proxy
- `backend/`: Node.js (Express) service + migration/seed runners
- `db/`: SQL migrations and seeds

## Prerequisites
- Docker + Docker Compose

## 1) Environment file
```bash
cp .env.example .env
```

## 2) Run all services
```bash
docker compose up --build -d
```

## 3) Verify
- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:4000/health`
- Frontend proxy health: `http://localhost:8080/api/health`

## 4) Migration / Seed
```bash
docker compose run --rm backend npm run migrate
docker compose run --rm backend npm run seed
```

## 5) Stop
```bash
docker compose down
```

## Notes
- This repository intentionally contains only bootstrap-level implementation.
- Next milestones: auth -> availability/exceptions -> booking APIs.
