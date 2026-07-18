# Clickme production deployment and security operations

공개 주소는 `https://clickme.madcamp-kaist.org`입니다. 운영 기간은 배포 코드나 문서에 고정하지 않으며 Supabase의 `campaign_settings`로 변경합니다.

저장소의 설정 파일을 수정했다고 다른 서버의 라이브 서비스가 자동으로 바뀌지는 않습니다. 다만 이 production 서버에는 2026-07-16~17 UTC에 아래 목표 구조, Supabase migration, Nginx/systemd/timer 전환을 적용했습니다. Cloudflare dashboard 설정 변경은 이 서버 작업의 범위가 아니며 운영자 권한이 필요합니다.

## 활성 구조와 적용 기록

```text
Internet
  -> Cloudflare edge TLS / Tunnel
  -> 127.0.0.1:3000 Nginx
  -> 127.0.0.1:3001 Next.js
  -> Supabase
```

2026-07-16~17 UTC 적용 및 검증 결과는 다음과 같습니다.

- Cloudflare Tunnel은 변경 없이 `127.0.0.1:3000`을 origin으로 사용합니다.
- Nginx가 `127.0.0.1:3000`에서 active이고, Next.js는 `127.0.0.1:3001`에서 active입니다. 두 포트는 public으로 노출되지 않습니다.
- `clickme.service`에는 `MemoryHigh=768M`, `MemoryMax=1G`, `TasksMax=128`, `LimitNOFILE=8192`, 자동 재시작과 sandbox가 적용되어 있습니다.
- `clickme-cleanup.timer`가 enabled 상태이며, 수동 1회 실행으로 48시간 지난 operational rate bucket 정리 RPC의 성공을 확인했습니다.
- internal/public read-only smoke와 원격 migration 목록 확인을 통과했습니다. 이전 unit과 release 경로는 접근 제한 backup에 보존했습니다.

이 문서의 install/cutover 명령은 새 서버나 다음 release를 위한 절차입니다. 이미 적용된 production에서 첫 cutover 명령을 다시 실행하지 말고, release 배포 절차와 rollback 절차를 검토해 사용합니다.

## 배포 전 요구사항

- Node.js 24 이상 또는 Docker Compose
- Nginx에 `http_limit_req`, `http_limit_conn`, `http_split_clients`, `http_proxy`, `http_realip` 모듈
- 적용 완료된 Supabase migration과 service-role runtime key
- `/srv/clickme/shared/clickme.env` 권한 `0600`
- 최소 32바이트 난수 `VISITOR_HASH_SECRET`; release 사이에서 유지
- 공개 origin `NEXT_PUBLIC_SITE_URL=https://clickme.madcamp-kaist.org`

공유 runtime 환경파일의 listener 기본값은 다음과 같습니다. systemd는 `HOSTNAME=127.0.0.1`을, Compose는 container 내부 접근을 위해 `HOSTNAME=0.0.0.0`을 명시적으로 덮어씁니다.

```dotenv
NODE_ENV=production
PORT=3001
HOSTNAME=0.0.0.0
NEXT_PUBLIC_SITE_URL=https://clickme.madcamp-kaist.org
```

DB 접속 문자열, Supabase access token, SSH 개인키는 runtime 환경파일과 release에 두지 않습니다. 원격 Supabase는 VM과 별개이므로 VM 삭제가 분석 데이터를 삭제하지 않습니다.

댓글 runtime이 제거됐으므로 이전 운영 env에 남아 있는 `OPENAI_API_KEY`도 삭제·폐기합니다. 배포 script는 불필요한 해당 key가 runtime env에 있으면 중단합니다.

## 1. 애플리케이션 release

기존 release 구조를 유지합니다.

```text
/srv/clickme/
├── current -> /srv/clickme/releases/<release-id>
├── releases/
└── shared/
    └── clickme.env
```

먼저 별도 release에서 검증합니다.

```bash
npm ci
npm run check
```

Supabase migration은 애플리케이션 배포보다 먼저 적용하고 대상 프로젝트를 재확인합니다.

```bash
npx supabase db push
```

`SUPABASE_DB_URL`은 migration을 수행하는 셸에서만 사용하며 서버 runtime 환경파일에 복사하지 않습니다.

### Node/systemd 방식

새 standalone build를 `/srv/clickme/current`에서 제공한 뒤 [scripts/clickme.service.example](scripts/clickme.service.example)을 실제 경로·사용자와 비교합니다. 예시 unit은 다음을 강제합니다.

- Next.js: `127.0.0.1:3001`
- `MemoryHigh=768M`, `MemoryMax=1G`
- `TasksMax=128`, `LimitNOFILE=8192`
- capability 제거, read-only system 경로, private tmp/device
- journald burst 제한과 비정상 종료 재시작

기존 unit을 바로 덮어쓰지 않습니다. `systemctl cat` 출력은 drop-in이 합쳐진 표시용 내용이므로 복원 파일로 사용하지 않습니다. 실제 fragment를 별도로 백업합니다.

```bash
unit_path="$(systemctl show clickme.service -p FragmentPath --value)"
test "$unit_path" = /etc/systemd/system/clickme.service
backup="/var/backups/clickme.service.pre-nginx.$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 /var/backups
sudo cp --preserve=mode,ownership,timestamps "$unit_path" "$backup"
sudo systemctl cat clickme.service > /tmp/clickme.service.effective-before
cp scripts/clickme.service.example /tmp/clickme.service
sudo systemd-analyze verify /tmp/clickme.service
diff -u /tmp/clickme.service.effective-before /tmp/clickme.service || true
```

standalone 산출물의 `server.js`는 release 루트에 두므로, unit은 `/srv/clickme/current/server.js`를 실행해야 합니다. 승인 후 설치하고 daemon에 새 정의를 읽히되 실제 재시작은 아래 Nginx cutover 순서에서 수행합니다. 출력된 `$backup` 경로를 변경 기록에 남깁니다.

```bash
sudo install -m 0644 scripts/clickme.service.example "$unit_path"
sudo systemd-analyze verify "$unit_path"
sudo systemctl daemon-reload
printf 'rollback unit: %s\n' "$backup"
```

### Docker 방식

Compose는 container의 3001을 host loopback 3001에만 노출하고 동일한 메모리, PID, file descriptor 상한을 적용합니다.

```bash
export KAIST_APP_ENV_FILE=/srv/clickme/shared/clickme.env
export CLICKME_RELEASE="$(basename "$(readlink -f /srv/clickme/current)")"
docker compose -p clickme config --quiet
docker compose -p clickme build
```

`docker compose config` 전체 출력은 secret을 포함할 수 있으므로 기록하거나 채팅에 붙이지 않습니다.

## 2. Nginx 준비와 안전한 cutover

[scripts/nginx-clickme.conf.example](scripts/nginx-clickme.conf.example)은 `nginx.conf`의 `http {}` 안에서 include해야 합니다. 일반 Ubuntu package의 `sites-enabled/*` 위치가 이에 해당합니다. 다른 server block을 삭제하거나 default site를 무조건 덮어쓰지 않습니다.

설치 전에 다음을 확인합니다.

```bash
nginx -V 2>&1
ss -ltnp | grep -E '127\.0\.0\.1:(3000|3001)\b' || true
systemctl cat cloudflared.service
```

Nginx cache와 로그 파일을 위한 디렉터리를 만든 뒤 설정과 logrotate 예시를 설치합니다.

```bash
sudo install -d -m 0750 -o www-data -g www-data /var/cache/nginx/clickme
sudo install -m 0644 scripts/nginx-clickme.conf.example \
  /etc/nginx/sites-available/clickme.madcamp-kaist.org
sudo ln -s /etc/nginx/sites-available/clickme.madcamp-kaist.org \
  /etc/nginx/sites-enabled/clickme.madcamp-kaist.org
sudo install -m 0644 scripts/nginx-clickme-logrotate.example \
  /etc/logrotate.d/clickme-nginx
sudo nginx -t
```

동일 이름의 파일이나 link가 이미 있으면 중단하고 diff와 백업을 먼저 만듭니다. `nginx -t` 실패 시 reload/start하지 않습니다.

Next와 Nginx가 동시에 3000을 사용할 수 없으므로 첫 전환에는 짧은 점검 구간이 필요합니다.

1. 새 코드와 DB migration을 준비하되 아직 트래픽을 전환하지 않습니다.
2. Nginx 설정을 설치하고 `nginx -t`를 통과시킵니다.
3. 새 systemd unit 또는 Compose로 Next를 `127.0.0.1:3001`에 시작합니다.
4. `curl --fail http://127.0.0.1:3001/api/ready`로 DB readiness를 확인합니다.
5. 즉시 Nginx를 시작해 `127.0.0.1:3000`을 인수합니다.
6. 내부 smoke, 공개 smoke 순서로 확인합니다.

```bash
sudo systemctl restart clickme.service
curl --fail http://127.0.0.1:3001/api/ready
sudo systemctl start nginx
scripts/smoke-test.sh http://127.0.0.1:3000 internal
scripts/smoke-test.sh https://clickme.madcamp-kaist.org public
```

Docker이면 3단계에서 `docker compose -p clickme up -d --remove-orphans`를 사용합니다. 이후 배포는 Nginx를 유지한 채 3001의 Next만 교체하므로 같은 포트 전환이 필요하지 않습니다.

첫 cutover가 끝난 뒤의 release는 자동 배포 스크립트를 사용할 수 있습니다.

```bash
export KAIST_DB_MIGRATION_CONFIRMED=1
scripts/deploy-kaist.sh
```

스크립트는 실행 전 Nginx active 상태, port 3001 private readiness, edge comments 410 계약을 검사합니다. 예전처럼 Next가 3000에 직접 연결된 상태에서는 안전하게 중단되므로 첫 cutover 용도로 사용하지 않습니다.

### Proxy 경계와 IP 계약

- Nginx는 `clickme.madcamp-kaist.org` 이외의 Host를 연결 종료로 거절합니다.
- Cloudflare Tunnel이 설정한 `CF-Connecting-IP`만 구문 검사한 뒤 `X-Clickme-Client-IP`로 전달합니다.
- inbound `X-Clickme-Client-IP`, `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP`는 upstream 전달 전에 제거·덮어씁니다.
- Next.js production은 `X-Clickme-Client-IP`만 신뢰합니다. 헤더가 없거나 잘못되면 `unknown` network bucket으로 처리합니다.
- Nginx port 3000과 Next port 3001은 모두 loopback 전용입니다.
- 동시 연결은 client network당 40개, vhost 전체 512개로 제한합니다.

Cloudflare Tunnel이 아닌 다른 reverse proxy를 앞에 추가하려면 이 IP 신뢰 계약을 그대로 재설계해야 합니다. 임의 forwarding header 신뢰를 추가하지 않습니다.

## 3. Endpoint 방어 정책

| Endpoint | Nginx 정책 |
| --- | --- |
| `POST /api/vote` | network 20 req/s, burst 30, body 4 KiB; DB의 고정 초당 15회가 최종 권한 |
| `POST /api/session` | network 300 req/min + visitor 3 req/min, body 4 KiB |
| `POST /api/analytics/heartbeat` | session 6 req/min, body 4 KiB |
| `POST /api/analytics/events` | session 12 req/min, body 16 KiB |
| `POST /api/shares` | visitor 10 req/min, body 4 KiB; 앱/DB가 일 50건 최종 제한 |
| `GET /api/results` | public 300 req/min, 1초 cache, 5xx/timeout 시 stale, cache lock |
| `/r/<token>` 및 share image | 22자 base64url 형식 선검사, public 300 req/min, 유효 image 1년 immutable cache |
| `GET /api/comments` | public read, 다른 GET API와 동일한 public 300 req/min |
| `POST /api/comments` | visitor 10 req/min, body 4 KiB; 앱/DB가 투표 필요·5분당 5건 최종 제한 |
| `GET /api/topics/history` | 기타 API 정책과 동일 (명시적 location 없이 `/api/` 기본 규칙 적용) |
| `/api/next` | 앱을 거치지 않는 `302 https://seojiny.com`, `no-referrer` |
| 기타 API | body 4 KiB, GET/HEAD/POST 외 method 거절 |

서명 cookie key를 임의로 바꾸는 우회를 막기 위해 heartbeat, event, share에는 network 60 req/s·burst 30의 공통 상한도 함께 적용합니다. 정상적인 학교·회사 NAT 사용자를 과도하게 묶지 않도록 이 backstop은 endpoint별 세션/방문자 한도보다 느슨합니다.

모든 mutation은 앱에서 body를 streaming 방식으로 다시 제한하고 timeout, Origin, Fetch Metadata, 일일 session, CSRF를 검증합니다. Nginx도 다음 요청을 DB 접근 전에 거절합니다.

- 정확한 `Origin: https://clickme.madcamp-kaist.org`가 아님
- `Sec-Fetch-Site: same-origin`이 아님
- JSON endpoint의 Content-Type이 `application/json`이 아님
- session bootstrap 이외 mutation에 session cookie 또는 `X-Clickme-CSRF`가 없음

`POST /api/session`은 session과 CSRF를 발급하는 bootstrap이므로 기존 cookie/header 검사를 요구하지 않는 유일한 예외입니다.

앱의 Supabase DB 작업은 전역 최대 64개로 제한합니다. 투표 48개, telemetry 12개, 공유 생성 4개를 별도 격리하고, session bootstrap 전용 16개를 남기기 위해 일반 DB 작업은 전역 슬롯 48개에서 빠르게 실패합니다. 추천 조회 16개와 이미지 I/O 8개도 공유 생성 CPU 슬롯과 분리해 이미지 트래픽이 추천 landing이나 새 링크 생성을 고갈시키지 않게 합니다.

Nginx가 만든 429는 작은 고정 JSON과 `Retry-After: 1`을 반환합니다. Upstream의 세부 rate-limit 응답은 가로채지 않습니다.

### Health 계약

- `GET /api/health`: 공개 liveness. DB를 조회하거나 DB 상태를 노출하지 않습니다.
- `GET http://127.0.0.1:3001/api/ready`: localhost 전용 DB readiness.
- Nginx의 `/api/ready`: 항상 404. Cloudflare를 통해 접근할 수 없습니다.
- systemd/Compose healthcheck는 3001의 readiness를 직접 사용합니다.

## 4. Logging, monitoring, and attack response

Nginx access log에는 request ID, 정규화한 route, method, status, 처리시간, 응답 크기만 기록합니다. 다음 값은 기록하지 않습니다.

- IP와 network hash
- query string, referrer, User-Agent
- cookie, CSRF, 추천 token

`/r/*`와 share-image 경로는 token을 `:token`으로 치환합니다. 429는 1%만 sampling합니다. Nginx의 일반 request error 형식은 원본 IP와 raw URI를 포함하므로 vhost error log는 `crit`만 허용하고, upstream 5xx와 timeout은 정규화 access JSON으로 조사합니다. logrotate는 매일 또는 20 MiB 도달 시 회전하고 7개를 보존합니다.

Next.js의 incoming request, fetch URL, Server Function, browser-console 전달 로그도 비활성화합니다. 요청 단위 운영 로그는 Nginx의 정규화 JSON 한 곳만 권위 있게 사용하며, 애플리케이션 예외에 request 객체나 Supabase payload를 직접 출력하지 않습니다.

배포 직후 다음 상태를 확인합니다.

```bash
ss -ltnp | grep -E '127\.0\.0\.1:(3000|3001)\b'
systemctl show clickme.service \
  -p MemoryCurrent -p MemoryHigh -p MemoryMax -p TasksCurrent -p TasksMax
journalctl -u clickme.service -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/clickme.error.log
```

`clickme.error.log`는 `crit`만 기록하므로 정상 운영과 일반 upstream 5xx에서는 비어 있을 수 있습니다. 요청 단위 장애 분석은 access JSON의 request ID·정규화 route·status·duration을 사용합니다.

운영 경보 기준은 다음과 같습니다. 기존 monitoring 시스템이 없으면 이 값은 자동 알림이 아니라 운영 점검 기준이며, 알림 수신처를 정한 뒤 host/Cloudflare/Supabase monitoring에 연결해야 합니다.

- 5분 5xx 비율 2% 초과
- API p95 1초 초과
- VM CPU 80% 또는 memory 75% 초과
- Supabase connection 또는 storage 70% 초과
- 평시 대비 origin 요청 또는 분석 행 생성 3배 초과

### 48시간 operational bucket 정리

DB migration은 `cleanup_operational_data(p_before)` RPC를 제공하지만 함수만으로는 예약 실행되지 않습니다. VM의 hourly systemd timer를 설치해 `vote_rate_buckets`와 `analytics_rate_buckets` 중 48시간이 지난 행을 정리합니다. 이는 방문·행동 분석 원본을 삭제하지 않습니다.

스크립트는 service-role key를 저장소나 process argument에 넣지 않고 기존 `clickme.env`에서 읽습니다.

```bash
sudo install -d -m 0750 -o clickme -g clickme /srv/clickme/shared/bin
sudo install -m 0750 -o clickme -g clickme scripts/cleanup-operational-data.sh \
  /srv/clickme/shared/bin/cleanup-operational-data.sh
sudo install -m 0644 scripts/clickme-cleanup.service.example \
  /etc/systemd/system/clickme-cleanup.service
sudo install -m 0644 scripts/clickme-cleanup.timer.example \
  /etc/systemd/system/clickme-cleanup.timer
sudo systemd-analyze verify \
  /etc/systemd/system/clickme-cleanup.service \
  /etc/systemd/system/clickme-cleanup.timer
sudo systemctl daemon-reload
```

처음에는 service를 한 번 수동 실행해 권한과 RPC를 확인한 뒤 timer를 활성화합니다. 응답 본문과 key는 로그에 남지 않고 cutoff 시각만 남습니다.

```bash
sudo systemctl start clickme-cleanup.service
sudo systemctl status clickme-cleanup.service --no-pager
sudo systemctl enable --now clickme-cleanup.timer
systemctl list-timers clickme-cleanup.timer --no-pager
journalctl -u clickme-cleanup.service -n 50 --no-pager
```

timer에는 최대 5분 random delay와 `Persistent=true`를 적용합니다. 일시적인 network/RPC 실패는 non-zero 상태로 남고 다음 hourly 실행에서 다시 시도합니다. timer가 제공되지 않는 환경에서는 Supabase `pg_cron`으로 매시간 `select public.cleanup_operational_data();`를 실행하되 둘을 동시에 운영하지 않습니다.

### 분석 CSV 백업과 수동 삭제

분석 원본은 자동 삭제하지 않습니다. 운영자가 삭제를 결정하면 먼저 캠페인을 `read_only`로 바꾸고 쓰기 요청이 끝난 것을 확인한 뒤 다음 순서를 따릅니다.

1. SQL Editor에서 각 `analytics_*` report view를 캠페인 ID와 KST 날짜로 조회해 CSV로 내보냅니다.
2. CSV별 row 수, 생성 UTC 시각, 캠페인 revision과 SHA-256을 별도 manifest에 적습니다. CSV에도 익명 이용 통계가 있으므로 접근 제한·암호화된 저장소만 사용합니다.
3. private `share-cards` bucket의 해당 캠페인 이미지 목록과 삭제 건수를 확인하고 Storage API 또는 Dashboard로 삭제합니다. bucket은 최초 공유 때 서버의 service-role Storage API가 `public=false`·PNG 전용·512 KiB로 생성 및 검증하므로, public으로 전환하거나 Storage 내부 테이블의 RLS/policy를 직접 변경하지 않습니다.
4. raw 삭제 전후 row 수를 승인 기록에 남긴 뒤, 한 transaction에서 referral FK를 먼저 `null`로 만들고 `analytics_events` → `votes` → `share_links` → `analytics_page_views` → `analytics_sessions` → `analytics_visitors` 순으로 대상 캠페인 행을 삭제합니다.
5. `vote_count_shards`의 익명 합계와 `campaign_settings_history` 감사 기록은 별도 보존 결정을 따릅니다. 원본 삭제 후 report 재조회와 Storage 빈 목록을 확인하고 백업 보관 기한을 기록합니다.

삭제 SQL은 대상 campaign UUID와 승인된 보존 범위에 따라 작성해 transaction 안에서 예상 row 수를 먼저 확인합니다. 예시 UUID를 복사해 실행하거나 production에서 무조건 전체 삭제하는 script는 저장소에 두지 않습니다.

공격 시 순서는 다음으로 고정합니다.

1. 증거 보존: UTC 시각, 5xx/p95, CPU/memory, Supabase 사용량, 정규화 route를 기록합니다. token/IP 원문은 복사하지 않습니다.
2. `protected` 전환: 투표·결과만 유지하고 분석·공유 생성을 중단합니다.
3. 계속 포화되면 `read_only` 전환: 결과 조회만 유지합니다.
4. Cloudflare 운영자에게 Managed DDoS/WAF, rate-limit, connector 상태 점검을 요청합니다.
5. 정상화 후 window 값을 유지한 채 `active`로 복구하고 내부/공개 smoke를 재실행합니다.

캠페인 설정 변경은 공개 endpoint가 아니라 Supabase SQL Editor의 service-role 권한에서만 수행합니다. `null`은 기존 값 유지가 아니라 unbounded 의미이므로 현재 값을 먼저 조회하고 그대로 전달해야 합니다.

```sql
select campaign_id, starts_at, ends_at, mode, revision
from public.campaign_settings;

select * from public.set_campaign_window(
  '<current starts_at>',
  '<current ends_at>',
  'protected',
  'traffic mitigation'
);

select * from public.set_campaign_window(
  '<current starts_at>',
  '<current ends_at>',
  'read_only',
  'incident containment'
);
```

정상화 시 동일한 현재 window와 `active`, 변경 사유를 전달합니다. 모든 변경은 revision과 history에 남습니다.

### Cloudflare 운영자 요청

현재 작업자는 Cloudflare dashboard 권한이 없으므로 다음은 저장소 변경만으로 완료할 수 없습니다.

- Managed DDoS ruleset과 WAF managed rules 활성 여부 확인
- edge rate-limit을 origin 한도와 같거나 더 엄격하게 설정
- Tunnel origin이 계속 `http://127.0.0.1:3000`인지 확인
- stale connector 제거, connector token 회전, 최소 권한 보관
- edge analytics에서 origin 요청량·5xx 경보 연결

Cloudflare limit은 적용 지연이 있을 수 있으므로 edge 설정 후에도 Nginx·앱·DB 제한을 제거하지 않습니다.

## 5. Read-only smoke tests

스모크 테스트는 session, vote, share, analytics 행을 만들지 않습니다.

```bash
# Nginx와 private readiness를 서버 안에서 확인
scripts/smoke-test.sh http://127.0.0.1:3000 internal

# Cloudflare/TLS 포함 확인
scripts/smoke-test.sh https://clickme.madcamp-kaist.org public
```

확인 범위:

- 홈과 보안 header
- DB 정보가 없는 public liveness
- cookie/방문자 정보가 없는 public results와 Nginx cache header
- comments 410, private readiness 404
- `/api/next` 정적 redirect와 no-referrer
- Origin, Content-Type, method guard의 데이터 비생성 실패 응답
- malformed referral token의 DB 이전 404
- 내부 unknown Host 거절
- public HTTP→HTTPS redirect와 port 3000/3001 비노출

부하·DDoS 검증은 production에서 실행하지 않습니다. production data와 분리된 staging에서 100 RPS read, 50 RPS analytics write, 병렬 results cache lock, malformed token, oversized/chunked body, Supabase timeout을 검증합니다.

## 6. Rollback

Nginx 이후 애플리케이션 rollback은 보존된 release를 3001에서 다시 시작하고 readiness 후 link를 되돌립니다. Nginx 설정은 유지할 수 있습니다.

첫 cutover 자체를 되돌릴 때는 순서가 중요합니다.

1. Nginx를 중지해 3000을 비웁니다.
2. 백업한 systemd unit/Compose 설정으로 Next port를 3000으로 복원합니다.
3. Next를 시작하고 `http://127.0.0.1:3000/api/health`를 확인합니다.
4. Tunnel이 직접 Next로 복구됐는지 공개 health를 확인합니다.

```bash
sudo systemctl stop nginx
sudo cp '<reviewed-backup-from-/var/backups>' /etc/systemd/system/clickme.service
sudo systemctl daemon-reload
sudo systemctl restart clickme.service
curl --fail http://127.0.0.1:3000/api/health
```

실제 백업 경로를 확인하지 않고 위 명령을 그대로 실행하지 않습니다. Nginx와 Next가 동시에 3000을 bind하도록 시작하지 않습니다.

## 완료 판정

- migration, lint, typecheck, unit/E2E/build 성공
- Next가 오직 `127.0.0.1:3001`, Nginx가 오직 `127.0.0.1:3000`에 listen
- private readiness와 internal/public read-only smoke 성공
- systemd/Compose resource ceiling 확인
- hourly operational bucket cleanup timer 또는 단일 pg_cron schedule 확인
- Nginx cache·rate-limit·Host/IP header 계약 확인
- port 3000/3001 외부 비노출
- Cloudflare 운영자 항목의 완료 또는 명시적 미완료 기록
- 이전 release와 pre-Nginx 구조 양쪽 rollback 절차 확인
