import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { publishStudioDraft } from "@/lib/studio/database";
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  StudioHttpError,
} from "@/lib/studio/http";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    assertSameOrigin(request);
    await requireStudioSession(cookies);
    const body = await readJson<{ draftId?: unknown }>(request);
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    if (!draftId) {
      throw new StudioHttpError(400, "임시저장 글 ID가 필요합니다.");
    }
    return json({ result: await publishStudioDraft(draftId) });
  } catch (error) {
    return errorResponse(error);
  }
};
