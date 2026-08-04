import type { APIRoute } from "astro";
import { clearStudioSession } from "@/lib/studio/auth";
import { assertSameOrigin, errorResponse } from "@/lib/studio/http";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request);
    clearStudioSession(cookies);
    return redirect("/studio", 303);
  } catch (error) {
    return errorResponse(error);
  }
};
