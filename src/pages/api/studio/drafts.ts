import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { listStudioDrafts } from "@/lib/studio/github";
import { errorResponse, json } from "@/lib/studio/http";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    await requireStudioSession(cookies);
    return json({ drafts: await listStudioDrafts() });
  } catch (error) {
    return errorResponse(error);
  }
};
