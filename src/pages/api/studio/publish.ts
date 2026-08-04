import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { publishStudioDraft } from "@/lib/studio/github";
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
    const body = await readJson<{ pullNumber?: unknown }>(request);
    const pullNumber = Number(body.pullNumber);
    if (!Number.isInteger(pullNumber)) {
      throw new StudioHttpError(400, "PR 번호가 올바르지 않습니다.");
    }
    return json({ result: await publishStudioDraft(pullNumber) });
  } catch (error) {
    return errorResponse(error);
  }
};
