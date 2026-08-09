import type { APIRoute } from "astro";
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

function isStudioCategory(value: string): value is StudioCategory {
  return studioCategories.includes(value as StudioCategory);
}

function escapeXml(value: string): string {
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
  const estimated = Math.floor((CONTENT_WIDTH / units) * 0.9);
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

async function loadSignatureDataUri(requestUrl: URL): Promise<string | null> {
  try {
    const response = await fetch(new URL("/favicon.svg", requestUrl));
    if (!response.ok) return null;
    const svg = await response.text();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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
  const signature = await loadSignatureDataUri(new URL(request.url));

  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<text x="${LEFT}" y="${472 + index * 42}" font-size="26" font-weight="400" fill="#666A73" font-family="Arial, 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif">${escapeXml(line)}</text>`,
    )
    .join("");

  const signatureSvg = signature
    ? `<image x="${LEFT}" y="54" width="42" height="42" href="${signature}" preserveAspectRatio="xMidYMid meet" />`
    : "";

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="softGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F8FAFF" />
          <stop offset="0.48" stop-color="#FFFFFF" />
          <stop offset="1" stop-color="#FBF8FF" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="#FFFFFF" />
      <rect x="0" y="0" width="1200" height="630" fill="url(#softGlow)" opacity="0.7" />

      ${signatureSvg}
      <text x="${signature ? LEFT + 54 : LEFT}" y="84" font-size="22" font-weight="700" fill="#181A1F" font-family="Arial, 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif">Jaei.page</text>

      <text x="${LEFT}" y="202" font-size="20" font-weight="700" letter-spacing="2.8" fill="#5276B8" font-family="Arial, 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif">${categoryLabel}</text>
      <line x1="${LEFT}" y1="226" x2="122" y2="226" stroke="#8BAEE9" stroke-width="2" />

      <text x="${LEFT}" y="360" font-size="${fontSize}" font-weight="700" fill="#101114" font-family="Arial, 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif">${escapeXml(post.title)}</text>

      ${descriptionSvg}

      <text x="${LEFT}" y="576" font-size="18" font-weight="500" fill="#A0A4AD" font-family="Arial, 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif">jaei.page</text>
    </svg>
  `;

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800",
      "Content-Length": String(png.byteLength),
    },
  });
};
