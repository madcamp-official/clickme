# 사용자가 직접 해야 할 일

코드에서 자동으로 처리할 수 없는 외부 서비스 및 비밀값 설정만 정리했습니다.

1. Supabase에서 PostgreSQL 프로젝트를 생성하고 `.env`의 `DATABASE_URL`에는 pooler/runtime URL, `DIRECT_URL`에는 migration용 direct URL을 입력합니다. 비밀번호에 특수문자가 있으면 URL encode가 필요합니다.
2. Kakao Developers에서 애플리케이션을 생성한 뒤 **카카오 로그인 ON**, REST API 키와 Client Secret 활성화, `KAKAO_REDIRECT_URI`의 정확한 등록을 완료합니다.
3. Kakao 동의항목은 `profile_nickname`, `profile_image`만 설정합니다. 이메일·전화번호·생일·성별·연령대 권한은 요청하지 않습니다.
4. 64자 이상의 무작위 `JWT_ACCESS_SECRET`과 32자 이상의 무작위 `COOKIE_SECRET`을 생성해 `.env`에 넣습니다. 실제 키나 비밀값은 커밋하지 않습니다.
5. 실제 프론트엔드 주소에 맞춰 `CORS_ORIGINS`, `FRONTEND_AUTH_SUCCESS_URL`, `FRONTEND_AUTH_FAILURE_URL`을 설정합니다. 여러 origin은 쉼표로 구분합니다.
6. 프론트/백엔드가 서로 다른 사이트이면 HTTPS에서 `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`를 사용합니다. 운영 환경은 항상 `COOKIE_SECURE=true`여야 합니다.
7. 관리자 권한을 부여할 실제 카카오 회원번호를 `ADMIN_KAKAO_USER_IDS`에 쉼표로 구분해 넣습니다. 해당 사용자가 처음 카카오 로그인할 때 ADMIN이 됩니다.
8. 실제 DB에 `npm run prisma:migrate:deploy`를 실행한 후 필요할 때만 `npm run prisma:seed`를 실행합니다. seed 매장과 이벤트는 샘플이며 운영 실데이터가 아닙니다.
9. Render/Railway 등 배포 서비스에 `.env`의 값을 secret 환경변수로 등록하고 Build/Pre-deploy/Start 명령을 README대로 설정합니다.

현재 로컬 환경에는 Node.js/npm이 설치되어 있지 않아 의존성 설치와 실행 검증을 할 수 없는 경우, Node.js 24 LTS 설치 후 `npm install && npm run check`를 실행해야 합니다.
