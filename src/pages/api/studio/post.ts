import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { getStudioPost } from "@/lib/studio/database";
import { errorResponse, json, StudioHttpError } from "@/lib/studio/http";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, request }) => {
  try {
    await requireStudioSession(cookies);
    const path = new URL(request.url).searchParams.get("path");
    if (!path) throw new StudioHttpError(400, "글 경로가 필요합니다.");
    return json({ post: await getStudioPost(path) });
  } catch (error) {
    return errorResponse(error);
  }
};
