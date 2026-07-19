#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PUBLIC_URL="https://clickme.madcamp-kaist.org"

SSH_HOST="${KAIST_SSH_HOST:-${KAIST_DEPLOY_HOST:-kaist-clickme}}"
SSH_USER="${KAIST_SSH_USER:-${KAIST_DEPLOY_USER:-}}"
SSH_PORT="${KAIST_SSH_PORT:-${KAIST_DEPLOY_PORT:-22}}"
APP_ROOT="${KAIST_APP_ROOT:-/srv/clickme}"
REQUESTED_METHOD="${KAIST_DEPLOY_METHOD:-docker}"
RELEASES_TO_KEEP="${KAIST_RELEASES_TO_KEEP:-5}"
ENV_FILE="${APP_ROOT}/shared/clickme.env"

ACTIVE=0
ROLLING_BACK=0
SELECTED_METHOD=""
NODE_SERVICE_CONTROL=""
NODE_RUNTIME_BIN=""
PREVIOUS_RELEASE=""
PREVIOUS_METHOD=""
RELEASE_ID=""
RELEASE_PATH=""

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy] WARNING: %s\n' "$*" >&2
}

validate_inputs() {
  [[ "$SSH_HOST" =~ ^[A-Za-z0-9._-]+$ ]] || {
    printf 'ERROR: KAIST_SSH_HOST must be a host name or an SSH config alias.\n' >&2
    exit 2
  }
  [[ -z "$SSH_USER" || "$SSH_USER" =~ ^[A-Za-z0-9._-]+$ ]] || {
    printf 'ERROR: KAIST_SSH_USER contains unsupported characters.\n' >&2
    exit 2
  }
  if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] \
    || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    printf 'ERROR: KAIST_SSH_PORT must be between 1 and 65535.\n' >&2
    exit 2
  fi
  [[ "$APP_ROOT" == /* && "$APP_ROOT" != "/" \
    && "$APP_ROOT" =~ ^/[A-Za-z0-9._/-]+$ \
    && "$APP_ROOT" != *"/../"* && "$APP_ROOT" != */.. ]] || {
      printf 'ERROR: KAIST_APP_ROOT must be a safe absolute path.\n' >&2
      exit 2
    }
  [[ "$REQUESTED_METHOD" == "docker" || "$REQUESTED_METHOD" == "node" ]] || {
    printf 'ERROR: KAIST_DEPLOY_METHOD must be docker or node.\n' >&2
    exit 2
  }
  if [[ ! "$RELEASES_TO_KEEP" =~ ^[0-9]+$ ]] \
    || (( RELEASES_TO_KEEP < 2 || RELEASES_TO_KEEP > 50 )); then
    printf 'ERROR: KAIST_RELEASES_TO_KEEP must be between 2 and 50.\n' >&2
    exit 2
  fi
}

validate_inputs

SSH_TARGET="$SSH_HOST"
if [[ -n "$SSH_USER" ]]; then
  SSH_TARGET="${SSH_USER}@${SSH_HOST}"
fi

SSH_ARGS=(
  -o BatchMode=yes
  -o ConnectTimeout=8
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
  -p "$SSH_PORT"
)
RSYNC_SHELL="ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -p ${SSH_PORT}"

run_ssh() {
  # Arguments are intentionally passed for interpretation by the remote shell.
  # shellcheck disable=SC2029
  ssh "${SSH_ARGS[@]}" "$SSH_TARGET" "$@"
}

require_local_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'ERROR: required local command is missing: %s\n' "$command_name" >&2
    exit 2
  }
}

atomic_remote_link() {
  local target="$1"
  run_ssh bash -s -- "$APP_ROOT" "$target" <<'REMOTE'
set -Eeuo pipefail
root="$1"
target="$2"

[[ "$target" == "$root/releases/"* && -d "$target" ]] || {
  printf 'ERROR: refusing to link an invalid release path\n' >&2
  exit 1
}

temporary_link="$root/.current.$$.tmp"
ln -s "$target" "$temporary_link"
mv -Tf "$temporary_link" "$root/current"
REMOTE
}

restart_node_service() {
  local action="$1"
  run_ssh bash -s -- "$NODE_SERVICE_CONTROL" "$action" <<'REMOTE'
set -Eeuo pipefail
control="$1"
action="$2"

case "$control" in
  direct) systemctl "$action" clickme.service ;;
  sudo) sudo -n systemctl "$action" clickme.service ;;
  user) systemctl --user "$action" clickme.service ;;
  *) printf 'ERROR: unsupported service control mode\n' >&2; exit 1 ;;
esac
REMOTE
}

wait_for_internal_health() {
  run_ssh bash -s <<'REMOTE'
set -Eeuo pipefail

for attempt in $(seq 1 45); do
  if curl --silent --show-error --fail \
    --connect-timeout 2 --max-time 5 --output /dev/null \
    http://127.0.0.1:3001/api/ready; then
    exit 0
  fi
  sleep 2
done

printf 'ERROR: private readiness did not pass within 90 seconds\n' >&2
exit 1
REMOTE
}

run_internal_smoke() {
  run_ssh bash -s <<'REMOTE'
set -Eeuo pipefail

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
base_url="http://127.0.0.1:3000"
host_header="Host: clickme.madcamp-kaist.org"

curl --silent --show-error --fail --connect-timeout 3 --max-time 15 \
  --header "$host_header" --output "$work_dir/home" "$base_url/"
grep -q '찍먹' "$work_dir/home"
grep -q '부먹' "$work_dir/home"

curl --silent --show-error --fail --connect-timeout 3 --max-time 15 \
  --header "$host_header" --output "$work_dir/health" "$base_url/api/health"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$work_dir/health"
if grep -Eq '"database"[[:space:]]*:' "$work_dir/health"; then
  printf 'ERROR: public liveness exposes database readiness\n' >&2
  exit 1
fi

curl --silent --show-error --fail --connect-timeout 3 --max-time 15 \
  --header "$host_header" --dump-header "$work_dir/results.headers" \
  --output "$work_dir/results" "$base_url/api/results"
grep -Eq '"counts"[[:space:]]*:' "$work_dir/results"
grep -Eq '"campaign"[[:space:]]*:' "$work_dir/results"
if grep -Eq '"userChoice"[[:space:]]*:' "$work_dir/results"; then
  printf 'ERROR: public results exposes visitor-specific data\n' >&2
  exit 1
fi
tr -d '\r' < "$work_dir/results.headers" | grep -Eiq '^x-clickme-cache:'
if tr -d '\r' < "$work_dir/results.headers" | grep -Eiq '^set-cookie:'; then
  printf 'ERROR: public results sets a cookie\n' >&2
  exit 1
fi

comment_status="$(curl --silent --show-error --connect-timeout 3 --max-time 15 \
  --header "$host_header" --output "$work_dir/comments" --write-out '%{http_code}' \
  "$base_url/api/comments")"
[[ "$comment_status" == "200" ]]
grep -Eq '"comments"[[:space:]]*:[[:space:]]*\[' "$work_dir/comments"

vote_status="$(curl --silent --show-error --connect-timeout 3 --max-time 15 \
  --header "$host_header" \
  --header 'content-type: application/json' \
  --data '{"choice":"invalid-smoke-value"}' \
  --output "$work_dir/invalid-vote" --write-out '%{http_code}' \
  "$base_url/api/vote")"
[[ "$vote_status" == "403" ]]

ready_status="$(curl --silent --show-error --connect-timeout 3 --max-time 15 \
  --output "$work_dir/public-ready" --write-out '%{http_code}' \
  --header "$host_header" "$base_url/api/ready")"
[[ "$ready_status" == "404" ]]

curl --silent --show-error --fail --connect-timeout 3 --max-time 15 \
  --output "$work_dir/ready" http://127.0.0.1:3001/api/ready
grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' "$work_dir/ready"
REMOTE
}

capture_failure_logs() {
  warn "capturing a bounded failure log summary"

  if [[ "$SELECTED_METHOD" == "docker" && -n "$RELEASE_PATH" && -n "$RELEASE_ID" ]]; then
    run_ssh bash -s -- "$RELEASE_PATH" "$ENV_FILE" "$RELEASE_ID" <<'REMOTE'
set +e
release="$1"
env_file="$2"
release_id="$3"
export KAIST_APP_ENV_FILE="$env_file"
export CLICKME_RELEASE="$release_id"
docker compose -p clickme -f "$release/compose.yaml" ps 2>&1
docker compose -p clickme -f "$release/compose.yaml" logs --no-color --tail=100 2>&1
exit 0
REMOTE
    return
  fi

  if [[ "$SELECTED_METHOD" == "node" && -n "$NODE_SERVICE_CONTROL" ]]; then
    run_ssh bash -s -- "$NODE_SERVICE_CONTROL" <<'REMOTE'
set +e
control="$1"
case "$control" in
  direct)
    systemctl status clickme.service --no-pager 2>&1
    journalctl -u clickme.service -n 100 --no-pager 2>&1
    ;;
  sudo)
    sudo -n systemctl status clickme.service --no-pager 2>&1
    sudo -n journalctl -u clickme.service -n 100 --no-pager 2>&1
    ;;
  user)
    systemctl --user status clickme.service --no-pager 2>&1
    journalctl --user -u clickme.service -n 100 --no-pager 2>&1
    ;;
esac
exit 0
REMOTE
  fi
}

rollback() {
  local original_status="${1:-1}"
  local rollback_status=0

  if (( ACTIVE == 0 || ROLLING_BACK == 1 )); then
    return "$original_status"
  fi

  ROLLING_BACK=1
  ACTIVE=0
  trap - ERR
  set +e

  warn "deployment failed after activation; restoring the previous release"

  if [[ "$SELECTED_METHOD" == "docker" ]]; then
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      previous_id="$(basename -- "$PREVIOUS_RELEASE")"
      run_ssh bash -s -- "$PREVIOUS_RELEASE" "$ENV_FILE" "$previous_id" <<'REMOTE'
set -Eeuo pipefail
release="$1"
env_file="$2"
release_id="$3"
export KAIST_APP_ENV_FILE="$env_file"
export CLICKME_RELEASE="$release_id"
docker compose -p clickme -f "$release/compose.yaml" up -d --no-build --remove-orphans
REMOTE
      rollback_status=$?
      if (( rollback_status == 0 )); then
        atomic_remote_link "$PREVIOUS_RELEASE"
        rollback_status=$?
      fi
    else
      run_ssh bash -s -- "$RELEASE_PATH" "$ENV_FILE" "$RELEASE_ID" <<'REMOTE'
set -Eeuo pipefail
release="$1"
env_file="$2"
release_id="$3"
export KAIST_APP_ENV_FILE="$env_file"
export CLICKME_RELEASE="$release_id"
docker compose -p clickme -f "$release/compose.yaml" down --remove-orphans
REMOTE
      rollback_status=$?
    fi
  else
    if [[ -n "$PREVIOUS_RELEASE" ]]; then
      atomic_remote_link "$PREVIOUS_RELEASE"
      rollback_status=$?
      if (( rollback_status == 0 )); then
        restart_node_service restart
        rollback_status=$?
      fi
    else
      restart_node_service stop
      rollback_status=$?
      run_ssh bash -s -- "$APP_ROOT" "$RELEASE_PATH" <<'REMOTE'
set -Eeuo pipefail
root="$1"
failed_release="$2"
if [[ -L "$root/current" && "$(readlink -f "$root/current")" == "$failed_release" ]]; then
  rm -- "$root/current"
fi
REMOTE
    fi
  fi

  if (( rollback_status == 0 )) && [[ -n "$PREVIOUS_RELEASE" ]]; then
    wait_for_internal_health
    rollback_status=$?
  fi

  if (( rollback_status == 0 )); then
    warn "rollback completed: ${PREVIOUS_RELEASE:-no previous managed release; new process stopped}"
  else
    warn "automatic rollback failed; inspect the service immediately"
  fi

  set -e
  return "$original_status"
}

on_error() {
  local status="$1"
  local line="$2"
  trap - ERR
  printf 'ERROR: deployment command failed near line %s (exit %s)\n' "$line" "$status" >&2
  if (( ACTIVE == 1 )); then
    capture_failure_logs || true
  fi
  rollback "$status" || true
  exit "$status"
}

trap 'on_error "$?" "$LINENO"' ERR

ensure_local_node_runtime() {
  local candidate node_bin

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  # A KAIST fallback host can keep Node outside the global PATH so unrelated
  # services are untouched. Make that runtime available only to this script.
  for candidate in /opt/clickme-node-v*/bin/node; do
    [[ -x "$candidate" ]] || continue
    node_bin="$(dirname "$(readlink -f "$candidate")")"
    if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
      export PATH="$node_bin:$PATH"
      return 0
    fi
  done

  return 1
}

ensure_local_node_runtime || {
  printf 'ERROR: local validation requires Node.js and npm.\n' >&2
  exit 2
}

for command_name in git npm ssh rsync curl node; do
  require_local_command "$command_name"
done

cd "$PROJECT_ROOT"

if [[ "${KAIST_DB_MIGRATION_CONFIRMED:-}" != "1" ]]; then
  printf '%s\n' \
    'ERROR: verify the production Supabase migration, then run with KAIST_DB_MIGRATION_CONFIRMED=1.' >&2
  exit 1
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'ERROR: deployment requires a Git working tree.\n' >&2
  exit 1
}

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  printf 'ERROR: commit or remove local changes before deployment.\n' >&2
  exit 1
fi

sensitive_paths=()
while IFS= read -r tracked_path; do
  case "$tracked_path" in
    .env.example) ;;
    .env|.env.*|*.pem|*.key|*id_rsa*|*id_ed25519*)
      sensitive_paths+=("$tracked_path")
      ;;
  esac
done < <(git ls-files)

if (( ${#sensitive_paths[@]} > 0 )); then
  printf 'ERROR: secret-like files are tracked by Git:\n' >&2
  printf '  %s\n' "${sensitive_paths[@]}" >&2
  exit 1
fi

FULL_SHA="$(git rev-parse --verify HEAD)"
SHORT_SHA="$(git rev-parse --short=12 HEAD)"
RELEASE_ID="${SHORT_SHA}-$(date -u +%Y%m%d%H%M%S)"
RELEASE_PATH="${APP_ROOT}/releases/${RELEASE_ID}"

log "commit: $FULL_SHA"
log "running clean local install and validation"
export NEXT_TELEMETRY_DISABLED=1
npm ci
npm run check

log "checking SSH connectivity"
run_ssh true

log "read-only KAIST server survey"
run_ssh bash -s -- "$APP_ROOT" <<'REMOTE'
set +e
root="$1"
printf '%s\n' '--- identity ---'
printf 'user='; whoami
printf 'hostname='; hostname
printf 'architecture='; uname -m
if [[ -r /etc/os-release ]]; then
  os_name="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | head -n 1 | tr -d '"')"
  printf 'os=%s\n' "$os_name"
fi
printf '%s\n' '--- capacity ---'
df -h / "$root" 2>/dev/null | sed -n '1,3p'
free -h 2>/dev/null | sed -n '1,3p'
printf '%s\n' '--- privilege and runtimes ---'
if sudo -n true 2>/dev/null; then printf 'sudo=non-interactive available\n'; else printf 'sudo=non-interactive unavailable\n'; fi
for command_name in docker node npm nginx apache2 httpd caddy certbot ss ufw firewall-cmd nft iptables; do
  if command -v "$command_name" >/dev/null 2>&1; then printf '%s=present\n' "$command_name"; else printf '%s=missing\n' "$command_name"; fi
done
docker --version 2>/dev/null || true
docker compose version 2>/dev/null || true
node --version 2>/dev/null || true
npm --version 2>/dev/null || true
printf '%s\n' '--- web services and listeners ---'
if command -v systemctl >/dev/null 2>&1; then
  for service_name in nginx apache2 httpd caddy docker clickme; do
    printf '%s=' "$service_name"
    systemctl is-active "$service_name" 2>/dev/null || true
  done
fi
if sudo -n true 2>/dev/null; then
  sudo -n ss -lntp 2>/dev/null | awk 'NR == 1 || $4 ~ /:(80|443|3000|3001)$/'
else
  ss -lnt 2>/dev/null | awk 'NR == 1 || $4 ~ /:(80|443|3000|3001)$/'
fi
printf '%s\n' '--- containers ---'
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
printf '%s\n' '--- DNS ---'
getent ahosts clickme.madcamp-kaist.org 2>/dev/null | sed -n '1,8p'
REMOTE

log "selecting deployment runtime"
selection_output="$(run_ssh bash -s -- "$REQUESTED_METHOD" "$APP_ROOT" <<'REMOTE'
set -Eeuo pipefail
requested="$1"
root="$2"

if [[ "$requested" == "docker" ]] \
  && command -v docker >/dev/null 2>&1 \
  && docker compose version >/dev/null 2>&1 \
  && docker info >/dev/null 2>&1; then
  printf 'CLICKME_METHOD=docker\n'
  exit 0
fi

if [[ "$requested" == "docker" ]]; then
  printf 'Docker/Compose is unavailable to this user; evaluating Node/systemd fallback.\n' >&2
fi

find_node_runtime() {
  local candidate node_bin

  candidate="$(command -v node 2>/dev/null || true)"
  if [[ -n "$candidate" ]]; then
    candidate="$(readlink -f "$candidate")"
    node_bin="$(dirname "$candidate")"
    if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
      printf '%s\n' "$node_bin"
      return 0
    fi
  fi

  # The production service may deliberately use a private, root-owned Node
  # installation instead of altering the server-wide PATH. Support that
  # documented layout without modifying any global shell configuration.
  for candidate in /opt/clickme-node-v*/bin/node; do
    [[ -x "$candidate" ]] || continue
    node_bin="$(dirname "$(readlink -f "$candidate")")"
    if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
      printf '%s\n' "$node_bin"
      return 0
    fi
  done

  return 1
}

node_bin="$(find_node_runtime)" || {
  printf 'ERROR: Node.js fallback requires a Node 24 LTS runtime with npm.\n' >&2
  exit 1
}
export PATH="$node_bin:$PATH"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= 24 )) || { printf 'ERROR: Node.js 24 or newer is required.\n' >&2; exit 1; }
node_lts="$(node -p 'process.release.lts || ""')"
[[ -n "$node_lts" ]] || {
  printf 'ERROR: the Node.js fallback must use an active LTS release, not a Current release.\n' >&2
  exit 1
}

expected_exec="$root/current/server.js"
expected_env="$root/shared/clickme.env"

if systemctl cat clickme.service >/dev/null 2>&1; then
  systemctl cat clickme.service | grep -Fq "$expected_exec" || {
    printf 'ERROR: existing clickme.service does not target the managed current release.\n' >&2
    exit 1
  }
  systemctl cat clickme.service | grep -Fq "$expected_env" || {
    printf 'ERROR: existing clickme.service does not use the shared environment file.\n' >&2
    exit 1
  }
  service_user="$(systemctl show clickme.service -p User --value 2>/dev/null || true)"
  [[ -n "$service_user" && "$service_user" != "root" ]] || {
    printf 'ERROR: clickme.service must run as a dedicated non-root user.\n' >&2
    exit 1
  }
  effective_exec="$(systemctl show clickme.service -p ExecStart --value 2>/dev/null || true)"
  grep -Eq '(^|[[:space:];])HOSTNAME=127[.]0[.]0[.]1($|[[:space:];])' \
    <<< "$effective_exec" || {
      printf 'ERROR: clickme.service ExecStart must override HOSTNAME=127.0.0.1.\n' >&2
      exit 1
    }
  grep -Eq '(^|[[:space:];])PORT=3001($|[[:space:];])' \
    <<< "$effective_exec" || {
      printf 'ERROR: clickme.service ExecStart must override PORT=3001 behind Nginx.\n' >&2
      exit 1
    }
  [[ "$(systemctl show clickme.service -p MemoryHigh --value)" == "805306368" \
    && "$(systemctl show clickme.service -p MemoryMax --value)" == "1073741824" \
    && "$(systemctl show clickme.service -p TasksMax --value)" == "128" \
    && "$(systemctl show clickme.service -p LimitNOFILE --value)" == "8192" ]] || {
      printf 'ERROR: clickme.service must apply the reviewed memory, task, and file limits.\n' >&2
      exit 1
    }
  if [[ "$(id -u)" == "0" ]]; then
    printf 'CLICKME_SERVICE_CONTROL=direct\n'
  elif sudo -n systemctl show clickme.service >/dev/null 2>&1; then
    printf 'CLICKME_SERVICE_CONTROL=sudo\n'
  else
    printf 'ERROR: restarting the system clickme.service requires non-interactive sudo.\n' >&2
    exit 1
  fi
elif systemctl --user cat clickme.service >/dev/null 2>&1; then
  [[ "$(id -u)" != "0" ]] || {
    printf 'ERROR: refusing to run clickme as a root user service.\n' >&2
    exit 1
  }
  systemctl --user cat clickme.service | grep -Fq "$expected_exec" || {
    printf 'ERROR: user clickme.service does not target the managed current release.\n' >&2
    exit 1
  }
  systemctl --user cat clickme.service | grep -Fq "$expected_env" || {
    printf 'ERROR: user clickme.service does not use the shared environment file.\n' >&2
    exit 1
  }
  effective_exec="$(systemctl --user show clickme.service -p ExecStart --value 2>/dev/null || true)"
  grep -Eq '(^|[[:space:];])HOSTNAME=127[.]0[.]0[.]1($|[[:space:];])' \
    <<< "$effective_exec" || {
      printf 'ERROR: user clickme.service ExecStart must override HOSTNAME=127.0.0.1.\n' >&2
      exit 1
    }
  grep -Eq '(^|[[:space:];])PORT=3001($|[[:space:];])' \
    <<< "$effective_exec" || {
      printf 'ERROR: user clickme.service ExecStart must override PORT=3001 behind Nginx.\n' >&2
      exit 1
    }
  [[ "$(systemctl --user show clickme.service -p MemoryHigh --value)" == "805306368" \
    && "$(systemctl --user show clickme.service -p MemoryMax --value)" == "1073741824" \
    && "$(systemctl --user show clickme.service -p TasksMax --value)" == "128" \
    && "$(systemctl --user show clickme.service -p LimitNOFILE --value)" == "8192" ]] || {
      printf 'ERROR: user clickme.service must apply the reviewed memory, task, and file limits.\n' >&2
      exit 1
    }
  printf 'CLICKME_SERVICE_CONTROL=user\n'
else
  printf 'ERROR: clickme.service is not registered; use the reviewed example and have an administrator install it.\n' >&2
  exit 1
fi

printf 'CLICKME_NODE_BIN=%s\n' "$node_bin"
printf 'CLICKME_METHOD=node\n'
REMOTE
)"

SELECTED_METHOD="$(sed -n 's/^CLICKME_METHOD=//p' <<< "$selection_output" | tail -n 1)"
NODE_SERVICE_CONTROL="$(sed -n 's/^CLICKME_SERVICE_CONTROL=//p' <<< "$selection_output" | tail -n 1)"
NODE_RUNTIME_BIN="$(sed -n 's/^CLICKME_NODE_BIN=//p' <<< "$selection_output" | tail -n 1)"
[[ "$SELECTED_METHOD" == "docker" || "$SELECTED_METHOD" == "node" ]] || {
  printf 'ERROR: server did not return a supported deployment method.\n' >&2
  exit 1
}
if [[ "$SELECTED_METHOD" == "node" ]] \
  && [[ ! "$NODE_RUNTIME_BIN" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf 'ERROR: server returned an unsafe Node runtime path.\n' >&2
  exit 1
fi
log "selected method: $SELECTED_METHOD"
if [[ "$SELECTED_METHOD" == "node" ]]; then
  log "Node runtime: $NODE_RUNTIME_BIN"
fi

log "verifying the pre-existing Nginx security boundary"
run_ssh bash -s <<'REMOTE'
set -Eeuo pipefail

if ! command -v nginx >/dev/null 2>&1 && [[ ! -x /usr/sbin/nginx ]]; then
  printf 'ERROR: Nginx is not installed. Complete the reviewed first cutover in DEPLOYMENT.md.\n' >&2
  exit 1
fi
systemctl is-active --quiet nginx || {
  printf 'ERROR: Nginx must already own 127.0.0.1:3000 before automated releases.\n' >&2
  exit 1
}

ready_status="$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
  --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3001/api/ready)"
[[ "$ready_status" == "200" ]] || {
  printf 'ERROR: the current Next.js readiness endpoint on port 3001 returned %s.\n' "$ready_status" >&2
  exit 1
}

comment_status="$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
  --header 'Host: clickme.madcamp-kaist.org' \
  --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3000/api/comments)"
[[ "$comment_status" == "200" ]] || {
  printf 'ERROR: port 3000 does not expose the reviewed Clickme Nginx boundary.\n' >&2
  exit 1
}
REMOTE

log "creating an isolated release directory"
prepare_output="$(run_ssh bash -s -- "$APP_ROOT" "$RELEASE_PATH" <<'REMOTE'
set -Eeuo pipefail
root="$1"
release="$2"

[[ "$root" == /* && "$root" != "/" ]] || { printf 'ERROR: unsafe application root\n' >&2; exit 1; }
[[ "$release" == "$root/releases/"* ]] || { printf 'ERROR: unsafe release path\n' >&2; exit 1; }
[[ ! -L "$root" ]] || { printf 'ERROR: application root must not be a symlink\n' >&2; exit 1; }

mkdir -p "$root/releases" "$root/shared"
[[ ! -L "$root/releases" && ! -L "$root/shared" ]] || {
  printf 'ERROR: releases/shared directories must not be symlinks\n' >&2
  exit 1
}

if [[ -e "$root/current" && ! -L "$root/current" ]]; then
  printf 'ERROR: current exists but is not a symlink\n' >&2
  exit 1
fi

previous=""
previous_method=""
if [[ -L "$root/current" ]]; then
  previous="$(readlink -f "$root/current")"
  [[ "$previous" == "$root/releases/"* && -d "$previous" ]] || {
    printf 'ERROR: current points outside the managed releases directory\n' >&2
    exit 1
  }
  if [[ -f "$previous/.clickme-deploy-method" ]]; then
    IFS= read -r previous_method < "$previous/.clickme-deploy-method"
    [[ "$previous_method" == "docker" || "$previous_method" == "node" ]] || previous_method=""
  fi
fi

[[ ! -e "$release" ]] || { printf 'ERROR: release path already exists\n' >&2; exit 1; }
mkdir "$release"

printf 'CLICKME_PREVIOUS_RELEASE=%s\n' "$previous"
printf 'CLICKME_PREVIOUS_METHOD=%s\n' "$previous_method"
REMOTE
)"

PREVIOUS_RELEASE="$(sed -n 's/^CLICKME_PREVIOUS_RELEASE=//p' <<< "$prepare_output" | tail -n 1)"
PREVIOUS_METHOD="$(sed -n 's/^CLICKME_PREVIOUS_METHOD=//p' <<< "$prepare_output" | tail -n 1)"

if [[ -n "$PREVIOUS_RELEASE" && -z "$PREVIOUS_METHOD" ]]; then
  printf 'ERROR: the current release has no deployment-method marker; refusing an unsafe automatic rollback.\n' >&2
  exit 1
fi
if [[ -n "$PREVIOUS_METHOD" && "$PREVIOUS_METHOD" != "$SELECTED_METHOD" ]]; then
  printf 'ERROR: changing deployment methods requires a reviewed manual migration.\n' >&2
  exit 1
fi

log "previous release: ${PREVIOUS_RELEASE:-none}"
log "transferring committed source to $RELEASE_PATH"
rsync -az --delete --safe-links \
  --include='/.env.example' \
  --exclude='/.git/' \
  --exclude='/.github/' \
  --exclude='/node_modules/' \
  --exclude='/.next/' \
  --exclude='/.env' \
  --exclude='/.env.*' \
  --exclude='/coverage/' \
  --exclude='DEPLOYMENT.local.md' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='id_rsa*' \
  --exclude='id_ed25519*' \
  -e "$RSYNC_SHELL" \
  ./ "${SSH_TARGET}:${RELEASE_PATH}/"

log "validating the shared runtime environment without printing values"
run_ssh bash -s -- "$ENV_FILE" <<'REMOTE'
set -Eeuo pipefail
env_file="$1"

[[ -f "$env_file" && ! -L "$env_file" ]] || {
  printf 'ERROR: shared runtime environment file is missing or is a symlink\n' >&2
  exit 1
}

required=(
  NODE_ENV
  PORT
  HOSTNAME
  NEXT_PUBLIC_SITE_URL
  SUPABASE_URL
  SUPABASE_SECRET_KEY
  VISITOR_HASH_SECRET
)
for key in "${required[@]}"; do
  grep -Eq "^[[:space:]]*${key}=.+" "$env_file" || {
    printf 'ERROR: required runtime variable is missing or empty: %s\n' "$key" >&2
    exit 1
  }
done

for forbidden in SUPABASE_DB_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN OPENAI_API_KEY SSH_PRIVATE_KEY SSH_PASSWORD; do
  if grep -Eq "^[[:space:]]*${forbidden}=" "$env_file"; then
    printf 'ERROR: migration/deployment-only variable must not be in runtime environment: %s\n' "$forbidden" >&2
    exit 1
  fi
done

grep -Eq '^NODE_ENV=production$' "$env_file" || {
  printf 'ERROR: NODE_ENV must be production\n' >&2
  exit 1
}
grep -Eq '^PORT=3001$' "$env_file" || {
  printf 'ERROR: PORT must be 3001 (Nginx owns loopback port 3000)\n' >&2
  exit 1
}
grep -Eq '^HOSTNAME=0[.]0[.]0[.]0$' "$env_file" || {
  printf 'ERROR: HOSTNAME must be 0.0.0.0 (the Compose host port remains loopback-only)\n' >&2
  exit 1
}
grep -Eq '^NEXT_PUBLIC_SITE_URL=https://clickme[.]madcamp-kaist[.]org/?$' "$env_file" || {
  printf 'ERROR: NEXT_PUBLIC_SITE_URL does not match the production domain\n' >&2
  exit 1
}

chmod 600 "$env_file"
[[ "$(stat -c '%a' "$env_file")" == "600" ]] || {
  printf 'ERROR: runtime environment file mode must be 600\n' >&2
  exit 1
}
REMOTE

if [[ "$SELECTED_METHOD" == "docker" ]]; then
  log "building the release image while the current release remains active"
  run_ssh bash -s -- "$RELEASE_PATH" "$ENV_FILE" "$RELEASE_ID" "$PREVIOUS_RELEASE" <<'REMOTE'
set -Eeuo pipefail
release="$1"
env_file="$2"
release_id="$3"
previous="$4"

if [[ -z "$previous" ]] \
  && [[ -n "$(docker ps -q --filter label=com.docker.compose.project=clickme)" ]]; then
  printf 'ERROR: unmanaged clickme Compose containers already exist\n' >&2
  exit 1
fi

export KAIST_APP_ENV_FILE="$env_file"
export CLICKME_RELEASE="$release_id"
docker compose -p clickme -f "$release/compose.yaml" config --quiet
docker compose -p clickme -f "$release/compose.yaml" build --pull

# Prove the exact image can boot and reach its dependencies before it replaces
# the container bound to the production loopback port.
candidate_name="clickme-candidate-${release_id}"
candidate_image="clickme-app:${release_id}"
cleanup_candidate() {
  docker rm -f "$candidate_name" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

if docker container inspect "$candidate_name" >/dev/null 2>&1; then
  printf 'ERROR: candidate container name already exists: %s\n' "$candidate_name" >&2
  exit 1
fi

docker run --detach \
  --name "$candidate_name" \
  --env-file "$env_file" \
  --env PORT=3001 \
  --env HOSTNAME=0.0.0.0 \
  --memory 1g \
  --memory-reservation 768m \
  --pids-limit 128 \
  --ulimit nofile=8192:8192 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=67108864 \
  --tmpfs /app/.next/cache:rw,noexec,nosuid,size=134217728 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --init \
  "$candidate_image" >/dev/null

candidate_status="starting"
for attempt in $(seq 1 60); do
  candidate_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$candidate_name")"
  [[ "$candidate_status" == "healthy" ]] && break
  if [[ "$candidate_status" == "unhealthy" || "$candidate_status" == "missing" ]]; then
    break
  fi
  sleep 2
done

if [[ "$candidate_status" != "healthy" ]]; then
  printf 'ERROR: candidate image health status is %s\n' "$candidate_status" >&2
  docker logs --tail=100 "$candidate_name" >&2 || true
  exit 1
fi

docker exec "$candidate_name" node -e '
  const check = async () => {
    const home = await fetch("http://127.0.0.1:3001/");
    const homeText = await home.text();
    if (!home.ok || !homeText.includes("찍먹") || !homeText.includes("부먹")) process.exit(1);
    const ready = await fetch("http://127.0.0.1:3001/api/ready");
    const readyBody = await ready.json();
    if (!ready.ok || readyBody?.status !== "ready" || readyBody?.database !== "ok") process.exit(1);
    const health = await fetch("http://127.0.0.1:3001/api/health");
    const healthBody = await health.json();
    if (!health.ok || healthBody?.status !== "ok" || "database" in healthBody) process.exit(1);
    const results = await fetch("http://127.0.0.1:3001/api/results");
    const resultBody = await results.json();
    if (!results.ok || !resultBody?.counts || !resultBody?.campaign || "userChoice" in resultBody) process.exit(1);
    const comments = await fetch("http://127.0.0.1:3001/api/comments");
    const commentBody = await comments.json();
    if (!comments.ok || !Array.isArray(commentBody?.comments)) process.exit(1);
  };
  check().catch(() => process.exit(1));
'

cleanup_candidate
trap - EXIT
printf '%s\n' docker > "$release/.clickme-deploy-method"
REMOTE

  log "activating the new Docker image"
  ACTIVE=1
  run_ssh bash -s -- "$RELEASE_PATH" "$ENV_FILE" "$RELEASE_ID" <<'REMOTE'
set -Eeuo pipefail
release="$1"
env_file="$2"
release_id="$3"
export KAIST_APP_ENV_FILE="$env_file"
export CLICKME_RELEASE="$release_id"
docker compose -p clickme -f "$release/compose.yaml" up -d --no-build --remove-orphans
REMOTE
else
  log "building the standalone Node.js release"
  run_ssh bash -s -- "$RELEASE_PATH" "$ENV_FILE" "$NODE_RUNTIME_BIN" <<'REMOTE'
set -Eeuo pipefail
release="$1"
env_file="$2"
node_bin="$3"
[[ "$node_bin" == /* && -x "$node_bin/node" && -x "$node_bin/npm" ]] || {
  printf 'ERROR: configured Node runtime is unavailable: %s\n' "$node_bin" >&2
  exit 1
}
export PATH="$node_bin:$PATH"
export NEXT_TELEMETRY_DISABLED=1
cd "$release"
npm ci
mkdir -p public
npm run build
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static .next/standalone/public
cp -a .next/static .next/standalone/.next/static
cp -a public .next/standalone/public
# The systemd unit runs the standalone entrypoint from the release root. Copy
# the complete standalone runtime there only after its static/public assets
# are in place; the source tree may remain for release diagnostics, but it is
# never used by the production process.
cp -a .next/standalone/. "$release/"

# Start the candidate on an unused loopback port while Nginx and the current
# service continue to own ports 3000 and 3001. Node's parseEnv reads the systemd-format file
# without evaluating it as shell code.
candidate_port="$(node -e '
  const net = require("node:net");
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    process.stdout.write(String(server.address().port));
    server.close();
  });
')"
candidate_log="$(mktemp)"
candidate_pid=""
cleanup_candidate() {
  if [[ -n "$candidate_pid" ]]; then
    kill "$candidate_pid" >/dev/null 2>&1 || true
    wait "$candidate_pid" >/dev/null 2>&1 || true
  fi
  rm -f "$candidate_log"
}
trap cleanup_candidate EXIT

node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { dirname } from "node:path";
  import { pathToFileURL } from "node:url";
  import { parseEnv } from "node:util";
  const [envFile, serverPath, port] = process.argv.slice(1);
  Object.assign(process.env, parseEnv(readFileSync(envFile, "utf8")), {
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: port,
  });
  process.chdir(dirname(serverPath));
  await import(pathToFileURL(serverPath).href);
' "$env_file" "$release/server.js" "$candidate_port" \
  >"$candidate_log" 2>&1 &
candidate_pid="$!"

candidate_healthy=0
for attempt in $(seq 1 45); do
  if curl --silent --show-error --fail \
    --connect-timeout 2 --max-time 5 --output /dev/null \
    "http://127.0.0.1:${candidate_port}/api/ready"; then
    candidate_healthy=1
    break
  fi
  kill -0 "$candidate_pid" >/dev/null 2>&1 || break
  sleep 2
done

if (( candidate_healthy == 0 )); then
  printf 'ERROR: standalone candidate did not become healthy\n' >&2
  tail -n 100 "$candidate_log" >&2 || true
  exit 1
fi

candidate_dir="$(mktemp -d)"
curl --silent --show-error --fail \
  --output "$candidate_dir/home" "http://127.0.0.1:${candidate_port}/"
grep -q '찍먹' "$candidate_dir/home"
grep -q '부먹' "$candidate_dir/home"
curl --silent --show-error --fail \
  --output "$candidate_dir/health" "http://127.0.0.1:${candidate_port}/api/health"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$candidate_dir/health"
if grep -Eq '"database"[[:space:]]*:' "$candidate_dir/health"; then
  printf 'ERROR: candidate public liveness exposes database readiness\n' >&2
  exit 1
fi
curl --silent --show-error --fail \
  --output "$candidate_dir/results" "http://127.0.0.1:${candidate_port}/api/results"
grep -Eq '"counts"[[:space:]]*:' "$candidate_dir/results"
grep -Eq '"campaign"[[:space:]]*:' "$candidate_dir/results"
if grep -Eq '"userChoice"[[:space:]]*:' "$candidate_dir/results"; then
  printf 'ERROR: candidate public results exposes visitor-specific data\n' >&2
  exit 1
fi
comment_status="$(curl --silent --show-error \
  --output "$candidate_dir/comments" --write-out '%{http_code}' \
  "http://127.0.0.1:${candidate_port}/api/comments")"
[[ "$comment_status" == "200" ]]
grep -Eq '"comments"[[:space:]]*:[[:space:]]*\[' "$candidate_dir/comments"
rm -rf "$candidate_dir"

cleanup_candidate
trap - EXIT
printf '%s\n' node > .clickme-deploy-method
REMOTE

  log "activating the new standalone release"
  ACTIVE=1
  atomic_remote_link "$RELEASE_PATH"
  restart_node_service restart
fi

log "waiting for private readiness on port 3001"
wait_for_internal_health
log "running localhost Nginx and readiness smoke tests"
run_internal_smoke

log "running public HTTPS smoke tests"
"$PROJECT_ROOT/scripts/smoke-test.sh" "$PUBLIC_URL" public

log "finalizing the current release link"
atomic_remote_link "$RELEASE_PATH"
ACTIVE=0

log "deployment completed"
log "current release: $RELEASE_PATH"
log "previous release retained for rollback: ${PREVIOUS_RELEASE:-none}"
log "method: $SELECTED_METHOD"
