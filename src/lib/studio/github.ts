import { getStudioConfig } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";
import {
  buildPostPath,
  parsePost,
  serializePost,
  type StudioPost,
  type StudioPostInput,
  validateSourcePath,
} from "@/lib/studio/posts";

const GITHUB_API = "https://api.github.com";

type GitHubContent = {
  type: "file" | "dir";
  name: string;
  path: string;
  sha: string;
  content?: string;
  encoding?: string;
};

type GitHubPullRequest = {
  number: number;
  node_id: string;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  created_at: string;
  head: { ref: string };
  base: { ref: string };
};

export type StudioDraft = {
  number: number;
  title: string;
  url: string;
  branch: string;
  createdAt: string;
  draft: boolean;
};

class GitHubApiError extends StudioHttpError {
  constructor(status: number, message: string) {
    super(status, message);
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function repositoryPath(path = ""): string {
  const { repoOwner, repoName } = getStudioConfig();
  return `/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}${path}`;
}

async function githubRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { repoToken } = getStudioConfig();
  if (!repoToken) {
    throw new StudioHttpError(
      503,
      "GitHub 저장소 토큰이 아직 설정되지 않았습니다.",
    );
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${repoToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    const detail = payload?.message ? ` (${payload.message})` : "";
    throw new GitHubApiError(
      response.status,
      `GitHub 요청을 완료하지 못했습니다${detail}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function getContent(path: string, ref: string): Promise<GitHubContent> {
  return githubRequest<GitHubContent>(
    repositoryPath(
      `/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?ref=${encodeURIComponent(ref)}`,
    ),
  );
}

async function listDirectory(
  path: string,
  ref: string,
): Promise<GitHubContent[]> {
  try {
    return await githubRequest<GitHubContent[]>(
      repositoryPath(`/contents/${path}?ref=${encodeURIComponent(ref)}`),
    );
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return [];
    throw error;
  }
}

export async function listPublishedPosts(): Promise<StudioPost[]> {
  const { defaultBranch } = getStudioConfig();
  const directories = ["psychology", "philosophy", "reflections"];
  const listings = await Promise.all(
    directories.map((category) =>
      listDirectory(`src/content/${category}`, defaultBranch),
    ),
  );
  const files = listings
    .flat()
    .filter((item) => item.type === "file" && /\.(md|mdx)$/.test(item.name));

  const posts = await Promise.all(
    files.map(async (file) => {
      const content = await getContent(file.path, defaultBranch);
      if (content.encoding !== "base64" || !content.content) {
        throw new StudioHttpError(422, `${file.path}을 읽지 못했습니다.`);
      }
      return parsePost(decodeBase64(content.content), file.path, file.sha);
    }),
  );

  return posts.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}

export async function getPublishedPost(path: string): Promise<StudioPost> {
  if (!validateSourcePath(path)) {
    throw new StudioHttpError(400, "글 경로가 올바르지 않습니다.");
  }
  const { defaultBranch } = getStudioConfig();
  const content = await getContent(path, defaultBranch);
  if (content.encoding !== "base64" || !content.content) {
    throw new StudioHttpError(422, `${path}을 읽지 못했습니다.`);
  }
  return parsePost(decodeBase64(content.content), path, content.sha);
}

export async function listStudioDrafts(): Promise<StudioDraft[]> {
  const { defaultBranch } = getStudioConfig();
  const query = new URLSearchParams({
    state: "open",
    base: defaultBranch,
    per_page: "50",
    sort: "created",
    direction: "desc",
  });
  const pulls = await githubRequest<GitHubPullRequest[]>(
    repositoryPath(`/pulls?${query}`),
  );

  return pulls
    .filter((pull) => pull.head.ref.startsWith("studio/"))
    .map((pull) => ({
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      branch: pull.head.ref,
      createdAt: pull.created_at,
      draft: pull.draft,
    }));
}

export async function createPreviewPullRequest(post: StudioPostInput) {
  const { defaultBranch } = getStudioConfig();
  const path = buildPostPath(post);
  let existingSha: string | undefined;

  try {
    const existing = await getContent(path, defaultBranch);
    existingSha = existing.sha;
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
  }

  if (post.sourcePath && !existingSha) {
    throw new StudioHttpError(404, "수정할 원본 글을 찾지 못했습니다.");
  }
  if (!post.sourcePath && existingSha) {
    throw new StudioHttpError(
      409,
      "같은 URL 이름의 글이 이미 있습니다. 다른 이름을 사용해 주세요.",
    );
  }

  const baseRef = await githubRequest<{ object: { sha: string } }>(
    repositoryPath(`/git/ref/heads/${encodeURIComponent(defaultBranch)}`),
  );
  const branch = `studio/${post.category}-${Date.now()}`;

  await githubRequest(repositoryPath("/git/refs"), {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseRef.object.sha,
    }),
  });

  await githubRequest(repositoryPath(`/contents/${path}`), {
    method: "PUT",
    body: JSON.stringify({
      message: post.sourcePath
        ? `content: update ${post.title}`
        : `content: add ${post.title}`,
      content: encodeBase64(serializePost(post)),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  const pull = await githubRequest<GitHubPullRequest>(
    repositoryPath("/pulls"),
    {
      method: "POST",
      body: JSON.stringify({
        title: `[Studio] ${post.title}`,
        head: branch,
        base: defaultBranch,
        draft: true,
        body: [
          "## Jaei Studio",
          "",
          post.sourcePath ? "기존 글을 수정합니다." : "새 글을 발행합니다.",
          "",
          `- Category: ${post.category}`,
          `- Path: \`${path}\``,
          `- Published: ${post.pubDate}`,
          "",
          "Vercel Preview에서 확인한 뒤 Jaei Studio의 ‘공개하기’를 눌러 주세요.",
        ].join("\n"),
      }),
    },
  );

  return {
    number: pull.number,
    url: pull.html_url,
    branch,
    path,
  };
}

async function markPullRequestReady(nodeId: string): Promise<void> {
  await githubRequest<{ data?: unknown }>("/graphql", {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation MarkReady($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { id } } }",
      variables: { id: nodeId },
    }),
  });
}

export async function publishStudioDraft(pullNumber: number) {
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw new StudioHttpError(400, "PR 번호가 올바르지 않습니다.");
  }

  const { defaultBranch } = getStudioConfig();
  const pull = await githubRequest<GitHubPullRequest>(
    repositoryPath(`/pulls/${pullNumber}`),
  );
  if (
    pull.state !== "open" ||
    pull.base.ref !== defaultBranch ||
    !pull.head.ref.startsWith("studio/")
  ) {
    throw new StudioHttpError(
      403,
      "Jaei Studio에서 만든 열린 PR만 공개할 수 있습니다.",
    );
  }

  if (pull.draft) await markPullRequestReady(pull.node_id);

  const result = await githubRequest<{
    sha: string;
    merged: boolean;
    message: string;
  }>(repositoryPath(`/pulls/${pullNumber}/merge`), {
    method: "PUT",
    body: JSON.stringify({
      merge_method: "squash",
      commit_title: pull.title.replace(/^\[Studio\]\s*/, ""),
    }),
  });

  if (!result.merged) {
    throw new StudioHttpError(
      409,
      result.message || "아직 병합할 수 없습니다. 배포 검사를 확인해 주세요.",
    );
  }

  return result;
}
