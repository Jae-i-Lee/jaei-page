import type { StudioCategory } from "@/lib/studio/config";

type PostOgIdentity = {
  category: StudioCategory;
  slug: string;
  image?: string;
};

function isLegacyDefaultOgImage(value: string): boolean {
  const pathname = value.trim().split(/[?#]/, 1)[0] ?? "";
  return /(^|\/)og-image(?:\.[a-z0-9_-]+)?\.png$/i.test(pathname);
}

export function getPostOgImagePath(post: PostOgIdentity): string {
  return `/og/posts/${post.category}/${encodeURIComponent(post.slug)}.png`;
}

export function getPostSocialImage(post: PostOgIdentity): string {
  const image = post.image?.trim();
  if (image && !isLegacyDefaultOgImage(image)) return image;
  return getPostOgImagePath(post);
}
