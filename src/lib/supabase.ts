const env = import.meta.env as Record<string, string | undefined>;

function readEnv(name: string): string {
  const processValue =
    typeof process !== "undefined" ? process.env[name] : undefined;
  return (processValue ?? env[name] ?? "").trim();
}

function isSecretKey(value: string): boolean {
  return value.startsWith("sb_secret_");
}

export function getSupabaseConfig() {
  return {
    url: readEnv("SUPABASE_URL").replace(/\/$/, ""),
    secretKey: readEnv("SUPABASE_SECRET_KEY"),
  };
}

export function isSupabaseConfigured(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.url && isSecretKey(config.secretKey));
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
  const { url, secretKey } = getSupabaseConfig();
  if (!url || !isSecretKey(secretKey)) {
    throw new SupabaseRequestError(503, {
      message:
        "SUPABASE_URL과 sb_secret_ 형식의 SUPABASE_SECRET_KEY가 필요합니다.",
    });
  }

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      apikey: secretKey,
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
