import type { StudioCategory } from "@/lib/studio/config";

type PostOgIdentity = {
  category: StudioCategory;
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  updatedAt?: string;
};

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getPostOgImagePath(post: PostOgIdentity): string {
  const version = hashText(
    [
      post.title,
      post.description,
      post.updatedAt ?? post.pubDate.toISOString(),
    ].join("|"),
  );

  return `/og/${post.category}/${encodeURIComponent(post.slug)}.png?v=${version}`;
}
