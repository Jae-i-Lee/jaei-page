import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { studioCategories, type StudioCategory } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";

export type StudioPostInput = {
  title: string;
  description: string;
  pubDate: string;
  category: StudioCategory;
  tags: string[];
  slug: string;
  body: string;
  image?: string;
  sourcePath?: string;
};

export type StudioPost = StudioPostInput & {
  path: string;
  url: string;
  sha: string;
};

const categoryLabels: Record<StudioCategory, string> = {
  psychology: "Psychology",
  philosophy: "Philosophy",
  reflections: "Reflections",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeSlug(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
}

export function isStudioCategory(value: string): value is StudioCategory {
  return studioCategories.includes(value as StudioCategory);
}

export function validateSourcePath(path: string): boolean {
  return /^src\/content\/(psychology|philosophy|reflections)\/[^/]+\.(md|mdx)$/.test(
    path,
  );
}

export function validatePostInput(value: unknown): StudioPostInput {
  if (!value || typeof value !== "object") {
    throw new StudioHttpError(400, "글 정보가 올바르지 않습니다.");
  }

  const input = value as Record<string, unknown>;
  const title = asText(input.title).trim();
  const description = asText(input.description).trim();
  const pubDate = asText(input.pubDate).trim();
  const category = asText(input.category);
  const slug = normalizeSlug(asText(input.slug));
  const body = asText(input.body).trim();
  const image = asText(input.image).trim();
  const sourcePath = asText(input.sourcePath).trim();
  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (!title || title.length > 120)
    throw new StudioHttpError(400, "제목은 1~120자로 입력해 주세요.");
  if (!description || description.length > 240)
    throw new StudioHttpError(400, "소개는 1~240자로 입력해 주세요.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pubDate))
    throw new StudioHttpError(400, "발행일 형식이 올바르지 않습니다.");
  if (!isStudioCategory(category))
    throw new StudioHttpError(400, "카테고리가 올바르지 않습니다.");
  if (!slug) throw new StudioHttpError(400, "URL 이름을 입력해 주세요.");
  if (!body || body.length > 120_000)
    throw new StudioHttpError(400, "본문은 1~120,000자로 입력해 주세요.");
  if (tags.some((tag) => tag.length > 30))
    throw new StudioHttpError(400, "태그는 각각 30자 이하여야 합니다.");
  if (image && !image.startsWith("/") && !/^https:\/\//.test(image))
    throw new StudioHttpError(
      400,
      "대표 이미지에는 /로 시작하는 경로나 https 주소를 입력해 주세요.",
    );
  if (sourcePath && !validateSourcePath(sourcePath))
    throw new StudioHttpError(400, "원본 글 경로가 올바르지 않습니다.");
  if (sourcePath) {
    const sourceParts = sourcePath.split("/");
    const sourceCategory = sourceParts[2];
    const sourceSlug = (sourceParts.at(-1) || "").replace(/\.(md|mdx)$/, "");
    if (sourceCategory !== category || sourceSlug !== slug) {
      throw new StudioHttpError(
        400,
        "기존 글을 수정할 때는 카테고리와 URL 이름을 바꿀 수 없습니다.",
      );
    }
  }

  return {
    title,
    description,
    pubDate,
    category,
    tags,
    slug,
    body,
    ...(image ? { image } : {}),
    ...(sourcePath ? { sourcePath } : {}),
  };
}

export function buildPostPath(post: StudioPostInput): string {
  if (post.sourcePath) return post.sourcePath;
  return `src/content/${post.category}/${post.slug}.md`;
}

export function serializePost(post: StudioPostInput): string {
  const frontmatter = {
    title: post.title,
    pubDate: post.pubDate,
    author: "Jaei",
    category: categoryLabels[post.category],
    tags: post.tags.length ? post.tags : [categoryLabels[post.category]],
    description: post.description,
    ...(post.image ? { image: post.image } : {}),
  };

  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 }).trim()}\n---\n\n${post.body.trim()}\n`;
}

export function parsePost(
  content: string,
  path: string,
  sha: string,
): StudioPost {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new StudioHttpError(422, `${path}의 frontmatter를 읽지 못했습니다.`);
  }

  const data = parseYaml(match[1]) as Record<string, unknown>;
  const segments = path.split("/");
  const category = segments[2];
  const filename = segments.at(-1) || "";
  const slug = filename.replace(/\.(md|mdx)$/, "");
  if (!isStudioCategory(category)) {
    throw new StudioHttpError(422, `${path}의 카테고리가 올바르지 않습니다.`);
  }

  const rawDate = data.pubDate;
  const pubDate =
    rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : String(rawDate || "").slice(0, 10);

  return {
    title: asText(data.title),
    description: asText(data.description),
    pubDate,
    category,
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
    slug,
    body: match[2].trim(),
    ...(asText(data.image) ? { image: asText(data.image) } : {}),
    sourcePath: path,
    path,
    url: `/${category}/${encodeURIComponent(slug)}`,
    sha,
  };
}
