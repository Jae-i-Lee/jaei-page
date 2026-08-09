import type { APIRoute } from "astro";
import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { getPublishedPost } from "@/lib/blog";
import {
  studioCategories,
  type StudioCategory,
} from "@/lib/studio/config";

export const prerender = false;

const WIDTH = 1200;
const HEIGHT = 630;
const LEFT = 78;
const CONTENT_WIDTH = 1044;
const FONT_FAMILY = "Nanum Gothic";
const REGULAR_FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf";
const BOLD_FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf";

type FontPaths = {
  regular: string;
  bold: string;
};

let fontPathsPromise: Promise<FontPaths> | null = null;

function isStudioCategory(value: string): value is StudioCategory {
  return studioCategories.includes(value as StudioCategory);
}

function escapeMarkup(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function visualUnits(value: string): number {
  return Array.from(value).reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.33;
    if (character.charCodeAt(0) <= 0x007f) return total + 0.57;
    return total + 1;
  }, 0);
}

function titleFontSize(title: string): number {
  const units = Math.max(visualUnits(title), 1);
  const estimated = Math.floor((CONTENT_WIDTH / units) * 0.82);
  return Math.max(22, Math.min(62, estimated));
}

function wrapDescription(description: string): string[] {
  const words = description.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (visualUnits(candidate) <= 42 || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length === 2) break;
  }

  if (lines.length < 2 && current) lines.push(current);

  if (lines.length === 2) {
    const consumed = lines.join(" ").length;
    if (description.trim().length > consumed + 1) {
      lines[1] = `${lines[1].replace(/[.。…]+$/u, "")}…`;
    }
  }

  return lines.slice(0, 2);
}

async function cacheFont(url: string, filename: string): Promise<string> {
  const filepath = join(tmpdir(), filename);

  try {
    await access(filepath);
    return filepath;
  } catch {
    // Vercel runtime에는 한글 시스템 폰트가 없을 수 있으므로,
    // 오픈소스 한글 폰트를 함수 인스턴스의 임시 디렉터리에 캐시합니다.
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "Jaei.page OG renderer" },
  });
  if (!response.ok) {
    throw new Error(`Unable to load OG font (${response.status})`);
  }

  await writeFile(filepath, Buffer.from(await response.arrayBuffer()));
  return filepath;
}

function getFontPaths(): Promise<FontPaths> {
  if (!fontPathsPromise) {
    fontPathsPromise = Promise.all([
      cacheFont(REGULAR_FONT_URL, "jaei-nanum-gothic-regular.ttf"),
      cacheFont(BOLD_FONT_URL, "jaei-nanum-gothic-bold.ttf"),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontPathsPromise;
}

async function renderText({
  text,
  fontPath,
  size,
  color,
  weight = "normal",
  width = CONTENT_WIDTH,
  letterSpacing = 0,
}: {
  text: string;
  fontPath: string;
  size: number;
  color: string;
  weight?: "normal" | "bold";
  width?: number;
  letterSpacing?: number;
}): Promise<Buffer> {
  const spacing = letterSpacing
    ? ` letter_spacing="${Math.round(letterSpacing * 1024)}"`
    : "";
  const markup = `<span foreground="${color}" weight="${weight}" size="${Math.round(size * 1024)}"${spacing}>${escapeMarkup(text)}</span>`;

  return sharp({
    text: {
      text: markup,
      font: FONT_FAMILY,
      fontfile: fontPath,
      width,
      align: "left",
      rgba: true,
      dpi: 72,
      wrap: "none",
    },
  })
    .png()
    .toBuffer();
}

async function loadSignature(requestUrl: URL): Promise<Buffer | null> {
  try {
    const response = await fetch(new URL("/favicon.svg", requestUrl));
    if (!response.ok) return null;
    const svg = Buffer.from(await response.arrayBuffer());
    return await sharp(svg)
      .resize(42, 42, { fit: "contain" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  const category = params.category ?? "";
  const slug = params.slug ?? "";

  if (!isStudioCategory(category) || !slug) {
    return new Response("Not found", { status: 404 });
  }

  const post = await getPublishedPost(category, slug);
  if (!post) return new Response("Not found", { status: 404 });

  const categoryLabel = category.toUpperCase();
  const fontSize = titleFontSize(post.title);
  const descriptionLines = wrapDescription(post.description);
  const [{ regular, bold }, signature] = await Promise.all([
    getFontPaths(),
    loadSignature(new URL(request.url)),
  ]);

  const background = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="softGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F8FAFF" />
          <stop offset="0.48" stop-color="#FFFFFF" />
          <stop offset="1" stop-color="#FBF8FF" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="#FFFFFF" />
      <rect width="1200" height="630" fill="url(#softGlow)" opacity="0.7" />
      <line x1="${LEFT}" y1="226" x2="122" y2="226" stroke="#8BAEE9" stroke-width="2" />
    </svg>
  `);

  const [brand, categoryText, title, footer, ...descriptionImages] =
    await Promise.all([
      renderText({
        text: "Jaei.page",
        fontPath: bold,
        size: 22,
        color: "#181A1F",
        weight: "bold",
        width: 260,
      }),
      renderText({
        text: categoryLabel,
        fontPath: bold,
        size: 20,
        color: "#5276B8",
        weight: "bold",
        width: 360,
        letterSpacing: 2.8,
      }),
      renderText({
        text: post.title,
        fontPath: bold,
        size: fontSize,
        color: "#101114",
        weight: "bold",
      }),
      renderText({
        text: "jaei.page",
        fontPath: regular,
        size: 18,
        color: "#A0A4AD",
        width: 220,
      }),
      ...descriptionLines.map((line) =>
        renderText({
          text: line,
          fontPath: regular,
          size: 26,
          color: "#666A73",
        }),
      ),
    ]);

  const layers: Array<{ input: Buffer; top: number; left: number }> = [
    { input: brand, top: 59, left: signature ? LEFT + 54 : LEFT },
    { input: categoryText, top: 182, left: LEFT },
    { input: title, top: 300, left: LEFT },
    { input: footer, top: 550, left: LEFT },
    ...descriptionImages.map((input, index) => ({
      input,
      top: 438 + index * 42,
      left: LEFT,
    })),
  ];

  if (signature) {
    layers.unshift({ input: signature, top: 54, left: LEFT });
  }

  const png = await sharp(background)
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control":
        "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
      "Content-Length": String(png.byteLength),
    },
  });
};
