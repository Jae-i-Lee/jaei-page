import { getCollection } from "astro:content";
import { marked } from "marked";
import { isSupabaseConfigured, supabaseRequest } from "@/lib/supabase";
import { studioCategories, type StudioCategory } from "@/lib/studio/config";

export type BlogPost = {
  id: string;
  title: string;
  description: string;
  pubDate: Date;
  author: string;
  image?: string;
  tags: string[];
  category: StudioCategory;
  slug: string;
  body: string;
  publishedAt?: string;
  updatedAt?: string;
};

type DatabasePost = {
  id: string;
  title: string;
  description: string;
  pub_date: string;
  author: string;
  image: string | null;
  tags: string[] | null;
  category: StudioCategory;
  slug: string;
  body: string;
  published_at: string;
  updated_at: string;
};

function fromDatabase(post: DatabasePost): BlogPost {
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    pubDate: new Date(`${post.pub_date}T00:00:00Z`),
    author: post.author,
    ...(post.image ? { image: post.image } : {}),
    tags: post.tags ?? [],
    category: post.category,
    slug: post.slug,
    body: post.body,
    publishedAt: post.published_at,
    updatedAt: post.updated_at,
  };
}

async function listLocalPosts(category?: StudioCategory): Promise<BlogPost[]> {
  const categories = category ? [category] : [...studioCategories];
  const collections = await Promise.all(
    categories.map(async (collection) => ({
      collection,
      posts: await getCollection(collection),
    })),
  );

  return collections
    .flatMap(({ collection, posts }) =>
      posts.map((post) => ({
        id: `${collection}/${post.id}`,
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        author: post.data.author,
        ...(post.data.image ? { image: post.data.image } : {}),
        tags: post.data.tags ?? [],
        category: collection,
        slug: post.id,
        body: post.body ?? "",
      })),
    )
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}

export async function listPublishedPosts(
  category?: StudioCategory,
): Promise<BlogPost[]> {
  if (!isSupabaseConfigured()) return listLocalPosts(category);

  const filter = category ? `&category=eq.${encodeURIComponent(category)}` : "";
  const posts = await supabaseRequest<DatabasePost[]>(
    `/rest/v1/posts?select=*&order=pub_date.desc,created_at.desc${filter}`,
  );
  return posts.map(fromDatabase);
}

export async function getPublishedPost(
  category: StudioCategory,
  slug: string,
): Promise<BlogPost | null> {
  if (!isSupabaseConfigured()) {
    const posts = await listLocalPosts(category);
    return posts.find((post) => post.slug === slug) ?? null;
  }

  const posts = await supabaseRequest<DatabasePost[]>(
    `/rest/v1/posts?select=*&category=eq.${encodeURIComponent(category)}&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  );
  return posts[0] ? fromDatabase(posts[0]) : null;
}

function preserveExtraBlankLines(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, (newlines) => {
    const extraBlankLines = newlines.length - 2;
    const spacers = Array.from(
      { length: extraBlankLines },
      () => '<div class="markdown-extra-blank-line" aria-hidden="true"></div>',
    ).join("\n\n");
    return `\n\n${spacers}\n\n`;
  });
}

export function renderPostMarkdown(body: string): string {
  return marked.parse(preserveExtraBlankLines(body), {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;
}
