# clickme

탕수육 `부먹 vs 찍먹`을 반복해서 누르고 실시간 결과를 공유하는 Next.js 서비스입니다. 운영 기간은 코드에 고정하지 않으며 Supabase의 단일 캠페인 설정으로 즉시 연장·단축·보호·읽기 전용 전환할 수 있습니다.

프로덕션 주소: `https://clickme.madcamp-kaist.org/`

## 주요 기능

- 80ms 간격 반복 투표와 30건 클라이언트 큐 상한, 과속 확인 모달
- UUID 투표 요청의 DB 멱등 처리와 network HMAC 기준 초당 최대 15표
- KST 날짜별 일일 세션, 진입별 page view, 누적 heartbeat와 제한된 semantic event
- 결과 카드, Web Share/링크 복사/PNG 저장, 128-bit 익명 추천 링크
- 최초 외부 추천 링크의 고정 전환 귀속과 방문자 단위 고정 CTA A/B 실험
- `active`, `protected`, `read_only` 캠페인 모드와 변경 감사 이력
- 32개×2 선택지 count shard를 이용한 고정 비용 결과 집계
- 원본 IP·전체 UA/referrer/query·쿠키/추천 token 원문을 저장하지 않는 분석 스키마
- Nginx endpoint 제한, 정확한 Origin/Fetch Metadata/CSRF, streaming body 상한과 앱 DB 동시성 상한

`GET /api/me/summary`, 로그인, Web Push, 이메일·정기 알림, 종료 countdown은 구현하지 않습니다. 댓글 endpoint는 모든 요청에 `410 COMMENTS_DISABLED`를 반환합니다.

## 기술 구성

- Next.js 16, React 19, TypeScript
- Supabase Postgres와 private Storage
- Sharp 기반 1200×630 공유 PNG
- Vitest, Playwright
- Node.js 24 standalone image, Nginx, systemd 또는 Docker Compose

## 로컬 실행

Node.js 24 이상이 필요합니다.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

필수 runtime 값은 다음과 같습니다. 실제 값은 저장소에 commit하지 않습니다.

- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- `VISITOR_HASH_SECRET` — 32바이트 이상, release 사이에서 유지
- `SUPABASE_DB_URL` — migration shell 전용이며 production runtime에 넣지 않음

검증 명령:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## API

| Method | Path | 용도 |
| --- | --- | --- |
| `GET` | `/api/health` | DB를 조회하지 않는 공개 liveness |
| `GET` | `/api/ready` | localhost:3001 전용 DB readiness |
| `GET` | `/api/results` | 개인 정보나 cookie가 없는 공개 집계와 캠페인 상태 |
| `POST` | `/api/session` | 클라이언트 page-view UUID로 멱등한 KST 일일 세션/page view 생성; DB 기준 시각·남은 TTL·CSRF 반환 |
| `POST` | `/api/vote` | UUID 멱등 반복 투표 |
| `POST` | `/api/analytics/heartbeat` | 누적 노출·활성 시간과 최대 scroll |
| `POST` | `/api/analytics/events` | 최대 20건·16KiB 제한 이벤트 batch |
| `POST` | `/api/shares` | 성공 투표 기반 멱등 추천 링크와 PNG snapshot |
| `GET` | `/r/[token]` | 형식·존재를 검증한 추천 landing |
| `GET` | `/api/share-images/[token].png` | immutable 공유 이미지 |
| `GET\|POST` | `/api/comments` | 사용 중단, 항상 `410` |

모든 mutation은 정확한 운영 Origin, JSON Content-Type, Fetch Metadata를 검사합니다. session 발급 이후에는 서명 session cookie와 `X-Clickme-CSRF`도 필요합니다.
추천 landing은 유효한 `/r/[token]` 렌더 시 서버가 발급한 짧은 수명의 서명 receipt가 있어야 최초 session의 추천 귀속으로 인정됩니다. 성공한 뒤의 일일 session 갱신은 receipt를 재전송하지 않으며, token 원문은 DB나 receipt에 저장하지 않습니다.

## Database와 캠페인 운영

Migration은 `supabase/migrations/`에 있습니다. 새 기능의 기준 migration은 [20260716005000_add_campaign_analytics_and_security.sql](supabase/migrations/20260716005000_add_campaign_analytics_and_security.sql)입니다. 신규 환경에서는 대상 Supabase project를 확인한 뒤 적용합니다.

```bash
npx supabase db push
```

공개 관리자 API나 화면은 없습니다. 운영 기간과 모드는 Supabase SQL Editor에서 service-role 전용 RPC로 변경합니다.

```sql
select * from public.set_campaign_window(
  '2026-07-16 00:00:00+09',
  '2026-07-25 00:00:00+09',
  'active',
  'approved campaign window update'
);
```

예시 날짜를 그대로 사용하지 말고 현재 설정과 승인된 운영 시간을 먼저 확인합니다. `null`은 기간을 무제한으로 둔다는 뜻입니다. 공격 대응은 `protected`(투표·결과만) 후 필요하면 `read_only`(결과만) 순서입니다.

보고서는 service-role 전용 SQL view로 제공합니다.

- `analytics_daily_funnel`, `analytics_acquisition`, `analytics_engagement`
- `analytics_retention`, `analytics_referral_funnel`, `analytics_cta_experiment`
- `analytics_data_quality`

Schema와 데이터 최소화 경계는 [clickme_db_schema.md](clickme_db_schema.md), 개인정보 안내 초안은 `/privacy`를 참고하세요.

## 배포

프로덕션 방어 경계는 다음과 같습니다.

```text
Cloudflare Tunnel
  -> Nginx 127.0.0.1:3000
  -> Next.js 127.0.0.1:3001
  -> Supabase
```

설정 파일 자체만 바꿔서는 다른 서버의 라이브 설정이 바뀌지 않습니다. 이 production 서버에는 아래 적용 현황의 경계가 활성화되어 있으며, 이후 release/cutover·rollback과 Cloudflare 운영자 요청은 [DEPLOYMENT.md](DEPLOYMENT.md)를 따릅니다.

### 운영 적용 현황 — 2026-07-16~17 UTC

- 원격 Supabase에 `20260716005000_add_campaign_analytics_and_security.sql`을 적용했습니다. `campaign_settings`, 일일 KST session/page view, 분석·추천·count-shard RPC, RLS/권한, 보고 view와 operational bucket 정리 RPC가 포함됩니다.
- Supabase가 소유한 `storage` 내부 테이블은 migration으로 수정하지 않습니다. 첫 공유 시 서버의 service-role Storage API가 private `share-cards` bucket을 생성 또는 갱신하고 `public=false`, PNG 전용, 512 KiB 상한을 강제합니다. 적용 시 이 bucket도 동일 권한 경로로 private/PNG-only/512 KiB 상태임을 검증했습니다. 브라우저는 Storage key나 public Storage URL을 받지 않습니다.
- Cloudflare Tunnel의 기존 origin `127.0.0.1:3000`은 유지했습니다. Nginx가 그 포트를 loopback으로만 수신하고, Next.js는 `127.0.0.1:3001`에서만 실행됩니다. 알려지지 않은 Host는 연결 종료하며 `/api/ready`는 Nginx 밖의 localhost에서만 확인할 수 있습니다.
- `clickme.service`는 standalone release 루트의 `server.js`를 실행하며 `MemoryHigh=768M`, `MemoryMax=1G`, `TasksMax=128`, `LimitNOFILE=8192`, 자동 재시작과 systemd sandbox를 적용했습니다.
- `/etc/nginx/conf.d/clickme.conf`은 endpoint별 rate/connection/body 제한, 결과 1초 cache·5초 stale·cache lock, 정규화 로그와 `/api/next`의 edge-only 302를 적용했습니다. Nginx access log는 IP, query, referral token 원문을 쓰지 않습니다.
- `clickme-cleanup.timer`는 활성화되어 최대 5분 jitter를 두고 매시간 `vote_rate_buckets`와 `analytics_rate_buckets`의 48시간 지난 운영 counter만 정리합니다. 분석 원본은 자동으로 삭제하지 않습니다.
- 기존 systemd unit과 release 경로는 서버의 접근 제한 backup 디렉터리에 보존했습니다. DB migration은 transaction으로 적용되며, Cloudflare origin 주소를 바꾸지 않았습니다.

적용 직후 `npm run check`(lint/typecheck/Vitest 23개/build), 내부 smoke, Cloudflare 경유 public smoke를 통과했습니다. smoke는 session·vote·share·analytics 행을 만들지 않으며, 홈/보안 header, 공개 health/results, comments `410`, private readiness 차단, malformed 추천 token, Origin·Content-Type·method guard, static Easter egg redirect, HTTPS redirect와 3000/3001 외부 비노출을 확인합니다.

Cloudflare dashboard의 Managed DDoS/WAF, edge rate-limit, 오래된 Tunnel connector 제거 및 token rotation은 별도 운영자 권한이 필요하며 아직 서버 코드만으로 검증할 수 없습니다. 고부하·DDoS 검증도 production이 아닌 분리된 staging에서 수행해야 합니다.

## 비밀값과 로그

- `.env.local`, 운영 env, DB URL, Supabase key, SSH key를 Git이나 보고서에 넣지 않습니다.
- production 앱은 Nginx가 덮어쓴 `X-Clickme-Client-IP`만 신뢰합니다.
- 로그는 request ID, 정규화 route, status, 시간과 응답 크기만 기록합니다.
- `/r/<token>`과 공유 이미지 path는 로그에서 `:token`으로 치환합니다.
- 분석 원본은 자동 만료하지 않습니다. operational rate bucket만 48시간 뒤 정리하며, 분석 CSV 백업·수동 삭제 절차를 운영자가 관리합니다.
