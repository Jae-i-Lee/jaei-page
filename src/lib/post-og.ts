import type { StudioCategory } from "@/lib/studio/config";

type PostOgIdentity = {
  category: StudioCategory;
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  updatedAt?: string;
  image?: string;
};

const OG_RENDERER_VERSION = "2026-08-09-minimal-v3";

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isLegacyDefaultOgImage(value: string): boolean {
  const pathname = value.trim().split(/[?#]/, 1)[0] ?? "";
  return /(^|\/)og-image(?:\.[a-z0-9_-]+)?\.png$/i.test(pathname);
}

export function getPostOgImagePath(post: PostOgIdentity): string {
  const version = hashText(
    [
      OG_RENDERER_VERSION,
      post.title,
      post.description,
      post.updatedAt ?? post.pubDate.toISOString(),
    ].join("|"),
  );

  return `/og/${post.category}/${encodeURIComponent(post.slug)}.png?v=${version}`;
}

export function getPostSocialImage(post: PostOgIdentity): string {
  const image = post.image?.trim();
  if (image && !isLegacyDefaultOgImage(image)) return image;
  return getPostOgImagePath(post);
}
