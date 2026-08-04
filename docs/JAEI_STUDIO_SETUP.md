# Jaei Studio 설정

Jaei Studio는 `/studio`에서 사용하는 비공개 글쓰기·통계 작업실입니다. 공개 블로그는 계속 정적으로 생성되고, Studio와 `/api/studio/*`만 Vercel 함수로 실행됩니다.

실제 비밀값은 저장소 파일이나 채팅에 적지 말고 Vercel의 환경변수에만 등록합니다.

## 1. GitHub 로그인 앱 만들기

GitHub에서 **Settings → Developer settings → OAuth Apps → New OAuth App**으로 이동합니다.

- Application name: `Jaei Studio`
- Homepage URL: `https://jaei-page.vercel.app/studio`
- Authorization callback URL: `https://jaei-page.vercel.app/api/studio/auth/callback`

생성 후 Client ID와 새 Client secret을 아래 이름으로 Vercel에 등록합니다.

```text
STUDIO_GITHUB_CLIENT_ID
STUDIO_GITHUB_CLIENT_SECRET
STUDIO_GITHUB_USERNAME=Jae-i-Lee
STUDIO_BASE_URL=https://jaei-page.vercel.app
```

`STUDIO_BASE_URL`을 고정했기 때문에 로그인과 세션은 안정적인 Vercel Production 주소에서 이루어집니다. 공개 블로그는 계속 `jaei.page`에서 사용할 수 있습니다.

## 2. 세션 비밀키 만들기

로컬 터미널에서 다음 명령으로 임의의 64자리 값을 만듭니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

출력된 값을 Vercel의 `STUDIO_SESSION_SECRET`에 등록합니다. 32자 이상이어야 하며 외부에 공개하면 안 됩니다.

## 3. GitHub 저장소 토큰 만들기

GitHub에서 **Settings → Developer settings → Personal access tokens → Fine-grained tokens**으로 이동해 토큰을 만듭니다.

- Repository access: `Jae-i-Lee/jaei-page`만 선택
- Repository permissions
  - Contents: Read and write
  - Pull requests: Read and write
  - Metadata: Read-only(자동)

토큰을 Vercel의 `STUDIO_GITHUB_TOKEN`에 등록하고 다음 값도 함께 둡니다.

```text
STUDIO_REPO_OWNER=Jae-i-Lee
STUDIO_REPO_NAME=jaei-page
STUDIO_REPO_BRANCH=main
```

이 토큰은 Markdown 파일용 브랜치와 Draft PR을 만들고, `공개하기`를 눌렀을 때 해당 PR만 병합하는 데 사용됩니다.

## 4. Vercel 통계 연결하기

Vercel의 **Account Settings → Tokens**에서 토큰을 만들고 프로젝트의 **Settings → General**에서 Project ID를 확인합니다.

```text
STUDIO_VERCEL_TOKEN
STUDIO_VERCEL_PROJECT_ID
```

프로젝트가 팀 소유일 때만 Team ID를 추가합니다.

```text
STUDIO_VERCEL_TEAM_ID
```

대시보드는 Vercel Web Analytics의 공식 API를 서버에서 호출해 오늘·7일·30일·전체 페이지 조회수, 최근 흐름, 글별 조회수를 표시합니다. 토큰은 브라우저로 전달되지 않습니다.

## 5. Vercel에 환경변수 등록하기

Vercel 프로젝트에서 **Settings → Environment Variables**를 열어 위 값을 등록합니다.

- Production: 반드시 등록
- Preview: 설정 화면까지 확인하려면 등록 가능
- Development: 로컬에서 OAuth까지 시험할 때만 등록

환경변수를 추가하거나 수정한 뒤에는 새 배포가 필요합니다.

## 사용 흐름

1. `https://jaei-page.vercel.app/studio`에서 GitHub 로그인
2. `새 글 쓰기` 또는 기존 글의 `수정` 선택
3. 제목·소개·태그·본문을 입력하고 `미리보기 생성`
4. 생성된 Draft PR의 Vercel Preview에서 실제 화면 확인
5. Studio 대시보드의 `공개하기` 선택
6. PR이 `main`에 squash 병합되고 Vercel Production이 자동 배포

## 보안 경계

- 허용된 GitHub 사용자명 하나만 로그인할 수 있습니다.
- OAuth에는 신원 확인용 `read:user`만 요청합니다.
- 로그인 요청에는 CSRF 방지 state와 PKCE가 적용됩니다.
- 세션 쿠키는 서명되고 `HttpOnly`, `SameSite=Lax`, HTTPS 환경의 `Secure` 속성을 사용합니다.
- 쓰기 API는 로그인과 동일 출처 요청을 모두 확인합니다.
- GitHub·Vercel 토큰은 서버 환경변수에서만 읽습니다.
- Studio는 내비게이션·사이트맵에 넣지 않으며 검색엔진 색인을 차단합니다.
