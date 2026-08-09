import { readFile, readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import { parse as parseYaml } from "yaml";

export const postCategories = ["psychology", "philosophy", "reflections"];

function validatePost(post, source) {
  if (!postCategories.includes(post.category)) {
    throw new Error(
      `${source}: 지원하지 않는 카테고리입니다 (${post.category})`,
    );
  }
  if (!post.slug || /[\\/\0]/u.test(post.slug)) {
    throw new Error(
      `${source}: 정적 파일로 만들 수 없는 slug입니다 (${post.slug})`,
    );
  }
  if (!post.title?.trim()) throw new Error(`${source}: 제목이 비어 있습니다.`);
  if (!post.description?.trim()) {
    throw new Error(`${source}: description이 비어 있습니다.`);
  }

  return {
    category: post.category,
    slug: post.slug,
    title: post.title.trim(),
    description: post.description.trim(),
    ...(post.image?.trim() ? { image: post.image.trim() } : {}),
  };
}

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filepath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(filepath)));
    } else if ([".md", ".mdx"].includes(extname(entry.name))) {
      files.push(filepath);
    }
  }

  return files;
}

function parseMarkdownPost(content, category, filepath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u);
  if (!match) throw new Error(`${filepath}: frontmatter를 읽지 못했습니다.`);

  const data = parseYaml(match[1]);
  return validatePost(
    {
      category,
      slug: parse(filepath).name,
      title: String(data?.title ?? ""),
      description: String(data?.description ?? ""),
      image: data?.image ? String(data.image) : undefined,
    },
    filepath,
  );
}

export async function listLocalPosts(projectRoot) {
  const posts = [];

  for (const category of postCategories) {
    const directory = join(projectRoot, "src", "content", category);
    const files = await listMarkdownFiles(directory);
    for (const filepath of files) {
      posts.push(
        parseMarkdownPost(await readFile(filepath, "utf8"), category, filepath),
      );
    }
  }

  return posts.sort((a, b) =>
    `${a.category}/${a.slug}`.localeCompare(`${b.category}/${b.slug}`, "ko"),
  );
}

export async function listDatabasePosts({ url, secretKey }) {
  const pageSize = 500;
  const posts = [];

  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({
      select: "category,slug,title,description,image",
      order: "category.asc,slug.asc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const response = await fetch(`${url}/rest/v1/posts?${query}`, {
      headers: {
        Accept: "application/json",
        apikey: secretKey,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Supabase 게시글 조회 실패 (${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new Error("Supabase 게시글 응답 형식이 올바르지 않습니다.");
    }

    posts.push(
      ...page.map((post) =>
        validatePost(
          {
            category: String(post.category ?? ""),
            slug: String(post.slug ?? ""),
            title: String(post.title ?? ""),
            description: String(post.description ?? ""),
            image: post.image ? String(post.image) : undefined,
          },
          `Supabase post ${post.category ?? "?"}/${post.slug ?? "?"}`,
        ),
      ),
    );

    if (page.length < pageSize) break;
  }

  if (posts.length === 0) {
    throw new Error("Supabase posts 테이블에 공개 게시글이 없습니다.");
  }

  return posts;
}

export async function listPublishedPosts(projectRoot) {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/u, "");
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  const hasUrl = Boolean(url);
  const hasSecretKey = Boolean(secretKey);

  if (
    hasUrl !== hasSecretKey ||
    (hasSecretKey && !secretKey.startsWith("sb_secret_"))
  ) {
    throw new Error(
      "SUPABASE_URL과 sb_secret_ 형식의 SUPABASE_SECRET_KEY를 함께 설정해야 합니다.",
    );
  }

  if (hasUrl && hasSecretKey) {
    // The application also treats Supabase as the production source of truth.
    return {
      posts: await listDatabasePosts({ url, secretKey }),
      source: "Supabase posts",
    };
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "Vercel build에는 전체 게시글 OG 생성을 위한 SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.",
    );
  }

  return {
    posts: await listLocalPosts(projectRoot),
    source: "Astro content collections (local fallback)",
  };
}
