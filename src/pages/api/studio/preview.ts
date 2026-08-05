import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { saveStudioDraft } from "@/lib/studio/database";
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
    return json({ draft: await saveStudioDraft(post) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
