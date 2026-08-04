export const studioCategories = [
  "psychology",
  "philosophy",
  "reflections",
] as const;

export type StudioCategory = (typeof studioCategories)[number];

const env = import.meta.env as Record<string, string | undefined>;

function readEnv(name: string): string {
  const processValue =
    typeof process !== "undefined" ? process.env[name] : undefined;
  return (processValue ?? env[name] ?? "").trim();
}

export function getStudioConfig() {
  return {
    oauthClientId: readEnv("STUDIO_GITHUB_CLIENT_ID"),
    oauthClientSecret: readEnv("STUDIO_GITHUB_CLIENT_SECRET"),
    sessionSecret: readEnv("STUDIO_SESSION_SECRET"),
    allowedUsername: readEnv("STUDIO_GITHUB_USERNAME") || "Jae-i-Lee",
    baseUrl: readEnv("STUDIO_BASE_URL"),
    repoOwner: readEnv("STUDIO_REPO_OWNER") || "Jae-i-Lee",
    repoName: readEnv("STUDIO_REPO_NAME") || "jaei-page",
    defaultBranch: readEnv("STUDIO_REPO_BRANCH") || "main",
    repoToken: readEnv("STUDIO_GITHUB_TOKEN"),
    vercelToken: readEnv("STUDIO_VERCEL_TOKEN"),
    vercelProjectId: readEnv("STUDIO_VERCEL_PROJECT_ID"),
    vercelTeamId: readEnv("STUDIO_VERCEL_TEAM_ID"),
  };
}

export function getStudioReadiness() {
  const config = getStudioConfig();
  const authMissing: string[] = [];
  const repositoryMissing: string[] = [];
  const analyticsMissing: string[] = [];

  if (!config.oauthClientId) authMissing.push("STUDIO_GITHUB_CLIENT_ID");
  if (!config.oauthClientSecret)
    authMissing.push("STUDIO_GITHUB_CLIENT_SECRET");
  if (config.sessionSecret.length < 32)
    authMissing.push("STUDIO_SESSION_SECRET (32자 이상)");
  if (!config.repoToken) repositoryMissing.push("STUDIO_GITHUB_TOKEN");
  if (!config.vercelToken) analyticsMissing.push("STUDIO_VERCEL_TOKEN");
  if (!config.vercelProjectId)
    analyticsMissing.push("STUDIO_VERCEL_PROJECT_ID");

  return {
    authReady: authMissing.length === 0,
    repositoryReady: repositoryMissing.length === 0,
    analyticsReady: analyticsMissing.length === 0,
    authMissing,
    repositoryMissing,
    analyticsMissing,
  };
}

export function getOAuthCallbackUrl(requestUrl: string): string {
  const config = getStudioConfig();
  const base = config.baseUrl || new URL(requestUrl).origin;
  return new URL("/api/studio/auth/callback", base).toString();
}
