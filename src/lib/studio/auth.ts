import type { AstroCookies } from "astro";
import { getStudioConfig } from "@/lib/studio/config";
import { StudioHttpError } from "@/lib/studio/http";

const SESSION_COOKIE = "jaei_studio_session";
export const OAUTH_STATE_COOKIE = "jaei_studio_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "jaei_studio_oauth_verifier";

export type StudioSession = {
  username: string;
  avatarUrl: string;
  expiresAt: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getSigningKey(secret),
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export function randomBase64Url(byteLength = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createSessionCookie(
  cookies: AstroCookies,
  user: Pick<StudioSession, "username" | "avatarUrl">,
  secure: boolean,
): Promise<void> {
  const { sessionSecret } = getStudioConfig();
  if (sessionSecret.length < 32) {
    throw new StudioHttpError(503, "Studio 인증 설정이 완료되지 않았습니다.");
  }

  const payload: StudioSession = {
    ...user,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await sign(encoded, sessionSecret);

  cookies.set(SESSION_COOKIE, `${encoded}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function getStudioSession(
  cookies: AstroCookies,
): Promise<StudioSession | null> {
  const { sessionSecret, allowedUsername } = getStudioConfig();
  const value = cookies.get(SESSION_COOKIE)?.value;
  if (!value || sessionSecret.length < 32) return null;

  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getSigningKey(sessionSecret),
      base64UrlToBytes(signature),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded)),
    ) as StudioSession;
    if (
      payload.expiresAt <= Date.now() ||
      payload.username.toLowerCase() !== allowedUsername.toLowerCase()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireStudioSession(
  cookies: AstroCookies,
): Promise<StudioSession> {
  const session = await getStudioSession(cookies);
  if (!session) {
    throw new StudioHttpError(401, "Studio 로그인이 필요합니다.");
  }
  return session;
}

export function clearStudioSession(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}
