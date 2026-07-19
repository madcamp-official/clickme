# WISH MATCH 백엔드 진행 현황 및 프론트엔드 연동 명세

이 문서는 `backend` 브랜치의 실제 구현을 기준으로 작성한 프론트엔드 연동 계약서입니다. Swagger UI의 전체 스펙은 `/api-docs`, 원본 OpenAPI 문서는 [openapi.yaml](./openapi.yaml)에서 확인할 수 있습니다. 화면 개발 중 모호한 동작은 이 문서와 OpenAPI를 함께 기준으로 삼습니다.

## 1. 현재 진행 현황

구현 완료:

- Express 5 + TypeScript + Prisma 7 기반 REST API
- Kakao OAuth 로그인, OAuth state 검증, HttpOnly cookie 기반 자체 JWT/Refresh Session
- 사용자, 매장, 이벤트, 모집글, 후기, 즐겨찾기, 신고, 관리자 API
- Zod 요청 검증, CORS, Helmet, rate limit, Pino logging, 공통 오류 응답, Swagger
- Supabase PostgreSQL용 schema, 초기 migration, 멱등 sample seed
- Dockerfile, 배포 예시, Vitest/Supertest 테스트

직접 설정이 필요한 항목:

- Supabase의 `DATABASE_URL`, `DIRECT_URL`
- Kakao Developers의 로그인 설정, Client Secret, redirect URI
- 프론트엔드 실제 주소에 맞춘 CORS/cookie 환경변수
- 운영 JWT/Cookie secret 및 관리자 Kakao ID

자세한 외부 설정 목록은 [../needs.md](../needs.md)를 참고합니다. 실제 Supabase DB migration과 Kakao 실계정 로그인은 해당 환경변수가 준비된 뒤 검증합니다.

## 2. 서버 주소와 공통 규칙

개발 기본 주소는 `http://localhost:4000`이며 모든 JSON API의 prefix는 `/api/v1`입니다.

```text
GET http://localhost:4000/api/v1/posts
GET http://localhost:4000/api-docs
```

모든 JSON 요청은 `Content-Type: application/json`을 사용합니다. 날짜/시간 입력은 UTC ISO 8601 문자열을 보냅니다.

```ts
new Date().toISOString();
// "2026-07-17T10:30:00.000Z"
```

성공 응답:

```json
{
  "success": true,
  "data": {}
}
```

페이지 목록 응답:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 0,
      "hasNext": false
    }
  }
}
```

일반 오류 응답:

```json
{
  "success": false,
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "모집글을 찾을 수 없습니다.",
    "details": null,
    "requestId": "..."
  }
}
```

프론트엔드는 `error.code`를 화면 분기용으로 사용하고, `message`는 그대로 toast/폼 오류에 표시할 수 있습니다. `VALIDATION_ERROR`의 `details`는 `{ field, message }[]`입니다. Rate-limit(429) 응답은 `details`와 `requestId`가 없을 수 있으므로 optional로 처리합니다.

## 3. 인증과 쿠키

### 핵심 원칙

- 인증 수단은 **Kakao 로그인만** 존재합니다. 이메일 가입, 이메일/비밀번호 로그인, 비밀번호 재설정 화면을 만들지 않습니다.
- Access JWT와 Refresh Token은 HttpOnly cookie에 저장됩니다. 프론트엔드는 토큰 값을 읽거나 `localStorage`/`sessionStorage`에 저장하지 않습니다.
- API 요청에는 `credentials: "include"`가 필요합니다.
- 인증 미들웨어는 `Authorization: Bearer <token>`을 우선 지원하지만, 웹 프론트는 cookie 인증을 사용하면 됩니다.

권장 fetch 래퍼:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (response.status === 204) return null;
  return response.json();
}
```

`GET` 요청에서 JSON body는 보내지 않습니다. 위 래퍼를 그대로 쓸 경우 필요하면 `Content-Type`을 조건부로 넣어도 됩니다.

### Kakao 로그인 화면 흐름

1. 로그인 버튼은 API를 `fetch`하지 말고 브라우저 전체 이동으로 시작합니다.
2. `GET /api/v1/auth/kakao/start`는 state cookie를 심고 Kakao 인가 화면으로 302 redirect합니다.
3. Kakao callback 성공 시 서버는 access/refresh cookie를 설정하고 `FRONTEND_AUTH_SUCCESS_URL`로 302 redirect합니다.
4. 성공 콜백 페이지에서 `POST /api/v1/auth/refresh`를 호출해 사용자 상태를 복원합니다.
5. 실패 콜백 페이지는 URL query의 `error`를 읽어 안내하고, 재로그인 버튼으로 start URL로 이동시킵니다.

```ts
// 로그인 버튼
window.location.assign(`${API_BASE_URL}/api/v1/auth/kakao/start`);

// 성공 callback 화면 mount 시
const result = await api("/auth/refresh", { method: "POST" });
// result.data.user, result.data.accessExpiresAt을 전역 auth store에 반영
```

성공 redirect URL에는 JWT나 refresh token이 포함되지 않습니다. `code`, `state`도 프론트가 직접 처리하지 않습니다.

### 인증 API

| Method | Path                   | 인증           | 프론트 사용처                             |
| ------ | ---------------------- | -------------- | ----------------------------------------- |
| GET    | `/auth/kakao/start`    | 없음           | Kakao 로그인 버튼의 browser redirect      |
| GET    | `/auth/kakao/callback` | 없음           | Kakao가 호출. 프론트가 직접 호출하지 않음 |
| POST   | `/auth/refresh`        | refresh cookie | 앱 시작/Access 만료 후 세션 회전          |
| POST   | `/auth/logout`         | 선택           | 로그아웃 버튼. 항상 204 처리              |
| GET    | `/auth/me`             | access cookie  | 현재 사용자 재조회                        |

`POST /auth/refresh` 성공 예시:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cm...",
      "nickname": "위시메이트_123456",
      "profileImage": "https://...",
      "role": "USER",
      "rating": 4.5,
      "reviewCount": 2,
      "createdAt": "2026-07-17T00:00:00.000Z"
    },
    "accessExpiresAt": "2026-07-17T00:15:00.000Z"
  }
}
```

로그아웃은 body 없이 호출하고, 204도 성공으로 취급합니다.

```ts
await api("/auth/logout", { method: "POST" });
// 전역 auth store, React Query/SWR user cache를 비운 뒤 홈으로 이동
```

### CORS와 배포 환경

프론트와 API가 다른 origin이면 백엔드 `CORS_ORIGINS`에 프론트 origin을 정확히 넣어야 합니다. 예: `https://wish.example.com`.

- 개발에서 `localhost:3000` ↔ `localhost:4000`은 기본 `SameSite=lax`로 동작할 수 있습니다.
- 서로 다른 사이트(domain)가 cookie를 공유해야 하면 HTTPS에서 `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`가 필요합니다.
- 브라우저 요청에 `credentials: "include"`가 없으면 로그인 cookie가 전송되지 않습니다.
- 인증 실패(401)는 로그인 상태를 비우고 재로그인 화면으로 유도합니다. 정지 사용자(403 + `USER_SUSPENDED`)는 별도 안내를 표시합니다.

## 4. 공용 데이터 타입과 enum

| 타입           | 값                                   |
| -------------- | ------------------------------------ |
| `UserRole`     | `USER`, `ADMIN`                      |
| `UserStatus`   | `ACTIVE`, `SUSPENDED`                |
| `PostStatus`   | `OPEN`, `CLOSED`                     |
| `ReportReason` | `FRAUD`, `NO_SHOW`, `ABUSE`, `OTHER` |
| `ReportStatus` | `PENDING`, `RESOLVED`, `REJECTED`    |

공개 사용자 정보는 `id`, `nickname`, `profileImage`, `rating`, `reviewCount`, `createdAt`입니다. Kakao ID, 세션, 정지 사유는 일반 사용자 UI에 노출되지 않습니다.

모집글의 핵심 필드는 다음과 같습니다.

```ts
type PostStatus = "OPEN" | "CLOSED";

type Post = {
  id: string;
  writerId: string;
  storeId: string;
  eventId: string | null;
  discount: number;
  totalCount: number;
  remainCount: number;
  meetingTime: string;
  availableUntil: string | null;
  meetingPlace: string;
  description: string | null;
  imageUrl: string | null;
  status: PostStatus;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  writer: {
    id: string;
    nickname: string;
    profileImage: string | null;
    rating: number;
    reviewCount: number;
  };
  store: Store;
  event: { id: string; title: string } | null;
  // openChatUrl은 목록에는 없고, 상세에서도 접근 권한이 있을 때만 존재
  openChatUrl?: string;
};
```

## 5. 사용자, 매장, 이벤트 API

### 사용자

| Method | Path                                 | 인증 | 설명                       |
| ------ | ------------------------------------ | ---- | -------------------------- |
| GET    | `/users/:id`                         | 없음 | 공개 프로필                |
| PATCH  | `/users/me`                          | 필요 | 닉네임 변경                |
| PUT    | `/users/me/profile-image`            | 필요 | 프로필 이미지 등록/교체    |
| DELETE | `/users/me/profile-image`            | 필요 | 프로필 이미지를 기본값으로 |
| GET    | `/users/:id/posts?page=1&limit=20`   | 없음 | 작성한 활성 모집글         |
| GET    | `/users/:id/reviews?page=1&limit=20` | 없음 | 받은 후기                  |
| GET    | `/users/me/posts?page=1&limit=20`    | 필요 | 내가 작성한 모집글         |

닉네임 수정 body:

```json
{ "nickname": "새위시메이트" }
```

닉네임은 trim 후 2~20자이며 중복되면 `NICKNAME_ALREADY_EXISTS`(409)입니다. 프로필 이미지는 브라우저에서 256×256 정사각형으로 축소한 JPEG/PNG/WebP data URL을 보내며, 서버는 실제 파일 시그니처와 70KB 제한을 다시 검증합니다. 저장 경로는 `UPLOAD_DIR`, 응답 URL의 기준 origin은 `PUBLIC_BASE_URL`입니다.

### 매장

| Method | Path                                       | 인증 | 설명                    |
| ------ | ------------------------------------------ | ---- | ----------------------- |
| GET    | `/stores?region=&keyword=&page=1&limit=20` | 없음 | 활성 공식 매장 목록/검색 |
| GET    | `/stores/regions`                          | 없음 | 지역별 매장 수           |
| GET    | `/stores/:id`                              | 없음 | 매장 상세               |

`region`은 정확한 지역명 비교, `keyword`는 매장명/시군구/주소 부분 검색입니다. 매장 선택 UI는 ID를 모집글 `storeId`로 사용합니다. `brand`, `phone`, `source`, `sourceUrl`, `lastSyncedAt`으로 공식 데이터 여부와 갱신 시점을 확인할 수 있습니다.

공식 매장은 다음 명령으로 갱신합니다.

```bash
npm run stores:sync
```

원천은 메가MGC커피 공식 매장찾기이며, 응답 수가 비정상적으로 감소하면 기존 데이터를 비활성화하지 않고 작업을 중단합니다.

### 이벤트

| Method | Path                                  | 인증 | 설명        |
| ------ | ------------------------------------- | ---- | ----------- |
| GET    | `/events?active=true&page=1&limit=20` | 없음 | 이벤트 목록 |
| GET    | `/events/:id`                         | 없음 | 이벤트 상세 |

모집글 작성 화면의 이벤트 선택은 선택 사항입니다. 선택하지 않으면 `eventId`를 생략하거나 `null`로 보냅니다.

## 6. 모집글 API

### 목록과 상세

| Method | Path                      | 인증         | 설명                         |
| ------ | ------------------------- | ------------ | ---------------------------- |
| GET    | `/posts`                  | 선택         | 목록, 검색, 정렬, pagination |
| GET    | `/posts/:id`              | 선택         | 상세                         |
| POST   | `/posts`                  | 필요         | 작성                         |
| PATCH  | `/posts/:id`              | 작성자/ADMIN | 수정                         |
| DELETE | `/posts/:id`              | 작성자/ADMIN | soft delete, 204             |
| PATCH  | `/posts/:id/close`        | 작성자/ADMIN | 모집 마감, 멱등              |
| PATCH  | `/posts/:id/remain-count` | 작성자/ADMIN | 남은 수량 변경               |

목록 query:

| Query                        | 형식                                                 | 설명                      |
| ---------------------------- | ---------------------------------------------------- | ------------------------- |
| `region`                     | string                                               | 매장 지역                 |
| `storeId`                    | string                                               | 매장 ID                   |
| `storeName`                  | string                                               | 매장명 부분 검색          |
| `minDiscount`, `maxDiscount` | integer 1~100                                        | 할인율 범위               |
| `minRemainCount`             | integer 0~100                                        | 최소 잔여 수량            |
| `status`                     | `OPEN` / `CLOSED`                                    | 상태                      |
| `eventId`                    | string                                               | 이벤트 ID                 |
| `meetingFrom`, `meetingTo`   | ISO datetime                                         | 모임 시간 범위            |
| `sort`                       | `latest`, `meetingSoon`, `discountHigh`, `remainLow` | 기본 `latest`             |
| `page`, `limit`              | integer                                              | 기본 1/20, limit 최대 100 |

목록 API는 `openChatUrl`을 반환하지 않습니다. 상세 API에서도 비로그인 사용자는 오픈채팅 링크를 볼 수 없습니다. 로그인 사용자는 OPEN 글의 링크를 볼 수 있고, CLOSED 글은 작성자 또는 ADMIN만 볼 수 있습니다. 따라서 상세 페이지에서 `openChatUrl` 존재 여부로 버튼을 렌더링하고, 없으면 “로그인 후 확인 가능” 또는 “마감된 글의 링크는 작성자에게만 공개” 안내를 표시합니다.

### 작성 body

```json
{
  "storeId": "cm-store-id",
  "eventId": "cm-event-id",
  "discount": 20,
  "totalCount": 5,
  "remainCount": 3,
  "meetingTime": "2026-07-20T10:00:00.000Z",
  "availableUntil": "2026-07-20T13:00:00.000Z",
  "meetingPlace": "강남역 10번 출구",
  "openChatUrl": "https://open.kakao.com/o/example",
  "description": "함께 구매하실 분 구합니다.",
  "imageData": "data:image/jpeg;base64,/9j/..."
}
```

작성/수정 폼 제약:

- `discount`, `totalCount`: 정수 1~100
- `remainCount`: 정수 0~100 및 `totalCount` 이하
- `meetingTime`: 미래 시각만 허용
- `meetingPlace`: trim 후 1~300자
- `openChatUrl`: 반드시 `https://open.kakao.com/...` (유사 도메인 불가)
- `description`: 선택, 최대 2,000자
- `imageData`: 선택, JPG/PNG/WEBP data URL, 최대 430,000자(서버 저장 파일은 320KB 이하)
- 응답의 `imageUrl`은 서버에 저장된 대표 사진 주소입니다. 수정 시 `{ "imageUrl": null }`을 보내면 기존 사진을 삭제합니다.
- `remainCount=0`이면 자동으로 `CLOSED`가 됩니다.

수정은 위 필드를 일부만 보낼 수 있습니다. 마감 버튼은 `PATCH /posts/:id/close` body 없이 호출합니다. 수량 스테퍼는 다음 body를 사용합니다.

```json
{ "remainCount": 0 }
```

삭제는 서버에서 soft delete합니다. 삭제된 글은 일반 목록/상세에서 보이지 않으므로 프론트는 삭제 성공 후 목록 cache를 갱신하고 이전 화면으로 이동합니다.

## 7. 후기, 즐겨찾기, 신고 API

### 후기

| Method | Path                                     | 인증 | 설명                    |
| ------ | ---------------------------------------- | ---- | ----------------------- |
| POST   | `/reviews`                               | 필요 | 후기 작성               |
| GET    | `/reviews/me?page=1&limit=20`            | 필요 | 내가 작성한 후기        |
| GET    | `/reviews/users/:userId?page=1&limit=20` | 없음 | 특정 사용자가 받은 후기 |

```json
{
  "postId": "cm-post-id",
  "rating": 5,
  "content": "약속을 잘 지켜주셨어요."
}
```

후기는 내용 10~500자이며, 마감(`CLOSED`) 글에 대한 확정(`CONFIRMED`) 참여 기록이 있는 사용자만 작성할 수 있습니다. 작성자 본인에게는 작성할 수 없고 글당 1회입니다. 서버는 판매자를 글 작성자로 결정하므로 클라이언트가 `sellerId`를 보내지 않습니다. 후기 제출 성공 후 판매자의 `rating`, `reviewCount`가 서버 transaction 안에서 갱신됩니다.

### 즐겨찾기

| Method | Path                         | 인증 | 설명             |
| ------ | ---------------------------- | ---- | ---------------- |
| POST   | `/posts/:postId/favorite`    | 필요 | 추가, 멱등       |
| DELETE | `/posts/:postId/favorite`    | 필요 | 삭제, 멱등       |
| GET    | `/favorites?page=1&limit=20` | 필요 | 내 즐겨찾기 목록 |

좋아요 버튼은 요청 성공 시 즉시 UI를 반영해도 됩니다. 추가/삭제 모두 멱등이므로 이미 추가/삭제된 상태에서 재시도해도 오류로 취급하지 않습니다. 삭제된 모집글은 즐겨찾기에 추가할 수 없습니다.

### 참여와 구매 요청

| Method | Path                                 | 인증 | 설명                       |
| ------ | ------------------------------------ | ---- | -------------------------- |
| POST   | `/posts/:postId/participations`      | 필요 | 참여 생성과 남은 수량 차감 |
| GET    | `/participations/me?page=1&limit=20` | 필요 | 내 참여 목록               |
| DELETE | `/participations/:id`                | 필요 | 참여 취소와 수량 복원      |
| GET    | `/purchase-requests?page=1&limit=20` | 필요 | 구매 요청 목록             |
| POST   | `/purchase-requests`                 | 필요 | 구매 요청 작성             |
| GET    | `/purchase-requests/:id`             | 필요 | 구매 요청 상세             |
| POST   | `/purchase-requests/:id/accept`      | 필요 | 구매 요청 수락             |
| DELETE | `/purchase-requests/:id`             | 필요 | 구매 요청 취소             |
| GET    | `/inquiries?page=1&limit=20`         | 필요 | 내 문의 목록               |
| POST   | `/inquiries`                         | 필요 | 문의 접수                  |

참여 생성은 수량 차감과 같은 트랜잭션에서 처리됩니다. 구매 요청 목록은 오픈채팅 URL을 제외하며 상세에서도 요청자 또는 수락자에게만 URL을 반환합니다.

### 신고

| Method | Path       | 인증 | 설명        |
| ------ | ---------- | ---- | ----------- |
| POST   | `/reports` | 필요 | 모집글 신고 |

```json
{
  "targetPostId": "cm-post-id",
  "reason": "FRAUD",
  "detail": "입금 후 연락이 되지 않습니다."
}
```

`reason`은 `FRAUD`, `NO_SHOW`, `ABUSE`, `OTHER`입니다. `OTHER`에는 1~1,000자의 `detail`이 필수입니다. 본인 글 신고와 동일 글/동일 사유의 중복 신고는 서버가 차단합니다. 신고 버튼은 1시간 단위 rate limit이 있으므로 429 시 재시도 대기 안내를 표시합니다.

## 8. 관리자 API와 관리자 화면

관리자 API는 모두 로그인 + ACTIVE 사용자 + `role=ADMIN`을 요구합니다. 프론트는 `/auth/refresh` 또는 `/auth/me`의 `data.role`이 `ADMIN`일 때에만 관리자 메뉴를 노출하되, 실제 권한 확인은 항상 서버가 수행합니다.

| 기능             | Method / Path                                          | 주요 입력                                                        |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| 신고 목록        | `GET /admin/reports?status=&page=&limit=`              | status: `PENDING`, `RESOLVED`, `REJECTED`                        |
| 신고 상세        | `GET /admin/reports/:id`                               | -                                                                |
| 신고 처리        | `PATCH /admin/reports/:id`                             | status는 `RESOLVED` 또는 `REJECTED`, adminNote 필요              |
| 사용자 목록      | `GET /admin/users?status=&role=&keyword=&page=&limit=` | status, role, nickname keyword                                   |
| 사용자 정지      | `PATCH /admin/users/:id/suspend`                       | `{ reason }`                                                     |
| 사용자 정지 해제 | `PATCH /admin/users/:id/unsuspend`                     | `{ reason?: string }`                                            |
| 게시글 목록      | `GET /admin/posts?deleted=&page=&limit=`               | deleted: boolean                                                 |
| 게시글 삭제      | `DELETE /admin/posts/:id`                              | `{ reason }`                                                     |
| 게시글 복구      | `PATCH /admin/posts/:id/restore`                       | `{ reason?: string }`                                            |
| 매장 생성        | `POST /admin/stores`                                   | name, region, address, latitude?, longitude?                     |
| 매장 수정        | `PATCH /admin/stores/:id`                              | 변경할 매장 필드                                                 |
| 이벤트 생성      | `POST /admin/events`                                   | title, startDate, endDate, description?, bannerImage?, isActive? |
| 이벤트 수정      | `PATCH /admin/events/:id`                              | 변경할 이벤트 필드                                               |
| 이벤트 삭제      | `DELETE /admin/events/:id`                             | -                                                                |

관리자 form 제약:

- 정지/삭제 사유: 1~1,000자
- 이벤트 `startDate < endDate`
- 매장 이름/지역/주소: 각각 최대 100/100/300자
- 좌표: latitude -90~~90, longitude -180~~180
- 자기 자신의 정지 요청은 서버가 거부합니다.

모든 관리자 변경은 `AdminActionLog`에 기록됩니다. 관리자 UI가 별도 action log API를 필요로 한다면 현재는 제공하지 않으므로 새 API 요청이 필요합니다.

## 9. 화면별 연동 가이드

| 화면/기능           | 초기 요청                                | 사용자 액션                                                 |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| 앱 부트스트랩       | `POST /auth/refresh`                     | 401이면 guest 상태                                          |
| 로그인              | 없음                                     | browser redirect로 `/auth/kakao/start` 이동                 |
| Kakao 성공 callback | `POST /auth/refresh`                     | user store 설정 후 홈 이동                                  |
| 게시글 목록         | `GET /posts`                             | 필터/정렬/페이지 변경 시 query 재요청                       |
| 게시글 상세         | `GET /posts/:id`                         | 작성자면 수정/마감/삭제, 일반 로그인 사용자는 즐겨찾기/신고 |
| 게시글 작성         | `GET /stores`, `GET /events?active=true` | `POST /posts`                                               |
| 내 프로필           | `GET /auth/me`                           | 닉네임 수정, 프로필 이미지 등록/삭제                        |
| 다른 사용자 프로필  | `GET /users/:id`                         | 작성글/후기 목록 조회                                       |
| 후기 관리/작성      | 참여 목록 + `GET /reviews/me`            | 마감된 확정 참여 건에 `POST /reviews`                       |
| 즐겨찾기            | `GET /favorites`                         | 추가/삭제 API 호출                                          |
| 관리자              | `role === "ADMIN"` 확인                  | `/admin/*` API 사용                                         |

추천 상태 처리:

- `401`: 로그인 필요. auth store를 guest로 비우고 로그인 유도.
- `403`: 권한 없음, 정지됨, 작성자 전용 동작 등. `error.code`에 따라 메시지 분기.
- `404`: 삭제되었거나 존재하지 않는 리소스. 목록으로 돌아가기.
- `409`: 닉네임/후기/신고 중복. 현재 form을 유지하고 오류 표시.
- `400 VALIDATION_ERROR`: `details[].field`를 폼 field error로 연결.
- `429`: “요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.” 안내.

## 10. 프론트엔드에서 만들지 않을 기능

백엔드에 없는 경로를 임의로 호출하거나 UI를 노출하지 않습니다.

- 이메일 회원가입
- 이메일/비밀번호 로그인
- 비밀번호 재설정
- Kakao 이메일/전화번호/생일/성별/연령대 수집 및 표시
- 프론트의 Kakao access/refresh token 저장
- 게시글 제목 필드 (현재 모집글 모델에는 제목이 없음)
- 참여 신청/참여자 인증 기능
- 관리자 action log 조회 화면

위 기능이 제품 요구사항으로 추가되면 API/DB schema를 먼저 확장해야 합니다.

## 11. 프론트엔드 환경변수 예시

```dotenv
# Next.js 예시
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

백엔드 `.env`의 개발 설정 예시:

```dotenv
CORS_ORIGINS=http://localhost:3000
FRONTEND_AUTH_SUCCESS_URL=http://localhost:3000/auth/callback/success
FRONTEND_AUTH_FAILURE_URL=http://localhost:3000/auth/callback/failure
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

운영에서는 실제 HTTPS URL을 사용하고 `COOKIE_SECURE=true`로 바꿉니다. 서로 다른 사이트 간 cookie 인증이 필요하면 `COOKIE_SAME_SITE=none`도 함께 설정합니다.

## 12. 백엔드 담당자에게 전달할 때 필요한 정보

다음 변경은 프론트만으로 해결할 수 없으므로 API 확장 요청으로 전달합니다.

- 참여 신청/취소/참여자 목록 및 참여 검증
- 모집글 제목, 다중 이미지 업로드, 이미지 저장소 정책
- 관리자 action log 조회
- 알림, 채팅, 신고 처리 결과 알림
- 사용자 탈퇴/계정 연결 해제
- 정렬 기준 추가, cursor pagination, 검색 전문화

문서와 실제 API가 다르게 보이면 Swagger의 `/api-docs.json`과 백엔드 route를 우선 확인하고, 차이는 issue로 남깁니다.
