import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const require = createRequire(import.meta.url);

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const LEFT = 92;
const CONTENT_WIDTH = 1016;
const TITLE_MAX_SIZE = 68;
const TITLE_MIN_SIZE = 30;
const DESCRIPTION_SIZE = 24;
const FONT_FAMILY = "Noto Sans KR";
const REGULAR_FONT =
  require.resolve("@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf");
const BOLD_FONT =
  require.resolve("@expo-google-fonts/noto-sans-kr/700Bold/NotoSansKR_700Bold.ttf");

const measurementCache = new Map();

function escapeMarkup(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function graphemes(value) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(value),
      ({ segment }) => segment,
    );
  }
  return Array.from(value);
}

function textInput(text, { fontPath, size, color, letterSpacing = 0 }) {
  const spacing = letterSpacing
    ? ` letter_spacing="${Math.round(letterSpacing * 1024)}"`
    : "";
  const markup = `<span foreground="${color}" size="${Math.round(size * 1024)}"${spacing}>${escapeMarkup(text)}</span>`;

  return {
    text: markup,
    font: FONT_FAMILY,
    fontfile: fontPath,
    rgba: true,
    dpi: 72,
    wrap: "none",
  };
}

async function renderText(text, options) {
  return sharp({ text: textInput(text, options) })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function measureText(text, options) {
  const key = [
    text,
    options.fontPath,
    options.size,
    options.letterSpacing ?? 0,
  ].join("|");
  const cached = measurementCache.get(key);
  if (cached) return cached;

  const { info } = await renderText(text || " ", {
    ...options,
    color: "#000000",
  });
  const measurement = { width: info.width, height: info.height };
  measurementCache.set(key, measurement);
  return measurement;
}

async function truncateToWidth(text, options, maxWidth, ellipsis = true) {
  const characters = graphemes(text.trim());
  const suffix = ellipsis ? "…" : "";
  let low = 0;
  let high = characters.length;
  let best = "";

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("").trimEnd()}${
      middle < characters.length ? suffix : ""
    }`;
    const { width } = await measureText(candidate, options);
    if (width <= maxWidth) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best || suffix;
}

async function fitTitle(title) {
  const options = { fontPath: BOLD_FONT };
  let low = TITLE_MIN_SIZE;
  let high = TITLE_MAX_SIZE;
  let size = TITLE_MIN_SIZE;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const { width } = await measureText(title, { ...options, size: middle });
    if (width <= CONTENT_WIDTH) {
      size = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const displayTitle =
    (await measureText(title, { ...options, size })).width <= CONTENT_WIDTH
      ? title
      : await truncateToWidth(title, { ...options, size }, CONTENT_WIDTH, true);

  return { text: displayTitle, size };
}

async function wrapDescription(description) {
  let remaining = description.trim().replace(/\s+/gu, " ");
  const options = { fontPath: REGULAR_FONT, size: DESCRIPTION_SIZE };
  const lines = [];

  for (let lineIndex = 0; lineIndex < 2 && remaining; lineIndex += 1) {
    if ((await measureText(remaining, options)).width <= CONTENT_WIDTH) {
      lines.push(remaining);
      break;
    }

    if (lineIndex === 1) {
      lines.push(
        await truncateToWidth(remaining, options, CONTENT_WIDTH, true),
      );
      break;
    }

    const characters = graphemes(remaining);
    let low = 1;
    let high = characters.length;
    let fitCount = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = characters.slice(0, middle).join("").trimEnd();
      if ((await measureText(candidate, options)).width <= CONTENT_WIDTH) {
        fitCount = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const fitted = characters.slice(0, fitCount).join("");
    const lastSpace = fitted.lastIndexOf(" ");
    const breakAt = lastSpace > fitted.length * 0.55 ? lastSpace : fitCount;
    lines.push(characters.slice(0, breakAt).join("").trim());
    remaining = characters.slice(breakAt).join("").trim();
  }

  return lines;
}

export async function renderPostOg(post, { signaturePath }) {
  const [{ text: titleText, size: titleSize }, descriptionLines, signatureSvg] =
    await Promise.all([
      fitTitle(post.title),
      wrapDescription(post.description),
      readFile(signaturePath),
    ]);

  const [signature, brand, category, title, ...descriptionImages] =
    await Promise.all([
      sharp(signatureSvg).resize(34, 34, { fit: "contain" }).png().toBuffer(),
      renderText("Jaei.page", {
        fontPath: BOLD_FONT,
        size: 19,
        color: "#1A1917",
      }).then(({ data }) => data),
      renderText(post.category.toUpperCase(), {
        fontPath: BOLD_FONT,
        size: 15,
        color: "#68758B",
        letterSpacing: 0.7,
      }).then(({ data }) => data),
      renderText(titleText, {
        fontPath: BOLD_FONT,
        size: titleSize,
        color: "#171614",
      }),
      ...descriptionLines.map((line) =>
        renderText(line, {
          fontPath: REGULAR_FONT,
          size: DESCRIPTION_SIZE,
          color: "#77736D",
        }).then(({ data }) => data),
      ),
    ]);

  const titleTop = 280;
  const descriptionTop = Math.max(398, titleTop + title.info.height + 34);
  const layers = [
    { input: signature, top: 64, left: LEFT },
    { input: brand, top: 69, left: LEFT + 47 },
    { input: category, top: 211, left: LEFT },
    { input: title.data, top: titleTop, left: LEFT },
    ...descriptionImages.map((input, index) => ({
      input,
      top: descriptionTop + index * 38,
      left: LEFT,
    })),
  ];

  return sharp({
    create: {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      channels: 4,
      background: "#FCFBF8",
    },
  })
    .composite(layers)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}
