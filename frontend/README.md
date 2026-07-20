# WISH MATCH Frontend

Vite, React, TypeScript 기반의 WISH MATCH 웹 클라이언트입니다. 카카오 로그인과 모집·찜·참여·후기·신고·구매 요청·프로필 흐름을 `backend/` REST API와 연결합니다.

## 로컬 실행

백엔드를 먼저 `http://localhost:4000`에서 실행한 다음 프론트를 시작합니다.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`이며 `/api` 요청을 `http://localhost:4000`으로 프록시합니다. `VITE_API_BASE_URL`을 비워두면 이 same-origin 프록시를 사용합니다.

## 환경변수

- `VITE_API_BASE_URL`: 운영에서 사용할 백엔드 origin. 예: `https://api.example.com`. 로컬 개발에서는 빈 값 권장.

카카오 OAuth 성공/실패 리다이렉트는 각각 `/auth/callback/success`, `/auth/callback/failure`이며 Vite 또는 배포 호스트가 SPA fallback을 제공해야 합니다.

홈의 공식 매장찾기와 모집 작성의 매장 선택기는 백엔드의 실제 메가MGC커피 매장 데이터를 사용합니다. 지역별 개수, 매장명·시군구·주소 검색, 전화 및 카카오맵 연결을 제공합니다.

구매 요청의 메뉴 선택기는 먼저 고른 매장에서 현재 판매하는 공식 메뉴만 불러옵니다. 사용자 화면에는 내부 판매 상태를 표시하지 않으며, 관리자는 마이페이지의 관리자 대시보드에서 운영 지표와 안전한 읽기 전용 DB 데이터를 확인하고 매장별 메뉴 판매 여부를 변경할 수 있습니다.

구매 요청이 수락되거나 내 모집글에 새 참여가 생기면 DB에 알림이 저장되고, 상단 종 배지와 알림 화면에서 읽음 상태 및 관련 글 이동을 지원합니다.

## 품질 검사

```bash
npm run typecheck
npm run build
npm run check
```

모집 대표 사진은 현재 외부 HTTPS 이미지 URL을 사용합니다. 프로필 사진은 브라우저에서 정사각형으로 자르고 용량을 줄인 뒤 전용 백엔드 API로 업로드하며, 마이페이지에서 기본 이미지로 되돌릴 수 있습니다.
