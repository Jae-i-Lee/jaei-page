import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listPublishedPosts, postCategories } from "./lib/post-og-data.mjs";
import { renderPostOg } from "./lib/post-og-renderer.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "public");
const outputRoot = resolve(publicRoot, "og", "posts");
const signaturePath = resolve(publicRoot, "favicon.svg");

function assertSafeOutputPath(filepath) {
  const pathFromOutputRoot = relative(outputRoot, filepath);
  if (
    !pathFromOutputRoot ||
    pathFromOutputRoot.startsWith("..") ||
    resolve(filepath) === outputRoot
  ) {
    throw new Error(`안전하지 않은 OG 출력 경로입니다: ${filepath}`);
  }
}

async function generatePost(post) {
  const outputPath = resolve(outputRoot, post.category, `${post.slug}.png`);
  assertSafeOutputPath(outputPath);

  try {
    const png = await renderPostOg(post, { signaturePath });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png);
    console.log(`[post-og] ${post.category}/${post.slug}.png`);
  } catch (error) {
    throw new Error(
      `[${post.category}/${post.slug}] 정적 OG 이미지 생성 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

async function main() {
  const relativeOutput = relative(publicRoot, outputRoot);
  if (relativeOutput.startsWith("..") || !relativeOutput) {
    throw new Error(`OG 출력 디렉터리가 public 내부가 아닙니다: ${outputRoot}`);
  }

  const { posts, source } = await listPublishedPosts(projectRoot);
  const identities = new Set();
  for (const post of posts) {
    const identity = `${post.category}/${post.slug}`;
    if (identities.has(identity)) {
      throw new Error(`중복된 게시글 경로입니다: ${identity}`);
    }
    identities.add(identity);
  }

  console.log(`[post-og] source: ${source}`);
  console.log(`[post-og] generating ${posts.length} published post images`);

  await rm(outputRoot, { recursive: true, force: true });
  await Promise.all(
    postCategories.map((category) =>
      mkdir(join(outputRoot, category), { recursive: true }),
    ),
  );

  for (let index = 0; index < posts.length; index += 4) {
    await Promise.all(posts.slice(index, index + 4).map(generatePost));
  }

  const counts = Object.fromEntries(
    postCategories.map((category) => [
      category,
      posts.filter((post) => post.category === category).length,
    ]),
  );
  console.log(
    `[post-og] complete: ${posts.length} images (${postCategories
      .map((category) => `${category}=${counts[category]}`)
      .join(", ")})`,
  );
}

main().catch((error) => {
  console.error(`[post-og] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
