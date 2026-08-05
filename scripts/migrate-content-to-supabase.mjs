import { readFile, readdir } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import { parse as parseYaml } from "yaml";

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const categories = ["psychology", "philosophy", "reflections"];

if (!url || !key) {
  throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}

function parseMarkdown(content, category, filename) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: frontmatter를 읽지 못했습니다.`);
  const data = parseYaml(match[1]);
  return {
    category,
    slug: parse(filename).name,
    title: String(data.title || ""),
    description: String(data.description || ""),
    pub_date: new Date(data.pubDate).toISOString().slice(0, 10),
    author: String(data.author || "Jaei"),
    image: data.image ? String(data.image) : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    body: match[2].trim(),
  };
}

const posts = [];
for (const category of categories) {
  const directory = join(process.cwd(), "src", "content", category);
  for (const filename of await readdir(directory)) {
    if (![".md", ".mdx"].includes(extname(filename))) continue;
    posts.push(
      parseMarkdown(
        await readFile(join(directory, filename), "utf8"),
        category,
        filename,
      ),
    );
  }
}

const response = await fetch(`${url}/rest/v1/posts?on_conflict=category,slug`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(posts),
});

if (!response.ok) {
  throw new Error(`이전 실패 (${response.status}): ${await response.text()}`);
}

console.log(`${posts.length}개의 글을 Supabase로 옮겼습니다.`);
