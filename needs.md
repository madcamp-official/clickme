# 운영자가 완료해야 할 작업

비밀값, Supabase key, database URL, Tunnel token, SSH private key를 이 문서나 채팅에 붙여 넣지 마세요. 저장소 구현만 완료된 상태이며 아래 항목은 라이브 외부 상태를 바꾸므로 운영자 확인이 필요합니다.

## 1. Supabase migration

대상 project와 backup을 확인한 뒤 [20260716005000 migration](supabase/migrations/20260716005000_add_campaign_analytics_and_security.sql)을 먼저 적용합니다.

```bash
npx supabase db push --dry-run
npx supabase db push
```

적용 후 SQL Editor에서 `campaign_settings` window/mode와 64개 `vote_count_shards`를 확인합니다. 운영 날짜를 예시에서 복사하지 말고 승인된 실제 시각을 `set_campaign_window`로 설정합니다.

## 2. 첫 Nginx cutover

현재 라이브는 Next.js가 127.0.0.1:3000에 직접 연결된 상태입니다. 저장소의 Nginx/systemd 파일은 아직 설치되지 않았습니다.

운영 점검 시간에 다음 순서로 처음 한 번 전환합니다.

1. 기존 systemd unit과 release를 별도 backup
2. Next.js를 `127.0.0.1:3001`로 시작
3. `http://127.0.0.1:3001/api/ready` 확인
4. 검증한 Nginx를 `127.0.0.1:3000`에서 시작
5. internal smoke 후 public smoke 실행
6. 외부에서 3000/3001이 직접 열리지 않았는지 확인

정확한 설치·rollback 명령은 [DEPLOYMENT.md](DEPLOYMENT.md)를 따릅니다. 첫 cutover 전에는 `scripts/deploy-kaist.sh`가 의도적으로 중단됩니다.

## 3. Operational cleanup timer

`clickme-cleanup.service`와 `clickme-cleanup.timer` 예시를 설치하고 service를 한 번 수동 검증한 다음 timer를 활성화합니다. 이 작업은 48시간이 지난 vote/analytics rate bucket만 지우며 상세 분석 원본은 지우지 않습니다.

```bash
sudo systemctl start clickme-cleanup.service
sudo systemctl enable --now clickme-cleanup.timer
systemctl list-timers clickme-cleanup.timer --no-pager
```

Supabase `pg_cron`을 대신 사용한다면 VM timer와 중복 실행하지 않습니다.

## 4. Cloudflare/Tunnel 운영자 요청

Madcamp 관리 API나 Cloudflare dashboard의 비밀값이 있는 운영자가 다음을 확인해야 합니다.

- `clickme.madcamp-kaist.org` upstream이 계속 `http://127.0.0.1:3000`인지
- Managed DDoS와 WAF managed rules 활성 여부
- edge rate-limit과 origin 한도의 정합성
- stale Tunnel connector 제거와 connector token 회전
- origin request/5xx 급증 경보 연결

관리 API 문서에 없는 connector 삭제·token 회전 endpoint를 추측해서 호출하지 않습니다. 권한이 없으면 운영 담당자에게 요청하고 완료 상태만 기록합니다.

## 5. 개인정보·모니터링·백업

- `/privacy`의 운영 주체와 실제 문의 채널을 채우고 출시 전 법률 검토
- Supabase SQL view의 CSV backup 위치·접근권한·수동 삭제 책임자 지정
- 5xx/p95/CPU/memory/Supabase 사용량/origin 3배 증가 경보 수신처 지정
- staging에서만 read 100 RPS, analytics write 50 RPS와 공격 부하 검증

## 6. 형상 관리

현재 `/root/clickme`는 Git 저장소가 아닙니다. 공식 원격 저장소를 연결하기 전에 `.env.local`, 운영 env, key/token, 개인키와 생성된 build/test 산출물이 추적되지 않는지 확인합니다. 검증된 release를 commit한 뒤부터 commit 기반 배포·rollback 흐름을 사용합니다.
