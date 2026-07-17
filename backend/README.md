# WISH MATCH Backend

NCT WISH 프리퀀시 공동구매 모집글을 검색하고 매칭할 수 있는 REST API 서버입니다. 이 구현은 저장소의 `backend/` 범위만 다루며 프론트엔드는 변경하지 않습니다.

## 기술 스택

Node.js 24 LTS, Express 5, TypeScript 5.9, Zod 4, Prisma ORM 7, Supabase PostgreSQL, `@prisma/adapter-pg`, `jose`, Pino, Vitest/Supertest를 사용합니다. 프로젝트는 ESM입니다.

## 로컬 실행

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run dev
```

API는 기본적으로 `http://localhost:4000`, Swagger UI는 `/api-docs`, 원본 OpenAPI JSON은 `/api-docs.json`에서 확인합니다.

## Supabase와 Prisma 7

`DATABASE_URL`에는 애플리케이션 런타임용 Supabase pooler URL을, `DIRECT_URL`에는 Prisma migration에 사용할 direct URL을 넣습니다. `prisma.config.ts`가 migration CLI에서 `DIRECT_URL`을 사용하고, 런타임은 PostgreSQL driver adapter로 `DATABASE_URL`을 사용합니다.

```bash
npm run prisma:format
npm run prisma:generate
npm run prisma:migrate:dev -- --name initial
npm run prisma:migrate:deploy
npm run prisma:seed
```

Seed는 샘플 매장 3개와 장기 활성 샘플 이벤트 1개를 upsert합니다. 실제 운영 매장 정보가 아닙니다. 비밀번호나 가짜 카카오 사용자는 seed하지 않습니다.

## Kakao Developers 체크리스트

- Kakao Login을 ON으로 설정합니다.
- REST API key와 Client Secret을 발급하고 환경변수에 저장합니다.
- Redirect URI를 `KAKAO_REDIRECT_URI`와 한 글자도 다르지 않게 등록합니다.
- 동의항목은 `profile_nickname`, `profile_image`만 사용합니다.
- 이메일 동의항목은 필요하지 않으며 서버도 요청·저장하지 않습니다.

로그인 시작 시 signed HttpOnly cookie에 10분짜리 OAuth state를 저장하고 콜백에서 constant-time 비교합니다. 카카오 토큰은 프로필 조회에만 사용한 뒤 저장하지 않습니다. 카카오 회원번호는 즉시 문자열로 변환합니다. 로그인 성공 후 서비스 자체 Access JWT와 SHA-256 hash만 DB에 저장하는 회전형 Refresh Session을 발급합니다. signup/login/password API는 존재하지 않습니다.

## 환경변수와 Cookie/CORS

전체 목록은 `.env.example`에 있습니다. `JWT_ACCESS_SECRET`은 최소 64자, `COOKIE_SECRET`은 최소 32자여야 합니다. `CORS_ORIGINS`는 명시적 allowlist이며 `*`는 거부됩니다. 운영은 `COOKIE_SECURE=true`가 필수이고, cross-site cookie에서는 `COOKIE_SAME_SITE=none`과 Secure를 함께 사용해야 합니다. `ADMIN_KAKAO_USER_IDS`에 있는 카카오 회원번호의 사용자는 로그인 시 ADMIN이 됩니다.

## 주요 API

- Kakao 인증과 세션: `/api/v1/auth/kakao/*`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/auth/me`
- 공개 조회: users, stores, events, posts, reviews
- 인증 기능: 모집글 작성/수정/마감/삭제, 후기, 즐겨찾기, 신고
- 관리자: 신고 처리, 사용자 정지/해제, 글 삭제/복구, 매장/이벤트 관리

모든 JSON 응답은 `{ success, data }` 또는 `{ success, error }` 형식이며 목록에는 pagination 정보가 포함됩니다.

## 테스트와 품질 검사

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

테스트는 외부 Kakao API와 운영 Supabase에 연결하지 않도록 구성합니다.

## 배포

Render/Railway 기준 명령은 다음과 같습니다. 애플리케이션 시작 명령에 migration을 섞지 않습니다.

```text
Build: npm ci && npm run prisma:generate && npm run build
Pre-deploy: npm run prisma:migrate:deploy
Start: npm run start
```

Dockerfile은 Node 24 multi-stage, production dependency, non-root 사용자로 동작합니다. reverse proxy 환경에 맞춰 `TRUST_PROXY`를 설정합니다.

## 현재 후기 정책의 한계

현재 참여 신청 모델이 없어 실제 공동구매 참여자였는지는 검증할 수 없습니다. MVP에서는 **마감된 글 + 글 작성자 본인이 아님 + 같은 글에 사용자당 1회** 규칙을 적용합니다. 참여 모델이 추가되면 후기 생성 시 참여 상태 확인을 반드시 추가해야 합니다.
