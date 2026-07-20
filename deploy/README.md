# WISH MATCH 배포

운영 도메인은 `https://wishmatch.madcamp-kaist.org`이며 Cloudflare Tunnel이
`http://127.0.0.1:3000`의 Nginx로 요청을 전달합니다. Nginx는 정적 프론트엔드를 제공하고
`/api` 요청을 `http://127.0.0.1:4000`의 백엔드로 프록시합니다.

## 프론트엔드 재배포

```bash
cd /root/clickme/frontend
npm run check
install -d -o www-data -g www-data /var/www/wishmatch
cp -a dist/. /var/www/wishmatch/
chown -R www-data:www-data /var/www/wishmatch
nginx -t && systemctl reload nginx
```

## Nginx 설정

최초 설치 시 인증서 경로가 아직 없으므로 `nginx/wishmatch-bootstrap.conf`를 먼저
`/etc/nginx/sites-available/wishmatch`에 설치하고 활성화합니다. 아래 Certbot 명령으로
인증서를 발급한 뒤 `nginx/wishmatch.conf`로 교체하고 Nginx를 다시 불러옵니다.

## TLS 인증서

Let's Encrypt 인증서는 webroot 방식으로 발급되며 Certbot systemd timer가 자동 갱신합니다.

```bash
certbot certonly --webroot --webroot-path /var/www/wishmatch \
  --domain wishmatch.madcamp-kaist.org --agree-tos
certbot renew --dry-run --no-random-sleep-on-renew
```

Cloudflare가 공개 HTTPS 연결을 종료하고 터널 구간을 암호화하며, 서버의 Nginx 443 리스너에도
동일 도메인의 Let's Encrypt 인증서를 적용합니다.

## 백엔드 서비스

`systemd/wishmatch-backend.service`를 `/etc/systemd/system/`에 설치한 뒤 다음과 같이 활성화합니다.

```bash
cd /root/clickme/backend
npm run prisma:migrate:deploy
npm run stores:sync
npm run menus:sync
npm run build
install -d -m 0750 /var/lib/wishmatch/uploads/profiles /var/lib/wishmatch/uploads/posts
systemctl daemon-reload
systemctl enable --now wishmatch-backend
```

현재 서버는 로컬 PostgreSQL 14의 `wish_match` 데이터베이스를 사용합니다. 운영 배포 전후에는
`npm run prisma:migrate:deploy`를 실행하고 `systemctl status postgresql wishmatch-backend`로
DB와 API 상태를 함께 확인합니다. DB 접속 비밀번호는 Git에 포함되지 않는 `backend/.env`에만 둡니다.
프로필 및 모집 대표 사진은 `/var/lib/wishmatch/uploads`에 영속 저장되므로 이 디렉터리도 백업 대상에 포함합니다.

## 공식 매장·메뉴 자동 동기화

`systemd/wishmatch-store-sync.service`와 `.timer`를 `/etc/systemd/system/`에 설치하면 매주 공식 매장과 전체 메뉴 데이터를 갱신합니다. 매장 응답이 4,000개 미만이거나 메뉴 응답이 180개 미만이거나 요청이 실패하면 해당 동기화는 기존 활성 데이터를 유지한 채 실패합니다.

새 공식 메뉴는 모든 매장에서 기본 판매 상태로 취급됩니다. 관리자가 특정 매장에서 판매하지 않는 메뉴만 관리자 화면에서 해제하며, 이 예외 설정은 다음 공식 동기화 후에도 유지됩니다.

```bash
systemctl daemon-reload
systemctl enable --now wishmatch-store-sync.timer
systemctl list-timers wishmatch-store-sync.timer
```
