# clickme DB schema

브라우저는 Supabase에 직접 연결하지 않습니다. Next.js 서버가 service role로만 private RPC를 호출하며 `anon`과 `authenticated`에는 원본 테이블·report view·RPC 실행 권한이 없습니다.

## 익명 식별과 데이터 최소화

- `clickme_visitor`: 서명된 HttpOnly 방문자 UUID cookie. 최대 1년 유지하며 날짜가 바뀌어도 재방문을 연결합니다.
- `visitor_hash`: 방문자 UUID의 HMAC-SHA256. DB에는 이 값만 저장합니다.
- `network_hash`: Nginx가 검증한 client IP의 HMAC-SHA256. 원본 IP는 저장하지 않습니다.
- `clickme_session`: 방문자와 session UUID에 묶인 서명 HttpOnly cookie. DB가 계산한 Asia/Seoul 다음 자정에 정확히 만료되며 sliding 연장하지 않습니다.

원본 IP, 전체 User-Agent, 전체 referrer/query, cookie 원문, 추천 token 원문, 기기 fingerprint, key 입력과 mouse 이동을 저장하지 않습니다. 브라우저·OS·device는 서버에서 범주만 분류합니다. referrer와 UTM source/medium은 고정된 저카디널리티 채널로 바꾸고, UTM campaign/content/term은 HMAC 라벨로만 저장합니다. 언어·시간대·화면 크기도 넓은 범주만 남깁니다.

## 캠페인

### `campaign_settings`

singleton 한 행에 `starts_at`, `ends_at`, `mode(active|protected|read_only)`, `revision`, `updated_at`을 보관합니다. 시작·종료가 `null`이면 해당 방향의 시간 경계가 없습니다. DB 시각이 window 밖이면 공개 상태와 mutation 판단은 즉시 `read_only`가 됩니다.

### `campaign_settings_history`

`set_campaign_window(start,end,mode,reason)` 호출마다 변경 전후 window·mode·revision, actor, 사유를 기록합니다. RPC는 service role만 실행할 수 있고 공개 관리자 endpoint는 없습니다.

## 방문 분석

| 테이블 | 역할과 핵심 제약 |
| --- | --- |
| `analytics_visitors` | campaign별 visitor HMAC, 최초·최근 방문, 최초 유입, 최초 외부 추천, 고정 CTA variant |
| `analytics_sessions` | KST 일일 session; `(campaign_id, visitor_hash, session_date)` unique, 다음 자정 `expires_at` |
| `analytics_page_views` | 진입/refresh/tab별 UUID, 누적 visible/active, scroll, 화면 구간, 해당 landing 추천 |
| `analytics_events` | client UUID primary key, 제한 enum과 최대 2KiB 허용 properties |
| `analytics_rate_buckets` | session/network heartbeat/event 고정 window 운영 counter |

같은 날 1,000개의 동시 bootstrap이 와도 unique constraint와 atomic upsert로 일일 session은 한 행만 생깁니다. 실제 진입마다 클라이언트가 새 page view UUID를 만들고 네트워크 재시도에는 같은 UUID를 재사용하므로 응답 유실을 새 진입으로 중복 기록하지 않습니다. `protected`에서는 투표 인증에 필요한 최소 visitor/session/page-view row만 만들고 UTM·device·referral 상세값은 쓰지 않습니다.

Heartbeat는 누적값과 sequence를 받습니다. 중복·역순·비정상 미래 sequence, 감소값은 쓰지 않습니다. 서버 경과시간으로 delta를 상한 처리하고 session의 `last_accounted_at`을 잠가 여러 tab의 겹친 활성 시간을 중복 합산하지 않습니다.

Event는 batch당 최대 20건·16KiB, KST 일일 session당 500건입니다. 이름별 필수 속성 key 집합과 값 범위를 정확히 검사하며, client event UUID가 primary key라 batch를 반복해도 한 행만 남습니다.

## 투표와 고정 비용 결과

### `votes`

유효 click마다 한 행을 저장합니다. `campaign_id`, `session_id`, `page_view_id`, `request_id`, `visitor_hash`, `network_hash`, `choice`, `created_at`을 가지며 `(visitor_hash, request_id)` unique입니다. 같은 UUID 재시도는 원래 결과를 반환하고 새 표를 만들지 않습니다.

### `vote_rate_buckets`

network HMAC별 고정 UTC 1초 counter입니다. `cast_vote` transaction이 atomic upsert로 15번째까지 허용하고 이후 `network_vote_rate_limited`를 발생시킵니다. 거절 transaction은 vote나 shard를 남기지 않습니다.

### `vote_count_shards`

campaign의 `dip`, `pour`마다 shard 0..31을 미리 만듭니다. `cast_vote`가 rate 검사, vote insert, 한 shard 증가를 한 transaction에서 실행합니다. `get_public_vote_results`는 고정 64행만 합산하므로 `votes` 전체 크기와 무관합니다.

## 공유와 추천

`share_links`는 creator visitor/session/page view, UUID idempotency key, token SHA-256, 선택과 당시 득표 snapshot, parent share, private PNG path를 저장합니다. URL에는 128-bit base64url token을 쓰지만 DB에는 hash만 저장합니다.

- 동일 `(campaign, creator, idempotency_key)`는 기존 link를 반환합니다.
- 분당 10건·KST 하루 50건을 visitor advisory lock 아래 검사합니다.
- 성공 vote와 유효 일일 session이 있어야 생성됩니다.
- 자기 추천은 visitor HMAC으로 표시·제외하며 동일 IP는 제외 기준으로 쓰지 않습니다.
- 최초 성공 vote 전에 들어온 최초 외부 추천을 `analytics_visitors.initial_referral_share_id`로 고정합니다.
- private `share-cards` Storage에는 `<share_id>.png`만 저장합니다. Supabase가 소유한 Storage schema는 DB migration으로 변경하지 않으며, 서버 service-role Storage API가 최초 공유 때 bucket을 생성·검증합니다(`public=false`, PNG만, 512 KiB). 브라우저에는 Storage credential이나 public URL을 제공하지 않습니다.
- PNG는 link 생성 transaction이 성공한 직후 한 번만 렌더링합니다. 생성 또는 저장이 실패한 link는 이미지 요청 때 재렌더링하지 않습니다.

`/r/[token]`과 image route는 22자 base64url 형식을 먼저 검사합니다. 잘못된 형식은 RPC를 호출하지 않습니다. 실제 추천 landing이 렌더되면 token hash에 묶인 짧은 수명의 서명 receipt를 발급하고, 최초 session bootstrap은 이를 검증한 뒤에만 추천 귀속을 기록합니다. 응답 유실 재시도에는 같은 receipt를 쓸 수 있고, 성공 뒤 자정 갱신은 비귀속 page view로 진행합니다.

## RPC와 모드

| RPC | 역할 |
| --- | --- |
| `bootstrap_daily_session` | DB KST 날짜/자정 계산, 일일 session upsert, page view insert |
| `record_analytics_heartbeat` | sequence·경과시간 검증과 중복 tab 시간 상한 |
| `record_analytics_events` | batch/rate/property/UUID 멱등 검증 |
| `cast_vote` | 캠페인·session·rate·멱등·vote·shard atomic 처리 |
| `get_public_vote_results` | 64 shard 합계와 공개 캠페인 상태 |
| `create_share_link` | vote/session 확인, idempotency와 추천 snapshot |
| `resolve_share_link` | token hash 기반 private lookup |
| `cleanup_operational_data` | 48시간보다 오래된 vote/analytics rate bucket 삭제 |

`active`는 전체 기능, `protected`는 투표와 공개 결과만, `read_only` 또는 window 밖은 공개 결과만 허용합니다. 변경 RPC는 DB 설정을 같은 transaction에서 읽으므로 앱 cache나 재시작 없이 다음 mutation부터 적용됩니다.

## 보고서

service-role 전용 view는 다음을 제공합니다.

- `analytics_daily_funnel`: KST 일별 신규/재방문, page view, 당일 재진입, vote/share
- `analytics_acquisition`: UTM/referrer별 방문·성공 vote와 전환율
- `analytics_engagement`: active time p50/p75, scroll, engaged session
- `analytics_retention`: 첫 방문 cohort D+1/D+2
- `analytics_referral_funnel`: link·외부 landing·최초 추천 고정 귀속·성공 vote
- `analytics_cta_experiment`: visitor 고정 CTA variant별 vote/share/referral
- `analytics_data_quality`: session/page 연결률, client 오류 event, heartbeat 누락, shard 일치

CSV는 SQL Editor에서 이 view를 조회해 내보냅니다. 별도 관리자 dashboard나 `/api/me/summary`는 없습니다.

## 정리와 legacy 댓글

`cleanup_operational_data()`는 `vote_rate_buckets`와 `analytics_rate_buckets`만 정리합니다. VM의 hourly timer 또는 하나의 `pg_cron` schedule 중 하나로 실행합니다. 상세 분석 원본은 자동 만료하지 않으며 운영 후 CSV 백업과 Supabase 수동 삭제 절차를 따릅니다.

이전 migration의 `comments`, `comment_attempts`와 관련 함수는 schema 호환을 위해 남아 있을 수 있지만 현재 애플리케이션은 읽거나 쓰지 않습니다. Nginx와 Next의 `/api/comments`는 모두 고정 `410`입니다.
