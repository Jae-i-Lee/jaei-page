import type { APIRoute } from "astro";

export const prerender = true;

const CHANNEL_ID = "2048d5800616cc805f41b187c5868882";
const PAGE_SIZE = 24;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

type ObjectMap = Record<string, unknown>;

function asObject(value: unknown): ObjectMap | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectMap)
    : null;
}

function first(object: ObjectMap, keys: string[]): unknown {
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

async function json(url: string, referer = "https://chzzk.naver.com/"): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          Origin: "https://chzzk.naver.com",
          Referer: referer,
          "User-Agent": UA,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function rows(payload: unknown): ObjectMap[] {
  const root = asObject(payload);
  if (!root) return [];
  const content = asObject(root.content);
  const candidates = [content?.data, content?.clips, root.data, root.clips];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(asObject).filter((item): item is ObjectMap => item !== null);
    }
  }
  return [];
}

function cursor(payload: unknown): Record<string, string | number> | null {
  const next = asObject(asObject(asObject(payload)?.content)?.page)?.next;
  const object = asObject(next);
  if (!object) return null;
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === "string" && value) result[key] = value;
    if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

async function allClips(): Promise<ObjectMap[]> {
  const found: ObjectMap[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let next: Record<string, string | number> = {};

  for (let batch = 0; batch < 100; batch += 1) {
    const params = new URLSearchParams({
      filterType: "ALL",
      orderType: "RECENT",
      page: "0",
      size: String(PAGE_SIZE),
    });
    Object.entries(next).forEach(([key, value]) => params.set(key, String(value)));
    const payload = await json(
      `https://api.chzzk.naver.com/service/v1/channels/${CHANNEL_ID}/clips?${params}`,
    );
    const items = rows(payload);
    if (!items.length) break;
    for (const item of items) {
      const id = String(first(item, ["clipUID", "clipUid", "clipId", "clipNo"]) ?? "");
      if (id && !ids.has(id)) {
        ids.add(id);
        found.push(item);
      }
    }
    const following = cursor(payload);
    if (!following) break;
    const marker = JSON.stringify(following);
    if (cursors.has(marker)) throw new Error(`repeated cursor ${marker}`);
    cursors.add(marker);
    next = following;
  }
  return found;
}

function isMediaUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  const lower = value.toLowerCase();
  return lower.includes(".mp4") || lower.includes(".m3u8") || lower.includes(".mpd");
}

interface Candidate {
  url: string;
  score: number;
  width: number;
  height: number;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collect(value: unknown, output: Candidate[], context: ObjectMap = {}): void {
  if (typeof value === "string") {
    if (isMediaUrl(value)) {
      const width = numberValue(first(context, ["width", "w", "videoWidth"]));
      const height = numberValue(first(context, ["height", "h", "videoHeight", "resolution"]));
      const bitrate = numberValue(first(context, ["bitrate", "bitRate", "bandwidth"]));
      const lower = value.toLowerCase();
      const bonus = lower.includes(".mp4")
        ? 3_000_000_000
        : lower.includes(".m3u8")
          ? 2_000_000_000
          : 1_000_000_000;
      output.push({ url: value, score: bonus + width * height * 100 + bitrate, width, height });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, output, context));
    return;
  }
  const object = asObject(value);
  if (!object) return;
  Object.values(object).forEach((item) => collect(item, output, object));
}

function best(payload: unknown): Candidate | null {
  const candidates: Candidate[] = [];
  collect(payload, candidates);
  const unique = new Map<string, Candidate>();
  candidates.forEach((candidate) => {
    const previous = unique.get(candidate.url);
    if (!previous || previous.score < candidate.score) unique.set(candidate.url, candidate);
  });
  return [...unique.values()].sort((a, b) => b.score - a.score)[0] ?? null;
}

function playbackUrl(videoId: string, clipUid: string, version: "v5" | "v9"): string {
  const params = new URLSearchParams({
    seedType: "SPECIFIC",
    serviceType: "CHZZK",
    seedMediaId: videoId,
    mediaType: "VOD",
    panelType: "sdk_chzzk",
    recType: "CHZZK",
    recId: JSON.stringify({
      seedClipUID: clipUid,
      fromType: "GLOBAL",
      listType: "RECOMMEND",
    }),
    blogId: "",
    docNo: "",
    sessionId: "",
    airsSessionId: "",
    mainSessionId: "",
    airsArea: "",
    enableReverse: "false",
    adAllowed: "Y",
    clickNsc: "chzzk_url_clip",
    clickArea: "clip_item",
    deviceType: "html5_mo",
  });
  return `https://api-videohub.naver.com/shortformhub/feeds/${version}/card?${params}`;
}

async function resolveClip(item: ObjectMap) {
  const uid = String(first(item, ["clipUID", "clipUid", "clipId", "clipNo"]) ?? "");
  const title = String(first(item, ["clipTitle", "title", "contentTitle"]) ?? uid);
  const created = String(first(item, ["createdDate", "publishDate", "createdAt"]) ?? "");
  const duration = numberValue(first(item, ["duration", "clipDuration"]));
  const views = numberValue(first(item, ["readCount", "viewCount", "views"]));
  const adult = Boolean(item.adult);
  const videoId = String(first(item, ["videoId", "videoID", "mediaId"]) ?? "");
  const referer = `https://chzzk.naver.com/clips/${uid}`;
  const errors: string[] = [];

  for (const version of ["v5", "v9"] as const) {
    try {
      const payload = await json(playbackUrl(videoId, uid, version), referer);
      const candidate = best(payload);
      if (candidate) {
        return {
          uid,
          title,
          created,
          duration,
          views,
          adult,
          videoId,
          clipUrl: referer,
          sourceUrl: candidate.url,
          width: candidate.width || null,
          height: candidate.height || null,
          error: null,
        };
      }
      errors.push(`${version}: no media URL`);
    } catch (error) {
      errors.push(`${version}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    uid,
    title,
    created,
    duration,
    views,
    adult,
    videoId,
    clipUrl: referer,
    sourceUrl: null,
    width: null,
    height: null,
    error: errors.join(" | "),
  };
}

async function concurrentMap<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (true) {
        const current = index++;
        if (current >= values.length) return;
        result[current] = await mapper(values[current]);
      }
    }),
  );
  return result;
}

export const GET: APIRoute = async () => {
  try {
    const items = await allClips();
    const clips = await concurrentMap(items, 8, resolveClip);
    const resolved = clips.filter((clip) => clip.sourceUrl).length;
    return new Response(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          channelId: CHANNEL_ID,
          clipCount: clips.length,
          resolvedCount: resolved,
          unresolvedCount: clips.length - resolved,
          clips,
        },
        null,
        2,
      ),
      {
        status: clips.length === 42 ? 200 : 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null,
        },
        null,
        2,
      ),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
};
