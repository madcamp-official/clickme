#!/usr/bin/env bash
set -Eeuo pipefail

# SUPABASE_URL and SUPABASE_SECRET_KEY are supplied by the systemd
# EnvironmentFile. Never pass them as command-line arguments or print them.
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY is required}"

[[ "$SUPABASE_URL" == https://* && "$SUPABASE_URL" != *$'\n'* ]] || {
  printf 'ERROR: SUPABASE_URL must be a single HTTPS URL\n' >&2
  exit 2
}
[[ "$SUPABASE_SECRET_KEY" =~ ^[A-Za-z0-9._-]{20,}$ ]] || {
  printf 'ERROR: SUPABASE_SECRET_KEY has an invalid format\n' >&2
  exit 2
}

cutoff="$(date -u --date='48 hours ago' '+%Y-%m-%dT%H:%M:%SZ')"
payload="$(printf '{"p_before":"%s"}' "$cutoff")"

curl --silent --show-error --fail \
  --connect-timeout 5 --max-time 10 \
  --retry 2 --retry-delay 1 --retry-all-errors \
  --header 'content-type: application/json' \
  --data "$payload" \
  --output /dev/null \
  --config - \
  "${SUPABASE_URL%/}/rest/v1/rpc/cleanup_operational_data" <<CURL_CONFIG
header = "apikey: ${SUPABASE_SECRET_KEY}"
header = "authorization: Bearer ${SUPABASE_SECRET_KEY}"
CURL_CONFIG

printf 'Operational rate buckets older than %s were cleaned.\n' "$cutoff"
