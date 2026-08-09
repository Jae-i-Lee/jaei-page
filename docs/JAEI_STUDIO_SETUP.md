# Jaei Studio 설정

Jaei Studio는 `/studio`에서 사용하는 비공개 글쓰기·통계 작업실입니다. 글과 초안은 Supabase DB에 저장하며, 글을 공개할 때 Vercel Deploy Hook을 호출합니다. 글을 쓸 때 GitHub 브랜치나 Draft PR은 만들지 않습니다.

실제 비밀값은 저장소 파일이나 채팅에 적지 말고 Vercel 환경변수에만 등록합니다.

## 1. GitHub 로그인 앱 만들기

GitHub에서 **Settings → Developer settings → OAuth Apps → New OAuth App**으로 이동합니다.

- Application name: `Jaei Studio`
- Homepage URL: `https://jaei.page/studio`
- Authorization callback URL: `https://jaei.page/api/studio/auth/callback`

생성 후 Client ID와 Client secret을 다음 환경변수로 등록합니다.

```text
STUDIO_GITHUB_CLIENT_ID
STUDIO_GITHUB_CLIENT_SECRET
STUDIO_GITHUB_USERNAME=Jae-i-Lee
```

OAuth callback 주소는 Studio에 접속한 현재 도메인을 기준으로 생성됩니다. Production에서는 `https://jaei.page/studio`로 접속하고, GitHub OAuth App의 callback URL도 위의 `https://jaei.page/api/studio/auth/callback`으로 맞춰 둡니다.

GitHub는 작업실 로그인과 사용자 확인에만 사용합니다. 저장소 쓰기 권한이나 Personal Access Token은 필요하지 않습니다.

## 2. 세션 비밀값 만들기

로컬 터미널에서 다음 명령으로 임의의 64자리 값을 만듭니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

출력값을 `STUDIO_SESSION_SECRET`으로 등록합니다. 32자 이상이어야 하며 외부에 공개하면 안 됩니다.

## 3. Supabase DB 준비하기

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/202608050001_create_blog_content.sql`을 실행합니다.
3. 이어서 `supabase/migrations/202608090001_add_post_redirects.sql`을 실행합니다. 기존 Studio에도 이 두 번째 마이그레이션을 적용해야 URL 변경과 이전 주소 연결이 동작합니다.
4. Project Settings의 API Keys에서 Project URL을 확인하고 `sb_secret_`으로 시작하는 Secret key를 새로 만듭니다.
5. Vercel에 다음 환경변수를 등록합니다.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Secret key는 서버에서만 사용합니다. 이 프로젝트는 모든 콘텐츠 테이블의 RLS를 켜고 브라우저의 직접 접근을 허용하지 않습니다.

## 4. 기존 Markdown 글 옮기기

로컬 환경에 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 설정한 뒤 한 번만 실행합니다.

```bash
npm run content:migrate
```

현재 `psychology`, `philosophy`, `reflections`의 Markdown 글을 DB에 공개 글로 넣습니다. 같은 카테고리와 URL 이름이 있으면 내용을 갱신하므로 재실행해도 중복 글을 만들지 않습니다.

## 5. 자동 배포 연결하기

Vercel 프로젝트에서 **Settings → Git → Deploy Hooks**로 이동해 Production용 Hook을 만듭니다. Hook URL을 다음 환경변수로 등록합니다.

```text
STUDIO_VERCEL_DEPLOY_HOOK_URL
```

Studio에서 공개하면 DB의 공개 글이 갱신되고 이 Hook이 호출됩니다. 새 빌드가 끝난 뒤 실제 블로그에 반영됩니다.

## 6. 통계 연결하기

Vercel Web Analytics 통계를 작업실에서 보려면 다음 값을 등록합니다.

```text
STUDIO_VERCEL_TOKEN
STUDIO_VERCEL_PROJECT_ID
STUDIO_VERCEL_TEAM_ID=
```

개인 계정 프로젝트라면 Team ID는 비워 둡니다.

## 7. 사용 흐름

1. `https://jaei.page/studio`에서 GitHub로 로그인
2. 새 글을 쓰거나 발행된 글의 `수정` 선택
3. `임시저장`으로 DB에 비공개 초안 저장
4. 준비되면 `바로 공개` 또는 작업실의 `공개하기` 선택
5. 자동 배포가 끝나면 `jaei.page`에서 확인

발행된 글을 수정해 초안으로 저장해도 현재 공개된 버전은 그대로 유지됩니다. 공개할 때 기존 버전은 `post_revisions`에 자동 보관됩니다.

## 보안 경계

- 허용된 GitHub 사용자명 하나만 로그인할 수 있습니다.
- OAuth에는 사용자 확인용 `read:user` 권한만 요청합니다.
- 로그인 요청에는 CSRF 방지 state와 PKCE를 적용합니다.
- 세션 쿠키는 서명되며 `HttpOnly`, `SameSite=Lax`, HTTPS에서는 `Secure` 속성을 사용합니다.
- 글쓰기 API는 로그인과 동일 출처 요청을 확인합니다.
- Supabase Secret key, Vercel 토큰, Deploy Hook URL은 브라우저로 전달하지 않습니다.
