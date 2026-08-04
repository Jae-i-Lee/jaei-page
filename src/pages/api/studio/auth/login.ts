import type { APIRoute } from "astro";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  randomBase64Url,
  sha256Base64Url,
} from "@/lib/studio/auth";
import {
  getOAuthCallbackUrl,
  getStudioConfig,
  getStudioReadiness,
} from "@/lib/studio/config";
import { errorResponse, StudioHttpError } from "@/lib/studio/http";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const readiness = getStudioReadiness();
    if (!readiness.authReady) {
      throw new StudioHttpError(503, "Studio 로그인 설정이 필요합니다.");
    }

    const { oauthClientId, allowedUsername } = getStudioConfig();
    const state = randomBase64Url();
    const verifier = randomBase64Url(48);
    const secure = new URL(request.url).protocol === "https:";
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/api/studio/auth",
      maxAge: 10 * 60,
    };

    cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
    cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", oauthClientId);
    authorizeUrl.searchParams.set(
      "redirect_uri",
      getOAuthCallbackUrl(request.url),
    );
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", "read:user");
    authorizeUrl.searchParams.set("login", allowedUsername);
    authorizeUrl.searchParams.set("allow_signup", "false");
    authorizeUrl.searchParams.set(
      "code_challenge",
      await sha256Base64Url(verifier),
    );
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return redirect(authorizeUrl.toString(), 302);
  } catch (error) {
    return errorResponse(error);
  }
};
