#!/usr/bin/env bash
# ============================================================================
# check-keys.sh — Day 0 environment audit
#
# Loads .env and reports per-group status:
#   - infra group missing → RED, exit 1 (server cannot start)
#   - other group missing → YELLOW, exit 0 (feature will fail at use time)
#
# Uses a plain case statement instead of associative arrays for broadest
# bash compatibility (including macOS default bash 3.2).
#
# Run: bash scripts/check-keys.sh  (or `npm run check-keys`)
# ============================================================================

# Resolve script directory to find .env in project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# ANSI colors (skip if NO_COLOR set or stdout is not a tty)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; DIM=''; RESET=''
fi

# Load .env if present (safe-parse: only KEY=VALUE lines, skip comments)
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . <(grep -v '^\s*#' "$ENV_FILE" | grep -E '^\s*[A-Z_][A-Z0-9_]*=' || true)
  set +a
else
  echo "${YELLOW}⚠  No .env found at $ENV_FILE${RESET}"
  echo "   Copy .env.example to .env and fill in values."
  echo ""
fi

# Return the list of keys required for a given group.
keys_for_group() {
  case "$1" in
    infra)   echo "DATABASE_URL JWT_SECRET" ;;
    mail)    echo "RESEND_API_KEY MAIL_FROM" ;;
    ai)      echo "OPENAI_API_KEY GEMINI_API_KEY FAL_KEY" ;;
    tts)     echo "ELEVENLABS_API_KEY VOICE_ID_EN" ;;
    speech)  echo "GOOGLE_SPEECH_KEY" ;;
    stripe)  echo "STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID_MONTHLY STRIPE_PRICE_ID_YEARLY" ;;
    paypal)  echo "PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_WEBHOOK_ID" ;;
    storage) echo "R2_ACCOUNT_ID R2_ACCESS_KEY R2_SECRET_KEY R2_PUBLIC_URL" ;;
    *) echo "" ;;
  esac
}

ORDER="infra mail ai tts speech stripe paypal storage"

INFRA_MISSING=0
YELLOW_GROUPS=""

echo "WonderBear env audit"
echo "===================="

for group in $ORDER; do
  keys=$(keys_for_group "$group")
  missing=""
  for k in $keys; do
    # Indirect var lookup via eval — portable vs ${!k}
    val=$(eval "printf '%s' \"\${$k:-}\"")
    if [ -z "$val" ]; then
      missing="$missing $k"
    fi
  done
  # Trim leading space
  missing="${missing# }"

  # Pad group name to 8 chars for alignment
  padded_group=$(printf "%-8s" "$group")

  if [ -z "$missing" ]; then
    printf "  %s[%s]%s  %sOK%s\n" "$DIM" "$padded_group" "$RESET" "$GREEN" "$RESET"
  elif [ "$group" = "infra" ]; then
    printf "  %s[%s]%s  %sMISSING%s: %s\n" "$DIM" "$padded_group" "$RESET" "$RED" "$RESET" "$missing"
    INFRA_MISSING=1
  else
    printf "  %s[%s]%s  %sSKIP%s (not configured): %s\n" "$DIM" "$padded_group" "$RESET" "$YELLOW" "$RESET" "$missing"
    YELLOW_GROUPS="$YELLOW_GROUPS $group"
  fi
done

echo ""

if [ "$INFRA_MISSING" = "1" ]; then
  echo "${RED}❌ infra group incomplete — server will not start.${RESET}"
  echo "   Fix DATABASE_URL / JWT_SECRET in .env and re-run."
  exit 1
fi

YELLOW_GROUPS="${YELLOW_GROUPS# }"
if [ -n "$YELLOW_GROUPS" ]; then
  count=$(echo "$YELLOW_GROUPS" | wc -w | tr -d ' ')
  echo "${YELLOW}⚠  ${count} feature group(s) not configured: ${YELLOW_GROUPS}${RESET}"
  echo "   Server will boot, but these features will fail at first use."
  echo "   OK for early batches; fill in before using the related feature."
fi

echo "${GREEN}✅ infra group OK — server can start.${RESET}"
exit 0
