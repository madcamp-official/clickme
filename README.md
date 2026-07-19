# WISH MATCH

`frontend/` React 클라이언트와 `backend/` Express API로 구성된 카카오 로그인 기반 공동구매 매칭 서비스입니다.

운영 주소: [https://wishmatch.madcamp-kaist.org](https://wishmatch.madcamp-kaist.org)

## 로컬 실행 순서

1. 백엔드 환경변수와 외부 서비스를 설정합니다.

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run prisma:generate
   npm run prisma:migrate:dev
   npm run prisma:seed
   npm run dev
   ```

2. 다른 터미널에서 프론트엔드를 실행합니다.

   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```

3. `http://localhost:5173`에 접속합니다. 개발 중 `/api` 요청은 Vite가 `http://localhost:4000`으로 프록시합니다.

카카오 Developers 설정, PostgreSQL 연결, 쿠키/CORS 운영 설정은 [backend/needs.md](backend/needs.md)에 정리되어 있습니다. API 문서는 백엔드 실행 후 `http://localhost:4000/api-docs`에서 확인할 수 있습니다.

## 전체 검사

```bash
cd backend && npm run check
cd ../frontend && npm run check
```

백엔드의 DB 마이그레이션은 배포 전에 `npm run prisma:migrate:deploy`로 적용해야 합니다.
Nginx, Cloudflare Tunnel, Certbot 운영 절차는 [deploy/README.md](deploy/README.md)를 참고하세요.
