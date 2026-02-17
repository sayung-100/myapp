# Lesson Booking MVP

Single-repo bootstrap for a private lesson (piano/yoga/etc.) web booking MVP.

Current phase: **1) Project Bootstrap only**
- Included: frontend + backend + database baseline, Docker Compose, migration/seed scripts, project spec.
- Included now: basic auth APIs (`register`, `login`, `logout`, `me`)
- Not included yet: availability business logic, booking business logic.

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

## Auth API (MVP)
- `POST /api/v1/auth/register`
  - body: `{"email":"new@example.com","password":"password123!","name":"New User","role":"STUDENT"}`
- `POST /api/v1/auth/login`
  - body: `{"email":"teacher@example.com","password":"password123!"}`
- `POST /api/v1/auth/logout` (requires `Authorization: Bearer <token>`)
- `GET /api/v1/auth/me` (requires `Authorization: Bearer <token>`)

Seed users (password: `password123!`)
- `teacher@example.com` (TEACHER)
- `student@example.com` (STUDENT)

## Notes
- Auth is implemented as JWT-based stateless access token.
- Next milestones: availability/exceptions -> booking APIs.
