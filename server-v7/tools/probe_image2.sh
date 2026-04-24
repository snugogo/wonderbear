#!/usr/bin/env bash
# ============================================================================
# probe_image2.sh - Phase A: probe availability of gpt-image-2 / 1.5 / 1
# ============================================================================
# Runs 4 OpenAI image generation calls with the SAME benign prompt and the
# SAME size (1536x1024), differing only by (model, quality) pair.
#
# Outputs PNGs + raw JSON + a summary table to:
#   tools/reports/probe_phase_a/
#
# Expected env: OPENAI_API_KEY (read from server-v7/.env)
# ============================================================================

set -u

cd "$(dirname "$0")/.."     # go to server-v7 root
set -a; source .env; set +a

OUT_DIR="tools/reports/probe_phase_a"
mkdir -p "$OUT_DIR"

PROMPT="a cute teddy bear waving in a sunny watercolor meadow, soft children's book illustration"
SIZE="1536x1024"

# (file-label, model, quality)
CASES=(
  "01-image2-high|gpt-image-2|high"
  "02-image2-medium|gpt-image-2|medium"
  "03-image1.5-high|gpt-image-1.5|high"
  "04-image1-medium|gpt-image-1|medium"
)

SUMMARY="$OUT_DIR/_summary.tsv"
echo -e "file\tmodel\tquality\thttp\tbytes\tduration_s\terror_excerpt" > "$SUMMARY"

for entry in "${CASES[@]}"; do
  IFS='|' read -r LABEL MODEL QUALITY <<< "$entry"
  echo ""
  echo "=== $LABEL :: model=$MODEL quality=$QUALITY ==="

  JSON_PATH="$OUT_DIR/${LABEL}.json"
  PNG_PATH="$OUT_DIR/${LABEL}.png"
  ERR_PATH="$OUT_DIR/${LABEL}.err.txt"

  # Build JSON payload via python3 (jq not installed on this VPS)
  PAYLOAD=$(MODEL="$MODEL" PROMPT="$PROMPT" SIZE="$SIZE" QUALITY="$QUALITY" python3 -c '
import os, json
print(json.dumps({
  "model":   os.environ["MODEL"],
  "prompt":  os.environ["PROMPT"],
  "size":    os.environ["SIZE"],
  "quality": os.environ["QUALITY"],
  "n": 1,
}))')

  START=$(date +%s)
  HTTP=$(curl -sS -o "$JSON_PATH" -w "%{http_code}" -X POST \
    https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" )
  END=$(date +%s)
  DUR=$((END-START))

  BYTES=0
  ERR_EXCERPT=""

  if [ "$HTTP" = "200" ]; then
    JSON_PATH_ENV="$JSON_PATH" PNG_PATH_ENV="$PNG_PATH" python3 - <<'PYEOF'
import os, json, base64, urllib.request, sys
j = os.environ["JSON_PATH_ENV"]
p = os.environ["PNG_PATH_ENV"]
d = json.load(open(j))
try:
    entry = d["data"][0]
except Exception:
    sys.exit(2)
if entry.get("b64_json"):
    open(p, "wb").write(base64.b64decode(entry["b64_json"]))
elif entry.get("url"):
    urllib.request.urlretrieve(entry["url"], p)
else:
    sys.exit(3)
PYEOF
    RC=$?
    if [ "$RC" = "0" ] && [ -s "$PNG_PATH" ]; then
      BYTES=$(stat -c%s "$PNG_PATH" 2>/dev/null || wc -c < "$PNG_PATH")
      echo "  OK  HTTP 200  bytes=$BYTES  ${DUR}s  -> $PNG_PATH"
    else
      ERR_EXCERPT="200 but no image payload (rc=$RC)"
      echo "  ERR HTTP 200 but no image payload (rc=$RC)"
    fi
  else
    ERR_EXCERPT=$(head -c 400 "$JSON_PATH" | tr '\n\t' '  ')
    cp "$JSON_PATH" "$ERR_PATH"
    echo "  ERR HTTP $HTTP  ${DUR}s"
    echo "      $ERR_EXCERPT"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$LABEL" "$MODEL" "$QUALITY" "$HTTP" "$BYTES" "$DUR" "$ERR_EXCERPT" >> "$SUMMARY"
done

echo ""
echo "=== summary ==="
column -t -s $'\t' < "$SUMMARY"
echo ""
echo "artifacts in: $OUT_DIR"
