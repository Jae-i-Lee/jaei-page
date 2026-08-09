import { describe, expect, it } from "vitest";
import { getPostOgImagePath, getPostSocialImage } from "@/lib/post-og";

const post = {
  category: "psychology" as const,
  slug: "through-others-eyes",
};

describe("post OG images", () => {
  it("uses a stable static path without a cache query", () => {
    expect(getPostOgImagePath(post)).toBe(
      "/og/posts/psychology/through-others-eyes.png",
    );
  });

  it("prefers an explicitly selected post image", () => {
    expect(
      getPostSocialImage({ ...post, image: "/images/custom-cover.png" }),
    ).toBe("/images/custom-cover.png");
  });

  it("replaces legacy default OG images with the generated post image", () => {
    expect(getPostSocialImage({ ...post, image: "/og-image.png" })).toBe(
      "/og/posts/psychology/through-others-eyes.png",
    );
    expect(
      getPostSocialImage({
        ...post,
        image: "https://jaei.page/_astro/og-image.6J2Y6VQI.png",
      }),
    ).toBe("/og/posts/psychology/through-others-eyes.png");
  });
});
