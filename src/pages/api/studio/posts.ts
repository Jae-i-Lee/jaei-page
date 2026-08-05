import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { listPublishedPosts } from "@/lib/studio/database";
import { errorResponse, json } from "@/lib/studio/http";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    await requireStudioSession(cookies);
    const posts = (await listPublishedPosts()).map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.pubDate,
      category: post.category,
      tags: post.tags,
      slug: post.slug,
      image: post.image,
      path: post.path,
      url: post.url,
      id: post.sha,
    }));
    return json({ posts });
  } catch (error) {
    return errorResponse(error);
  }
};
