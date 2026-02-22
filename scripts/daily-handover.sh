#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TZ_NAME="${TZ_NAME:-Asia/Seoul}"
DATE_STR="${1:-$(TZ="$TZ_NAME" date +%F)}"
NOW_STR="$(TZ="$TZ_NAME" date '+%Y-%m-%d %H:%M:%S %z')"
TEMPLATE_FILE="$ROOT_DIR/docs/handover-template.md"
OUT_FILE="$ROOT_DIR/docs/handover-$DATE_STR.md"

mkdir -p "$ROOT_DIR/docs"

if [[ ! -f "$OUT_FILE" ]]; then
  if [[ -f "$TEMPLATE_FILE" ]]; then
    sed "s/{{DATE}}/$DATE_STR/g" "$TEMPLATE_FILE" > "$OUT_FILE"
  else
    {
      echo "# 인수인계 노트 ($DATE_STR)"
      echo
      echo "## 오늘 완료된 작업"
      echo "- "
    } > "$OUT_FILE"
  fi
fi

{
  echo
  echo "## 자동 스냅샷 ($NOW_STR)"
  echo
  echo "### 브랜치/작업 상태"
  echo '```bash'
  git -C "$ROOT_DIR" status --short --branch
  echo '```'
  echo
  echo "### 최근 커밋 (5개)"
  echo '```bash'
  git -C "$ROOT_DIR" log --oneline -n 5
  echo '```'
  echo
  echo "### 워킹트리 변경 통계"
  echo '```bash'
  git -C "$ROOT_DIR" diff --stat || true
  echo '```'
} >> "$OUT_FILE"

if [[ "${RUN_SMOKE:-0}" == "1" ]]; then
  {
    echo
    echo "### 스모크 테스트 결과"
    echo '```bash'
    if bash "$ROOT_DIR/scripts/smoke-test-api.sh"; then
      echo "[PASS] smoke-test-api.sh"
    else
      echo "[FAIL] smoke-test-api.sh"
    fi
    echo '```'
  } >> "$OUT_FILE"
fi

echo "updated: $OUT_FILE"
