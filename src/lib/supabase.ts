const env = import.meta.env as Record<string, string | undefined>;

function readEnv(name: string): string {
  const processValue =
    typeof process !== "undefined" ? process.env[name] : undefined;
  return (processValue ?? env[name] ?? "").trim();
}

export function getSupabaseConfig() {
  return {
    url: readEnv("SUPABASE_URL").replace(/\/$/, ""),
    serviceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function isSupabaseConfigured(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.serviceRoleKey);
}

type SupabaseErrorPayload = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export class SupabaseRequestError extends Error {
  status: number;
  code?: string;

  constructor(status: number, payload: SupabaseErrorPayload | null) {
    super(payload?.message || "데이터베이스 요청을 완료하지 못했습니다.");
    this.status = status;
    this.code = payload?.code;
  }
}

export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    throw new SupabaseRequestError(503, {
      message: "Supabase 연결 정보가 아직 설정되지 않았습니다.",
    });
  }

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as SupabaseErrorPayload | null;
    throw new SupabaseRequestError(response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
