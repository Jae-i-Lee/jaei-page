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
const LEFT = 88;
const CONTENT_WIDTH = 1024;
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
    if (/\s/.test(character)) return total + 0.34;
    if (character.charCodeAt(0) <= 0x007f) return total + 0.56;
    return total + 1;
  }, 0);
}

function titleFontSize(title: string): number {
  const units = Math.max(visualUnits(title), 1);
  const estimated = Math.floor((CONTENT_WIDTH / units) * 0.84);
  return Math.max(24, Math.min(58, estimated));
}

function wrapDescription(description: string): string[] {
  const words = description.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (visualUnits(candidate) <= 46 || !current) {
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
    // Vercel 런타임에 한글 시스템 폰트가 없을 수 있어 임시 디렉터리에 캐시합니다.
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
      .resize(34, 34, { fit: "contain" })
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
      <rect width="1200" height="630" fill="#FFFFFF" />
      <rect x="0" y="0" width="1200" height="630" fill="#FBFCFE" opacity="0.72" />
      <line x1="${LEFT}" y1="164" x2="1112" y2="164" stroke="#E9EDF4" stroke-width="1" />
    </svg>
  `);

  const [brand, categoryText, title, ...descriptionImages] = await Promise.all([
    renderText({
      text: "Jaei.page",
      fontPath: bold,
      size: 19,
      color: "#181A1F",
      weight: "bold",
      width: 240,
    }),
    renderText({
      text: categoryLabel,
      fontPath: bold,
      size: 16,
      color: "#6F86B2",
      weight: "bold",
      width: 320,
      letterSpacing: 2.2,
    }),
    renderText({
      text: post.title,
      fontPath: bold,
      size: fontSize,
      color: "#111318",
      weight: "bold",
    }),
    ...descriptionLines.map((line) =>
      renderText({
        text: line,
        fontPath: regular,
        size: 24,
        color: "#717680",
      }),
    ),
  ]);

  const layers: Array<{ input: Buffer; top: number; left: number }> = [
    { input: brand, top: 70, left: signature ? LEFT + 46 : LEFT },
    { input: categoryText, top: 202, left: LEFT },
    { input: title, top: 286, left: LEFT },
    ...descriptionImages.map((input, index) => ({
      input,
      top: 404 + index * 38,
      left: LEFT,
    })),
  ];

  if (signature) {
    layers.unshift({ input: signature, top: 65, left: LEFT });
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
