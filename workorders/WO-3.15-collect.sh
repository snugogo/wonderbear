#!/usr/bin/env bash
set -u

REPO_ROOT="/opt/wonderbear"
COORD_DIR="${REPO_ROOT}/coordination"
WO_DIR="${REPO_ROOT}/workorders"
SERVER_DIR="${REPO_ROOT}/server-v7"

GROUND_TRUTH="${COORD_DIR}/GROUND-TRUTH.md"
VERIFY_TEMPLATE="${WO_DIR}/verify-template.sh"
ENV_FILE="${SERVER_DIR}/.env"

echo "============================================================"
echo "WO-3.15 collect"
echo "============================================================"

cd "${REPO_ROOT}" || exit 1

echo ""
echo "=== git status ==="
git status -s 2>/dev/null | grep -v '^??' | head -10

echo ""
echo "=== git diff stat ==="
git diff --stat HEAD 2>/dev/null

echo ""
echo "=== GROUND-TRUTH.md (first 30 lines) ==="
head -30 "${GROUND_TRUTH}" 2>/dev/null || echo "(not found)"

echo ""
echo "=== GROUND-TRUTH.md sections ==="
grep -E '^## §' "${GROUND_TRUTH}" 2>/dev/null

echo ""
echo "=== GROUND-TRUTH.md size ==="
echo "  $(wc -l < "${GROUND_TRUTH}" 2>/dev/null || echo 0) lines"

echo ""
echo "=== verify-template.sh head ==="
head -15 "${VERIFY_TEMPLATE}" 2>/dev/null || echo "(not found)"

echo ""
echo "=== verify-template.sh Luna grep section ==="
grep -A 10 'Luna' "${VERIFY_TEMPLATE}" 2>/dev/null | head -15

echo ""
echo "=== verify-template.sh spillover whitelist ==="
grep -A 3 'EXPECTED\|services/api\|stores' "${VERIFY_TEMPLATE}" 2>/dev/null | head -10

echo ""
echo "=== .env removed-field check ==="
for FIELD in GEMINI_IMAGE_MODEL STORAGE_TYPE LOCAL_STORAGE_PATH; do
    HIT=$(grep -cE "^${FIELD}=" "${ENV_FILE}" 2>/dev/null || echo 0)
    echo "  ${FIELD}: ${HIT} occurrences in .env"
done

echo ""
echo "=== .env GOOGLE_APPLICATION_CREDENTIALS dedup ==="
GAC=$(grep -cE '^GOOGLE_APPLICATION_CREDENTIALS=' "${ENV_FILE}" 2>/dev/null || echo 0)
echo "  GOOGLE_APPLICATION_CREDENTIALS: ${GAC} occurrences (expected 1)"

echo ""
echo "=== .env total fields ==="
echo "  $(grep -cE '^[A-Z]' "${ENV_FILE}" 2>/dev/null || echo 0) fields total"

echo ""
echo "=== Live src/ refs to removed fields (must all be 0) ==="
for FIELD in GEMINI_IMAGE_MODEL STORAGE_TYPE LOCAL_STORAGE_PATH; do
    HITS=$(grep -rln "process\.env\.${FIELD}\b\|process\.env\[.${FIELD}.\]" "${SERVER_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
    echo "  ${FIELD}: ${HITS} files reference"
done

echo ""
echo "=== V4 Pro migration invariants ==="
for SCRIPT in /opt/wonderbear-tools/spawn-droid.sh /opt/wonderbear-tools/orchestrator-loop.sh; do
    HIT=$(grep -c 'deepseek-v4-pro' "${SCRIPT}" 2>/dev/null || echo 0)
    OPUS=$(grep -c 'claude-opus-4-7' "${SCRIPT}" 2>/dev/null || echo 0)
    echo "  ${SCRIPT##*/}: deepseek-v4-pro=${HIT}, claude-opus-4-7=${OPUS}"
done

echo ""
echo "============================================================"
echo "End of collect"
echo "============================================================"
