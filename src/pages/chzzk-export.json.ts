import type { APIRoute } from "astro";

export const prerender = true;

const CHANNEL_ID = "2048d5800616cc805f41b187c5868882";
const PAGE_SIZE = 24;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

interface ClipRecord {
  uid: string;
  title: string;
  created: string;
  duration: number;
  views: number;
  adult: boolean;
  videoId: string;
  url: string;
  sourceUrl: string | null;
  sourceType: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  resolutionError: string | null;
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function contentRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const content = root.content;
  const candidates: unknown[] = [];
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const object = content as Record<string, unknown>;
    candidates.push(object.data, object.clips, object.items);
  }
  candidates.push(root.data, root.clips, root.items);
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
  }
  return [];
}

function nextCursor(payload: unknown): Record<string, string | number> | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as Record<string, unknown>).content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const page = (content as Record<string, unknown>).page;
  if (!page || typeof page !== "object" || Array.isArray(page)) return null;
  const next = (page as Record<string, unknown>).next;
  if (!next || typeof next !== "object" || Array.isArray(next)) return null;
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > 0) result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

async function getJson(url: string, referer = "https://chzzk.naver.com/"): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          Origin: "https://chzzk.naver.com",
          Referer: referer,
          "User-Agent": USER_AGENT,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchAllClips(): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: Record<string, string | number> = {};

  for (let batch = 0; batch < 100; batch += 1) {
    const params = new URLSearchParams({
      filterType: "ALL",
      orderType: "RECENT",
      page: "0",
      size: String(PAGE_SIZE),
    });
    for (const [key, value] of Object.entries(cursor)) params.set(key, String(value));

    const payload = await getJson(
      `https://api.chzzk.naver.com/service/v1/channels/${CHANNEL_ID}/clips?${params.toString()}`,
    );
    const rows = contentRows(payload);
    if (rows.length === 0) break;

    for (const row of rows) {
      const uid = String(firstValue(row, ["clipUID", "clipUid", "clipId", "clipNo"]) ?? "").trim();
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      result.push(row);
    }

    const following = nextCursor(payload);
    if (!following) break;
    const marker = JSON.stringify(
      Object.fromEntries(Object.entries(following).sort(([left], [right]) => left.localeCompare(right))),
    );
    if (seenCursors.has(marker)) throw new Error(`Repeated CHZZK cursor: ${marker}`);
    seenCursors.add(marker);
    cursor = following;
  }

  return result;
}

interface Candidate {
  url: string;
  width: number;
  height: number;
  bitrate: number;
  size: number;
  score: number;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function looksLikeMediaUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  const lower = value.toLowerCase();
  return (
    lower.includes(".mp4") ||
    lower.includes(".m3u8") ||
    lower.includes(".mpd") ||
    lower.includes("vodplay") ||
    lower.includes("video")
  );
}

function mediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".mp4")) return "mp4";
  if (lower.includes(".m3u8")) return "m3u8";
  if (lower.includes(".mpd") || lower.includes("vodplay")) return "mpd";
  return "unknown";
}

function scoreCandidate(url: string, object: Record<string, unknown>): Candidate {
  const width = numberValue(firstValue(object, ["width", "w", "videoWidth"]));
  const height = numberValue(
    firstValue(object, ["height", "h", "videoHeight", "resolution"]),
  );
  const bitrate = numberValue(firstValue(object, ["bitrate", "bitRate", "bandwidth"]));
  const size = numberValue(firstValue(object, ["size", "fileSize"]));
  const type = mediaType(url);
  const typeBonus = type === "mp4" ? 3_000_000_000 : type === "m3u8" ? 2_000_000_000 : 1_000_000_000;
  return {
    url,
    width,
    height,
    bitrate,
    size,
    score: typeBonus + width * height * 100 + bitrate + Math.min(size, 999_999_999),
  };
}

function collectCandidates(value: unknown, candidates: Candidate[], parent?: Record<string, unknown>): void {
  if (typeof value === "string") {
    if (looksLikeMediaUrl(value)) candidates.push(scoreCandidate(value, parent ?? {}));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCandidates(item, candidates, parent);
    return;
  }
  if (!value || typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  const urlKeys = [
    "source",
    "url",
    "videoUrl",
    "videoURL",
    "playUrl",
    "playURL",
    "contentUrl",
    "contentURL",
    "path",
    "baseurl",
    "baseUrl",
    "baseURL",
  ];
  for (const key of urlKeys) {
    const candidate = object[key];
    if (typeof candidate === "string" && looksLikeMediaUrl(candidate)) {
      candidates.push(scoreCandidate(candidate, object));
    }
  }
  for (const nested of Object.values(object)) collectCandidates(nested, candidates, object);
}

function bestCandidate(payload: unknown): Candidate | null {
  const candidates: Candidate[] = [];
  collectCandidates(payload, candidates);
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.score > existing.score) unique.set(candidate.url, candidate);
  }
  return [...unique.values()].sort((left, right) => right.score - left.score)[0] ?? null;
}

function playbackUrl(videoId: string, clipUid: string, version: "v5" | "v9"): string {
  const params = new URLSearchParams({
    seedType: "SPECIFIC",
    serviceType: "CHZZK",
    seedMediaId: videoId,
    mediaType: "VOD",
    panelType: "sdk_chzzk",
    recType: "CHZZK",
    recId: JSON.stringify({ seedClipUID: clipUid, fromType: "GLOBAL", listType: "RECOMMEND" }),
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
  return `https://api-videohub.naver.com/shortformhub/feeds/${version}/card?${params.toString()}`;
}

async function resolveSource(row: Record<string, unknown>): Promise<ClipRecord> {
  const uid = String(firstValue(row, ["clipUID", "clipUid", "clipId", "clipNo"]) ?? "").trim();
  const title = String(firstValue(row, ["clipTitle", "title", "contentTitle"]) ?? `clip_${uid}`);
  const created = String(firstValue(row, ["createdDate", "publishDate", "createdAt"]) ?? "");
  const duration = numberValue(firstValue(row, ["duration", "clipDuration"]));
  const views = numberValue(firstValue(row, ["readCount", "viewCount", "views"]));
  const adult = Boolean(firstValue(row, ["adult"]));
  let videoId = String(firstValue(row, ["videoId", "videoID", "mediaId"]) ?? "");
  const referer = `https://chzzk.naver.com/clips/${uid}`;
  const errors: string[] = [];

  if (!videoId) {
    try {
      const detail = await getJson(`https://api.chzzk.naver.com/service/v1/clips/${uid}/detail`, referer);
      const detailCandidates: string[] = [];
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (value && typeof value === "object") {
          const object = value as Record<string, unknown>;
          const candidate = firstValue(object, ["videoId", "videoID", "mediaId"]);
          if (typeof candidate === "string" && candidate.length > 0) detailCandidates.push(candidate);
          Object.values(object).forEach(visit);
        }
      };
      visit(detail);
      videoId = detailCandidates[0] ?? "";
    } catch (error) {
      errors.push(`detail: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (videoId) {
    for (const version of ["v5", "v9"] as const) {
      try {
        const playback = await getJson(playbackUrl(videoId, uid, version), referer);
        const candidate = bestCandidate(playback);
        if (candidate) {
          return {
            uid,
            title,
            created,
            duration,
            views,
            adult,
            videoId,
            url: referer,
            sourceUrl: candidate.url,
            sourceType: mediaType(candidate.url),
            sourceWidth: candidate.width || null,
            sourceHeight: candidate.height || null,
            resolutionError: null,
          };
        }
        errors.push(`${version}: no media candidate`);
      } catch (error) {
        errors.push(`${version}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    errors.push("missing videoId");
  }

  try {
    const playInfo = await getJson(
      `https://api.chzzk.naver.com/service/v1/play-info/clip/${uid}`,
      referer,
    );
    const candidate = bestCandidate(playInfo);
    if (candidate) {
      return {
        uid,
        title,
        created,
        duration,
        views,
        adult,
        videoId,
        url: referer,
        sourceUrl: candidate.url,
        sourceType: mediaType(candidate.url),
        sourceWidth: candidate.width || null,
        sourceHeight: candidate.height || null,
        resolutionError: null,
      };
    }
    errors.push("play-info: no media candidate");
  } catch (error) {
    errors.push(`play-info: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    uid,
    title,
    created,
    duration,
    views,
    adult,
    videoId,
    url: referer,
    sourceUrl: null,
    sourceType: null,
    sourceWidth: null,
    sourceHeight: null,
    resolutionError: errors.join(" | "),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  callback: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await callback(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export const GET: APIRoute = async () => {
  try {
    const rows = await fetchAllClips();
    const clips = await mapWithConcurrency(rows, 8, resolveSource);
    const resolved = clips.filter((clip) => clip.sourceUrl !== null).length;
    const payload = {
      generatedAt: new Date().toISOString(),
      channelId: CHANNEL_ID,
      clipCount: clips.length,
      resolvedCount: resolved,
      unresolvedCount: clips.length - resolved,
      clips,
    };
    return new Response(JSON.stringify(payload, null, 2), {
      status: clips.length === 42 ? 200 : 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
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
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
};
