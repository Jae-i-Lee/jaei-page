import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/studio/config", () => ({
  getStudioConfig: () => ({
    vercelToken: "test-token",
    vercelProjectId: "test-project",
    vercelTeamId: "",
  }),
}));

import { getAnalyticsDashboard } from "@/lib/studio/analytics";

describe("getAnalyticsDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps every analytics request within the Hobby plan's 31-day range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return Response.json({
        data: { count: 0 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAnalyticsDashboard();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    for (const [input] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      const since = Number(url.searchParams.get("since"));
      expect(since).toBeGreaterThan(0);
      expect(Date.now() - since).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(monthUrl.searchParams.get("since")).toBe(
      String(monthStart.getTime()),
    );
  });

  it("keeps successful dashboard metrics when one analytics request fails", async () => {
    let requestNumber = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requestNumber += 1;
      if (requestNumber === 1) {
        return Response.json(
          { error: { message: "range unavailable" } },
          { status: 400 },
        );
      }
      return Response.json({
        data: url.pathname.endsWith("/count") ? { count: 7 } : [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await getAnalyticsDashboard();

    expect(dashboard.totals).toEqual({
      month: 0,
      today: 7,
      sevenDays: 7,
      thirtyDays: 7,
    });
    expect(dashboard.topPosts).toEqual([]);
    expect(dashboard.trend).toEqual([]);
  });

  it("still reports an error when every analytics request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("analytics unavailable");
      }),
    );

    await expect(getAnalyticsDashboard()).rejects.toThrow(
      "analytics unavailable",
    );
  });
});
