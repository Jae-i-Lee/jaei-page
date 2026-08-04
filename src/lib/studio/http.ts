const jsonHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

export class StudioHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StudioHttpError) {
    return json({ error: error.message }, error.status);
  }

  console.error("Jaei Studio request failed", error);
  return json(
    { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
    500,
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new StudioHttpError(403, "허용되지 않은 요청입니다.");
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 250_000) {
    throw new StudioHttpError(413, "글의 크기가 너무 큽니다.");
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new StudioHttpError(400, "요청 형식이 올바르지 않습니다.");
  }
}
