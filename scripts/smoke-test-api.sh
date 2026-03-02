#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"

extract_token() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); if(!j.token){process.exit(1)}; process.stdout.write(j.token);});"
}

extract_json_path() {
  local expr="$1"
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); const v=($expr); if(v===undefined||v===null){process.exit(1)}; process.stdout.write(String(v));});"
}

echo "[1/8] login teacher/student"
TEACHER_TOKEN=$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher@example.com","password":"password123!"}' | extract_token)
STUDENT_TOKEN=$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"student@example.com","password":"password123!"}' | extract_token)
echo "[OK] login complete"

echo "[2/8] compute tomorrow date (Asia/Seoul)"
TOMORROW_LOCAL=$(TZ=Asia/Seoul node -e "const n=new Date();const t=new Date(n.getTime()+24*60*60*1000);const y=t.getFullYear();const m=String(t.getMonth()+1).padStart(2,'0');const d=String(t.getDate()).padStart(2,'0');process.stdout.write(y+'-'+m+'-'+d);")
WEEKDAY_LOCAL=$(TZ=Asia/Seoul node -e "const n=new Date();const t=new Date(n.getTime()+24*60*60*1000);process.stdout.write(String(t.getDay()));")
echo "[OK] tomorrow=$TOMORROW_LOCAL weekday=$WEEKDAY_LOCAL"

echo "[3/8] ensure teacher availability"
AVAIL_RES=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/v1/teachers/me/availability" \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"weekday\":$WEEKDAY_LOCAL,\"start_time_local\":\"10:00\",\"end_time_local\":\"12:00\",\"is_active\":true}")
AVAIL_CODE=${AVAIL_RES##*$'\n'}
if [[ "$AVAIL_CODE" != "201" && "$AVAIL_CODE" != "409" ]]; then
  echo "[FAIL] availability ensure failed: $AVAIL_RES"
  exit 1
fi
echo "[OK] availability ensured (status=$AVAIL_CODE)"

echo "[4/8] fetch teachers"
TEACHERS_JSON=$(curl -sS "$BASE_URL/api/v1/teachers" -H "Authorization: Bearer $STUDENT_TOKEN")
TEACHER_ID=$(printf '%s' "$TEACHERS_JSON" | extract_json_path "(j.items||[])[0]?.id")
echo "[OK] teacher_id=$TEACHER_ID"

echo "[5/8] fetch slots"
FROM="${TOMORROW_LOCAL}T00:00:00+09:00"
TO="${TOMORROW_LOCAL}T23:59:00+09:00"
SLOTS_JSON=$(curl -sS -G "$BASE_URL/api/v1/teachers/$TEACHER_ID/slots" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  --data-urlencode "from=$FROM" \
  --data-urlencode "to=$TO")
SLOT_START=$(printf '%s' "$SLOTS_JSON" | extract_json_path "(j.items||[]).find(x=>x.is_available)?.start_at")
SLOT_DURATION=$(printf '%s' "$SLOTS_JSON" | extract_json_path "(j.items||[]).find(x=>x.is_available)?.duration_min ?? j.duration_min")
echo "[OK] slot_start=$SLOT_START"

echo "[6/8] create booking"
BOOKING_RES=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/v1/bookings" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"teacher_user_id\":$TEACHER_ID,\"start_at\":\"$SLOT_START\",\"duration_min\":$SLOT_DURATION}")
BOOKING_BODY=${BOOKING_RES%$'\n'*}
BOOKING_CODE=${BOOKING_RES##*$'\n'}
if [[ "$BOOKING_CODE" != "201" ]]; then
  echo "[FAIL] booking create failed: $BOOKING_RES"
  exit 1
fi
BOOKING_ID=$(printf '%s' "$BOOKING_BODY" | extract_json_path "j.item?.id")
echo "[OK] booking_id=$BOOKING_ID"

echo "[7/8] cancel booking"
CANCEL_RES=$(curl -sS -w $'\n%{http_code}' -X POST "$BASE_URL/api/v1/bookings/$BOOKING_ID/cancel" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"reason":"smoke test"}')
CANCEL_BODY=${CANCEL_RES%$'\n'*}
CANCEL_CODE=${CANCEL_RES##*$'\n'}
if [[ "$CANCEL_CODE" != "200" ]]; then
  echo "[FAIL] booking cancel failed: $CANCEL_RES"
  exit 1
fi
CANCEL_STATUS=$(printf '%s' "$CANCEL_BODY" | extract_json_path "j.item?.status")
echo "[OK] cancel_status=$CANCEL_STATUS"

echo "[8/8] verify teacher bookings"
TEACHER_BOOKINGS=$(curl -sS "$BASE_URL/api/v1/teachers/me/bookings" -H "Authorization: Bearer $TEACHER_TOKEN")
printf '%s' "$TEACHER_BOOKINGS" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const id=process.argv[1];const found=(j.items||[]).some(x=>String(x.id)===id);if(!found){process.exit(1);}process.stdout.write('ok');});" "$BOOKING_ID" >/dev/null
echo "[OK] teacher bookings includes booking_id=$BOOKING_ID"

echo "SMOKE_TEST_PASS booking_id=$BOOKING_ID slot_start=$SLOT_START"
