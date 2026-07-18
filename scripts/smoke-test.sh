#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-https://clickme.madcamp-kaist.org}"
MODE="${2:-public}"
PUBLIC_HOST="${CLICKME_PUBLIC_HOST:-clickme.madcamp-kaist.org}"
READY_URL="${CLICKME_READY_URL:-http://127.0.0.1:3001/api/ready}"

if [[ "$BASE_URL" != http://* && "$BASE_URL" != https://* ]]; then
  printf 'ERROR: base URL must start with http:// or https://\n' >&2
  exit 2
fi

if [[ "$MODE" != "public" && "$MODE" != "internal" ]]; then
  printf 'ERROR: mode must be public or internal\n' >&2
  exit 2
fi

for command_name in curl node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'ERROR: required command is missing: %s\n' "$command_name" >&2
    exit 2
  fi
done

BASE_URL="${BASE_URL%/}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

CURL_SCOPE_ARGS=()
if [[ "$MODE" == "internal" ]]; then
  # The loopback Nginx listener rejects every unexpected Host.
  CURL_SCOPE_ARGS+=(--header "Host: ${PUBLIC_HOST}")
fi

log() {
  printf '[smoke] %s\n' "$*"
}

request() {
  local method="$1"
  local path="$2"
  local output="$3"
  local headers="$4"
  shift 4

  curl --silent --show-error \
    --connect-timeout 8 --max-time 20 \
    --request "$method" \
    --dump-header "$headers" --output "$output" \
    --write-out '%{http_code}' \
    "${CURL_SCOPE_ARGS[@]}" "$@" "${BASE_URL}${path}"
}

expect_status() {
  local actual="$1"
  local expected="$2"
  local description="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'ERROR: %s returned HTTP %s instead of %s\n' \
      "$description" "$actual" "$expected" >&2
    exit 1
  fi
}

assert_json() {
  local file="$1"
  local expression="$2"
  local description="$3"

  # The single-quoted program must expand its variables inside Node, not Bash.
  # shellcheck disable=SC2016
  node -e '
    const fs = require("node:fs");
    const [file, expression, description] = process.argv.slice(1);
    let value;
    try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { console.error(`ERROR: ${description}: response is not valid JSON`); process.exit(1); }
    const predicate = Function("value", `return Boolean(${expression})`);
    if (!predicate(value)) { console.error(`ERROR: ${description}: unexpected response structure`); process.exit(1); }
  ' "$file" "$expression" "$description"
}

assert_header() {
  local headers="$1"
  local pattern="$2"
  local description="$3"
  if ! tr -d '\r' < "$headers" | grep -Eiq "$pattern"; then
    printf 'ERROR: missing or invalid %s header\n' "$description" >&2
    exit 1
  fi
}

log "checking home page"
status="$(request GET / "$WORK_DIR/home.html" "$WORK_DIR/home.headers")"
expect_status "$status" 200 "home page"
grep -q '찍먹' "$WORK_DIR/home.html" || {
  printf 'ERROR: home page does not contain 찍먹\n' >&2
  exit 1
}
grep -q '부먹' "$WORK_DIR/home.html" || {
  printf 'ERROR: home page does not contain 부먹\n' >&2
  exit 1
}

for required_header in \
  content-security-policy \
  referrer-policy \
  x-content-type-options \
  x-frame-options \
  permissions-policy; do
  assert_header "$WORK_DIR/home.headers" "^${required_header}:" "$required_header"
done

log "checking public liveness (no database details)"
status="$(request GET /api/health "$WORK_DIR/health.json" "$WORK_DIR/health.headers")"
expect_status "$status" 200 "health endpoint"
assert_json "$WORK_DIR/health.json" \
  'value?.status === "ok" && !("database" in value)' \
  'public liveness endpoint'

log "checking public results contract"
status="$(request GET /api/results "$WORK_DIR/results.json" "$WORK_DIR/results.headers")"
expect_status "$status" 200 "results endpoint"
assert_json "$WORK_DIR/results.json" \
  'Number.isInteger(value?.counts?.dip) && Number.isInteger(value?.counts?.pour) && Number.isInteger(value?.counts?.total) && typeof value?.percentages?.dip === "number" && typeof value?.percentages?.pour === "number" && ["scheduled", "active", "protected", "read_only", "ended"].includes(value?.campaign?.status) && !("userChoice" in value)' \
  'public results endpoint'
assert_header "$WORK_DIR/results.headers" '^x-clickme-cache:[[:space:]]*(MISS|HIT|STALE|UPDATING|REVALIDATED|EXPIRED|BYPASS)$' 'X-Clickme-Cache'
if tr -d '\r' < "$WORK_DIR/results.headers" | grep -Eiq '^set-cookie:'; then
  printf 'ERROR: public results response must not set a visitor cookie\n' >&2
  exit 1
fi

log "checking retired comments contract"
status="$(request GET /api/comments "$WORK_DIR/comments-get.json" "$WORK_DIR/comments-get.headers")"
expect_status "$status" 410 "GET comments endpoint"
assert_json "$WORK_DIR/comments-get.json" \
  'value?.code === "COMMENTS_DISABLED"' \
  'retired comments endpoint'
status="$(request POST /api/comments "$WORK_DIR/comments-post.json" "$WORK_DIR/comments-post.headers" \
  --header 'content-type: application/json' --data '{}')"
expect_status "$status" 410 "POST comments endpoint"

log "checking private readiness boundary"
status="$(request GET /api/ready "$WORK_DIR/public-ready.json" "$WORK_DIR/public-ready.headers")"
expect_status "$status" 404 "public readiness endpoint"

if [[ "$MODE" == "internal" ]]; then
  ready_status="$(curl --silent --show-error \
    --connect-timeout 3 --max-time 10 \
    --output "$WORK_DIR/ready.json" --write-out '%{http_code}' \
    "$READY_URL")"
  expect_status "$ready_status" 200 "private readiness endpoint"
  assert_json "$WORK_DIR/ready.json" \
    'value?.status === "ready" && value?.database === "ok"' \
    'private readiness endpoint'
fi

log "checking edge-only Easter egg redirect"
status="$(request GET /api/next "$WORK_DIR/next.txt" "$WORK_DIR/next.headers")"
expect_status "$status" 302 "Easter egg redirect"
assert_header "$WORK_DIR/next.headers" '^location:[[:space:]]*https://seojiny\.com/?[[:space:]]*$' 'redirect Location'
assert_header "$WORK_DIR/next.headers" '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$' 'redirect Referrer-Policy'

log "checking non-mutating security failures"
status="$(request POST /api/session "$WORK_DIR/session-no-origin.json" "$WORK_DIR/session-no-origin.headers" \
  --header 'content-type: application/json' --data '{}')"
expect_status "$status" 403 "session request without Origin"

status="$(request POST /api/vote "$WORK_DIR/vote-no-origin.json" "$WORK_DIR/vote-no-origin.headers" \
  --header 'content-type: application/json' --data '{"choice":"invalid-smoke-value"}')"
expect_status "$status" 403 "vote request without Origin"

status="$(request POST /api/vote "$WORK_DIR/vote-wrong-content-type.json" "$WORK_DIR/vote-wrong-content-type.headers" \
  --header "Origin: https://${PUBLIC_HOST}" \
  --header 'Sec-Fetch-Site: same-origin' \
  --header 'content-type: text/plain' --data '{}')"
expect_status "$status" 415 "vote request with wrong Content-Type"

status="$(request PUT /api/results "$WORK_DIR/results-put.json" "$WORK_DIR/results-put.headers")"
expect_status "$status" 405 "unsupported results method"

status="$(request GET /r/not-a-valid-token "$WORK_DIR/bad-token.json" "$WORK_DIR/bad-token.headers")"
expect_status "$status" 404 "malformed referral token"

if [[ "$MODE" == "internal" ]]; then
  log "checking unknown Host rejection"
  set +e
  bad_host_status="$(curl --silent --show-error \
    --connect-timeout 3 --max-time 5 \
    --header 'Host: invalid.example' \
    --output /dev/null --write-out '%{http_code}' \
    "${BASE_URL}/" 2>/dev/null)"
  bad_host_curl_status=$?
  set -e
  if [[ "$bad_host_status" != "000" || "$bad_host_curl_status" -eq 0 ]]; then
    printf 'ERROR: unknown Host was not rejected with an empty connection close\n' >&2
    exit 1
  fi
fi

if [[ "$MODE" == "public" ]]; then
  [[ "$BASE_URL" == https://* ]] || {
    printf 'ERROR: public smoke test requires an https URL\n' >&2
    exit 1
  }

  assert_header "$WORK_DIR/home.headers" \
    '^strict-transport-security:[[:space:]]*.*max-age=' \
    'Strict-Transport-Security'

  log "checking HTTP to HTTPS redirect"
  http_url="http://${BASE_URL#https://}"
  redirect_status="$(curl --silent --show-error \
    --connect-timeout 8 --max-time 20 \
    --dump-header "$WORK_DIR/redirect.headers" \
    --output /dev/null --write-out '%{http_code}' \
    "$http_url/")"
  [[ "$redirect_status" =~ ^30[1278]$ ]] || {
    printf 'ERROR: HTTP endpoint returned %s instead of a redirect\n' "$redirect_status" >&2
    exit 1
  }
  assert_header "$WORK_DIR/redirect.headers" '^location:[[:space:]]*https://' 'HTTPS redirect Location'

  public_host="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$BASE_URL")"
  for private_port in 3000 3001; do
    log "checking that port ${private_port} is not publicly reachable"
    if curl --noproxy '*' --silent --show-error \
      --connect-timeout 3 --max-time 5 --output /dev/null \
      "http://${public_host}:${private_port}/" 2>/dev/null; then
      printf 'ERROR: public host port %s is directly reachable\n' "$private_port" >&2
      exit 1
    fi
  done
fi

log "all read-only checks passed"
