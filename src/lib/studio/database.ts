import { getStudioConfig } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";
import {
  type StudioPost,
  type StudioPostInput,
  validateSourcePath,
} from "@/lib/studio/posts";
import { SupabaseRequestError, supabaseRequest } from "@/lib/supabase";

type StoredPost = {
  id: string;
  source_post_id?: string | null;
  title: string;
  description: string;
  pub_date: string;
  author: string;
  image: string | null;
  tags: string[] | null;
  category: StudioPostInput["category"];
  slug: string;
  body: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
};

type StoredPostRedirect = {
  category: StudioPostInput["category"];
  slug: string;
  post_id: string;
};

export type StudioDraft = {
  id: string;
  title: string;
  url: string;
  sourcePath: string;
  createdAt: string;
};

function pathFor(post: Pick<StoredPost, "category" | "slug">): string {
  return `src/content/${post.category}/${post.slug}.md`;
}

function toStudioPost(post: StoredPost): StudioPost {
  const path = pathFor(post);
  return {
    title: post.title,
    description: post.description,
    pubDate: post.pub_date,
    category: post.category,
    tags: post.tags ?? [],
    slug: post.slug,
    body: post.body,
    ...(post.image ? { image: post.image } : {}),
    sourcePath: path,
    path,
    url: `/${post.category}/${encodeURIComponent(post.slug)}`,
    sha: post.id,
  };
}

function postFilters(path: string): string {
  if (!validateSourcePath(path)) {
    throw new StudioHttpError(400, "글 경로가 올바르지 않습니다.");
  }
  const segments = path.split("/");
  const category = segments[2];
  const slug = (segments.at(-1) || "").replace(/\.(md|mdx)$/, "");
  return `category=eq.${encodeURIComponent(category)}&slug=eq.${encodeURIComponent(slug)}`;
}

async function getRows(
  table: "posts" | "post_drafts",
  filters: string,
): Promise<StoredPost[]> {
  return supabaseRequest<StoredPost[]>(
    `/rest/v1/${table}?select=*&${filters}&limit=1`,
  );
}

async function getRedirectRows(filters: string): Promise<StoredPostRedirect[]> {
  return supabaseRequest<StoredPostRedirect[]>(
    `/rest/v1/post_redirects?select=category,slug,post_id&${filters}&limit=1`,
  );
}

export async function listPublishedPosts(): Promise<StudioPost[]> {
  const rows = await supabaseRequest<StoredPost[]>(
    "/rest/v1/posts?select=*&order=pub_date.desc,created_at.desc",
  );
  return rows.map(toStudioPost);
}

export async function getStudioPost(path: string): Promise<StudioPost> {
  const filters = postFilters(path);
  const drafts = await getRows("post_drafts", filters);
  if (drafts[0]) return toStudioPost(drafts[0]);

  const posts = await getRows("posts", filters);
  if (posts[0]) {
    const relatedDrafts = await getRows(
      "post_drafts",
      `source_post_id=eq.${encodeURIComponent(posts[0].id)}`,
    );
    return toStudioPost(relatedDrafts[0] ?? posts[0]);
  }
  throw new StudioHttpError(404, "글을 찾지 못했습니다.");
}

export async function listStudioDrafts(): Promise<StudioDraft[]> {
  const rows = await supabaseRequest<StoredPost[]>(
    "/rest/v1/post_drafts?select=*&order=updated_at.desc",
  );
  return rows.map((post) => {
    const sourcePath = pathFor(post);
    return {
      id: post.id,
      title: post.title,
      sourcePath,
      url: `/studio/editor?path=${encodeURIComponent(sourcePath)}`,
      createdAt: post.updated_at,
    };
  });
}

export async function saveStudioDraft(
  post: StudioPostInput,
): Promise<StudioDraft> {
  const targetPath = `src/content/${post.category}/${post.slug}.md`;
  const targetFilters = postFilters(targetPath);
  const lookupPath = post.sourcePath ?? targetPath;
  const sourceFilters = postFilters(lookupPath);
  const [
    sourcePublished,
    sourceDrafts,
    targetPublished,
    targetDrafts,
    targetRedirects,
  ] = await Promise.all([
    post.sourcePath ? getRows("posts", sourceFilters) : Promise.resolve([]),
    post.sourcePath
      ? getRows("post_drafts", sourceFilters)
      : Promise.resolve([]),
    getRows("posts", targetFilters),
    getRows("post_drafts", targetFilters),
    getRedirectRows(targetFilters),
  ]);
  let published = sourcePublished;
  let existingDraft = sourceDrafts;

  const sourcePostId =
    published[0]?.id ?? existingDraft[0]?.source_post_id ?? null;
  if (sourcePostId) {
    [published, existingDraft] = await Promise.all([
      published[0]
        ? Promise.resolve(published)
        : getRows("posts", `id=eq.${encodeURIComponent(sourcePostId)}`),
      getRows(
        "post_drafts",
        `source_post_id=eq.${encodeURIComponent(sourcePostId)}`,
      ),
    ]);
  }

  const targetPostBelongsToSource =
    targetPublished[0]?.id && targetPublished[0].id === sourcePostId;
  const targetDraftIsCurrent =
    targetDrafts[0]?.id && targetDrafts[0].id === existingDraft[0]?.id;
  const targetRedirectBelongsToSource =
    targetRedirects[0]?.post_id && targetRedirects[0].post_id === sourcePostId;

  if (targetPublished[0] && !targetPostBelongsToSource) {
    throw new StudioHttpError(409, "같은 URL 이름의 글이 이미 있습니다.");
  }
  if (targetDrafts[0] && !targetDraftIsCurrent) {
    throw new StudioHttpError(409, "같은 URL 이름의 초안이 이미 있습니다.");
  }
  if (targetRedirects[0] && !targetRedirectBelongsToSource) {
    throw new StudioHttpError(
      409,
      "이 URL 이름은 다른 글의 이전 주소로 사용 중입니다.",
    );
  }
  if (post.sourcePath && !published[0] && !existingDraft[0]) {
    throw new StudioHttpError(404, "수정할 글이나 초안을 찾지 못했습니다.");
  }

  const payload = {
    source_post_id: sourcePostId,
    title: post.title,
    description: post.description,
    pub_date: post.pubDate,
    author: "Jaei",
    image: post.image ?? null,
    tags: post.tags,
    category: post.category,
    slug: post.slug,
    body: post.body,
  };
  const rows = existingDraft[0]
    ? await supabaseRequest<StoredPost[]>(
        `/rest/v1/post_drafts?id=eq.${existingDraft[0].id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        },
      )
    : await supabaseRequest<StoredPost[]>("/rest/v1/post_drafts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
  const saved = rows[0];
  if (!saved)
    throw new StudioHttpError(500, "임시저장 결과를 확인하지 못했습니다.");
  const sourcePath = pathFor(saved);
  return {
    id: saved.id,
    title: saved.title,
    sourcePath,
    url: `/studio/editor?path=${encodeURIComponent(sourcePath)}`,
    createdAt: saved.updated_at,
  };
}

async function triggerDeployment(): Promise<boolean> {
  const { deployHookUrl } = getStudioConfig();
  if (!deployHookUrl) return false;

  const response = await fetch(deployHookUrl, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok;
}

export async function publishStudioDraft(draftId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) {
    throw new StudioHttpError(400, "임시저장 글 ID가 올바르지 않습니다.");
  }

  try {
    const rows = await supabaseRequest<StoredPost[]>(
      "/rest/v1/rpc/publish_post_draft",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ p_draft_id: draftId }),
      },
    );
    const published = rows[0];
    if (!published)
      throw new StudioHttpError(404, "임시저장 글을 찾지 못했습니다.");
    return {
      post: toStudioPost(published),
      deploymentTriggered: await triggerDeployment(),
    };
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 404) {
      throw new StudioHttpError(404, "임시저장 글을 찾지 못했습니다.");
    }
    throw error;
  }
}
