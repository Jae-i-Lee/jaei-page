import type { APIRoute } from "astro";
import { requireStudioSession } from "@/lib/studio/auth";
import { getAnalyticsDashboard } from "@/lib/studio/analytics";
import { errorResponse, json } from "@/lib/studio/http";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  try {
    await requireStudioSession(cookies);
    return json(await getAnalyticsDashboard());
  } catch (error) {
    return errorResponse(error);
  }
};
