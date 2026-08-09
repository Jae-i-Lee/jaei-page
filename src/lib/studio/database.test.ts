import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStudioPost, saveStudioDraft } from "@/lib/studio/database";

const supabase = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  class SupabaseRequestError extends Error {
    status: number;

    constructor(status: number, message = "Supabase request failed") {
      super(message);
      this.status = status;
    }
  }

  return {
    SupabaseRequestError,
    supabaseRequest: supabase.request,
  };
});

const published = {
  id: "post-id",
  title: "Old title",
  description: "Description",
  pub_date: "2026-08-09",
  author: "Jaei",
  image: null,
  tags: ["Reflections"],
  category: "reflections",
  slug: "old-address",
  body: "Body",
  created_at: "2026-08-09T00:00:00Z",
  updated_at: "2026-08-09T00:00:00Z",
};

const changedDraft = {
  ...published,
  id: "draft-id",
  source_post_id: published.id,
  slug: "new-address",
};

describe("Jaei Studio database", () => {
  beforeEach(() => {
    supabase.request.mockReset();
  });

  it("keeps the published post identity when a draft changes its slug", async () => {
    supabase.request.mockImplementation(
      async (path: string, init?: RequestInit) => {
        if (init?.method === "PATCH") return [changedDraft];
        if (path.includes("post_redirects")) return [];
        if (path.includes("source_post_id=eq.post-id")) return [changedDraft];
        if (path.includes("slug=eq.old-address")) {
          return path.includes("/posts?") ? [published] : [];
        }
        if (path.includes("slug=eq.new-address")) {
          return path.includes("/post_drafts?") ? [changedDraft] : [];
        }
        return [];
      },
    );

    const saved = await saveStudioDraft({
      title: "New title",
      description: "Description",
      pubDate: "2026-08-09",
      category: "reflections",
      tags: ["Reflections"],
      slug: "new-address",
      body: "Body",
      sourcePath: "src/content/reflections/old-address.md",
    });

    const patchCall = supabase.request.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      source_post_id: published.id,
      slug: "new-address",
    });
    expect(saved.sourcePath).toBe("src/content/reflections/new-address.md");
  });

  it("loads a renamed draft when the editor is reopened from the old path", async () => {
    supabase.request.mockImplementation(async (path: string) => {
      if (path.includes("source_post_id=eq.post-id")) return [changedDraft];
      if (
        path.includes("/post_drafts?") &&
        path.includes("slug=eq.old-address")
      )
        return [];
      if (path.includes("/posts?") && path.includes("slug=eq.old-address"))
        return [published];
      return [];
    });

    const post = await getStudioPost("src/content/reflections/old-address.md");

    expect(post.slug).toBe("new-address");
    expect(post.sourcePath).toBe("src/content/reflections/new-address.md");
  });
});
