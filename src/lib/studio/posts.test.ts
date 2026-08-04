import { describe, expect, it } from "vitest";
import { StudioHttpError } from "@/lib/studio/http";
import {
  buildPostPath,
  normalizeSlug,
  parsePost,
  serializePost,
  validatePostInput,
  validateSourcePath,
} from "@/lib/studio/posts";

const post = {
  title: "마음에 남은 여름",
  description: "지나간 계절을 돌아보는 짧은 기록.",
  pubDate: "2026-08-04",
  category: "reflections" as const,
  tags: ["여름", "회고"],
  slug: "마음에-남은-여름",
  body: "첫 문장입니다.\n\n두 번째 문장입니다.",
};

describe("Jaei Studio posts", () => {
  it("keeps Korean slugs and removes unsafe path characters", () => {
    expect(normalizeSlug("  마음에 남은 / 여름?  ")).toBe("마음에-남은-여름");
  });

  it("round-trips Studio markdown frontmatter and body", () => {
    const path = buildPostPath(post);
    const parsed = parsePost(serializePost(post), path, "sha-123");

    expect(parsed).toMatchObject({
      ...post,
      path,
      sourcePath: path,
      sha: "sha-123",
    });
  });

  it("only accepts article paths inside the three managed collections", () => {
    expect(validateSourcePath("src/content/reflections/선택.md")).toBe(true);
    expect(validateSourcePath("src/content/reflections/nested/선택.md")).toBe(
      false,
    );
    expect(validateSourcePath("../../package.json")).toBe(false);
  });

  it("prevents changing an existing post URL through the editor", () => {
    expect(() =>
      validatePostInput({
        ...post,
        slug: "바뀐-주소",
        sourcePath: "src/content/reflections/마음에-남은-여름.md",
      }),
    ).toThrow(StudioHttpError);
  });
});
