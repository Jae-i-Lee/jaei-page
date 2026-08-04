import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { createPreviewPullRequest } from "@/lib/studio/github";
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
} from "@/lib/studio/http";
import { validatePostInput } from "@/lib/studio/posts";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    assertSameOrigin(request);
    await requireStudioSession(cookies);
    const post = validatePostInput(await readJson(request));
    return json({ preview: await createPreviewPullRequest(post) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
