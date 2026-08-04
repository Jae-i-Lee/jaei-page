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
  });

  it("sends the required since parameter with every analytics request", async () => {
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
      expect(url.searchParams.has("since")).toBe(true);
    }

    const totalUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(totalUrl.searchParams.get("since")).toBe("0");
  });
});
