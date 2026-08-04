import type { APIRoute } from "astro";
import {
  createSessionCookie,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
} from "@/lib/studio/auth";
import { getOAuthCallbackUrl, getStudioConfig } from "@/lib/studio/config";
import { errorResponse, StudioHttpError } from "@/lib/studio/http";

export const prerender = false;

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUser = {
  login: string;
  avatar_url: string;
};

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const clearOAuthCookies = () => {
    cookies.delete(OAUTH_STATE_COOKIE, { path: "/api/studio/auth" });
    cookies.delete(OAUTH_VERIFIER_COOKIE, { path: "/api/studio/auth" });
  };

  try {
    const url = new URL(request.url);
    if (url.searchParams.get("error")) {
      clearOAuthCookies();
      return redirect("/studio?auth=cancelled", 303);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = cookies.get(OAUTH_STATE_COOKIE)?.value;
    const verifier = cookies.get(OAUTH_VERIFIER_COOKIE)?.value;
    if (!code || !state || !savedState || state !== savedState || !verifier) {
      throw new StudioHttpError(
        400,
        "GitHub 로그인 요청을 확인하지 못했습니다.",
      );
    }

    const { oauthClientId, oauthClientSecret, allowedUsername } =
      getStudioConfig();
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: oauthClientId,
          client_secret: oauthClientSecret,
          code,
          redirect_uri: getOAuthCallbackUrl(request.url),
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const token = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!tokenResponse.ok || !token.access_token) {
      throw new StudioHttpError(
        401,
        token.error_description || "GitHub 로그인을 완료하지 못했습니다.",
      );
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const user = (await userResponse.json()) as GitHubUser;
    if (!userResponse.ok || !user.login) {
      throw new StudioHttpError(401, "GitHub 계정 정보를 확인하지 못했습니다.");
    }
    if (user.login.toLowerCase() !== allowedUsername.toLowerCase()) {
      throw new StudioHttpError(
        403,
        "이 계정은 Jaei Studio에 접근할 수 없습니다.",
      );
    }

    await createSessionCookie(
      cookies,
      { username: user.login, avatarUrl: user.avatar_url },
      url.protocol === "https:",
    );
    clearOAuthCookies();
    return redirect("/studio", 303);
  } catch (error) {
    clearOAuthCookies();
    return errorResponse(error);
  }
};
