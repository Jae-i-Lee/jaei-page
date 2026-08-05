import { getStudioConfig } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";
import {
  buildPostPath,
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
  if (posts[0]) return toStudioPost(posts[0]);
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
  const path = buildPostPath(post);
  const filters = postFilters(path);
  const [published, existingDraft] = await Promise.all([
    getRows("posts", filters),
    getRows("post_drafts", filters),
  ]);

  if (!post.sourcePath && published[0] && !existingDraft[0]) {
    throw new StudioHttpError(
      409,
      "같은 URL 이름의 글이 이미 있습니다. 글 목록에서 수정해 주세요.",
    );
  }

  const payload = {
    source_post_id: published[0]?.id ?? null,
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
