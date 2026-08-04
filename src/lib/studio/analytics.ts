import { getStudioConfig } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";

const ANALYTICS_API = "https://api.vercel.com/v1/query/web-analytics/visits";

type AnalyticsResponse = {
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
};

type AnalyticsRow = Record<string, unknown>;

function metricValue(row: AnalyticsRow): number {
  const preferredKeys = [
    "count",
    "pageviews",
    "pageViews",
    "views",
    "visits",
    "total",
    "value",
  ];
  for (const key of preferredKeys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  const fallback = Object.entries(row).find(
    ([key, value]) =>
      key !== "timestamp" &&
      typeof value === "number" &&
      Number.isFinite(value),
  );
  return typeof fallback?.[1] === "number" ? fallback[1] : 0;
}

async function queryAnalytics(
  endpoint: "count" | "aggregate",
  options: {
    since?: number;
    until?: number;
    by?: string[];
    limit?: number;
  } = {},
): Promise<AnalyticsResponse> {
  const { vercelToken, vercelProjectId, vercelTeamId } = getStudioConfig();
  if (!vercelToken || !vercelProjectId) {
    throw new StudioHttpError(503, "Vercel Analytics 설정이 필요합니다.");
  }

  const query = new URLSearchParams({
    projectId: vercelProjectId,
    filter: "environment eq 'production'",
  });
  if (vercelTeamId) query.set("teamId", vercelTeamId);
  if (options.since !== undefined) {
    query.set("since", String(options.since));
  }
  if (options.until !== undefined) {
    query.set("until", String(options.until));
  }
  if (options.limit) query.set("limit", String(options.limit));
  for (const dimension of options.by || []) query.append("by", dimension);

  const response = await fetch(`${ANALYTICS_API}/${endpoint}?${query}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${vercelToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new StudioHttpError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      payload?.error?.message ||
        "Vercel Analytics 데이터를 불러오지 못했습니다.",
    );
  }
  return (await response.json()) as AnalyticsResponse;
}

async function countSince(since: number): Promise<number> {
  const response = await queryAnalytics("count", {
    since,
    until: Date.now(),
  });
  return response.data && !Array.isArray(response.data)
    ? metricValue(response.data)
    : 0;
}

export async function getAnalyticsDashboard() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    monthResult,
    todayResult,
    sevenDaysResult,
    thirtyDaysResult,
    pathsResult,
    dailyResult,
  ] = await Promise.allSettled([
    countSince(monthStart.getTime()),
    countSince(today.getTime()),
    countSince(now - 7 * day),
    countSince(now - 30 * day),
    queryAnalytics("aggregate", {
      since: now - 30 * day,
      until: now,
      by: ["requestPath"],
      limit: 100,
    }),
    queryAnalytics("aggregate", {
      since: now - 13 * day,
      until: now,
      by: ["day"],
      limit: 30,
    }),
  ]);

  const results = [
    monthResult,
    todayResult,
    sevenDaysResult,
    thirtyDaysResult,
    pathsResult,
    dailyResult,
  ];
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length === results.length) {
    throw failures[0]?.reason ?? new Error("Analytics requests failed.");
  }

  const month = monthResult.status === "fulfilled" ? monthResult.value : 0;
  const todayCount = todayResult.status === "fulfilled" ? todayResult.value : 0;
  const sevenDays =
    sevenDaysResult.status === "fulfilled" ? sevenDaysResult.value : 0;
  const thirtyDays =
    thirtyDaysResult.status === "fulfilled" ? thirtyDaysResult.value : 0;
  const paths =
    pathsResult.status === "fulfilled" ? pathsResult.value : { data: [] };
  const daily =
    dailyResult.status === "fulfilled" ? dailyResult.value : { data: [] };

  const pathRows = Array.isArray(paths.data) ? paths.data : [];
  const topPosts = pathRows
    .map((row) => ({
      path: typeof row.requestPath === "string" ? row.requestPath : "",
      views: metricValue(row),
    }))
    .filter(
      (row) =>
        row.views > 0 &&
        /^\/(psychology|philosophy|reflections)\/[^/]+\/?$/.test(row.path),
    )
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const dailyRows = Array.isArray(daily.data) ? daily.data : [];
  const trend = dailyRows
    .map((row) => ({
      date:
        row.timestamp instanceof Date
          ? row.timestamp.toISOString().slice(0, 10)
          : String(row.timestamp || "").slice(0, 10),
      views: metricValue(row),
    }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totals: {
      month,
      today: todayCount,
      sevenDays,
      thirtyDays,
    },
    topPosts,
    trend,
    metric: "pageviews",
  };
}
