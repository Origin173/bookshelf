import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { visitorKey } from "@/lib/rate-limit";
import { getServices } from "@/services/container";

export const SESSION_COOKIE = "bookshelf_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
export const publicDemo = () => process.env.BOOKSHELF_PUBLIC_DEMO === "1";

export function isAdmin(username: string | null): boolean {
  return (
    !publicDemo() &&
    username !== null &&
    (process.env.BOOKSHELF_ADMINS ?? "")
      .split(",")
      .some((name) => name.trim() === username)
  );
}

export function requestUser(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)bookshelf_session=([^;]+)/)?.[1];
  return sessionUser(cookie);
}

const usernamePattern = /^[a-z][a-z0-9-]{0,31}$/;
const recordPattern = /^v1\.([a-f0-9]{32})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;

function credential(username: string) {
  if (!usernamePattern.test(username)) return null;
  const key = `BOOKSHELF_USER_${username.toUpperCase().replaceAll("-", "_")}`;
  return recordPattern.exec(process.env[key] ?? "");
}

export function accountProfile(username: string) {
  const id = createHash("sha256").update(username).digest("hex").slice(0, 32);
  return {
    id: username === "reader" ? "default" : `account-${id}`,
    name: username,
    createdAt: new Date(0).toISOString(),
  };
}

function signature(payload: string, key: string) {
  return createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest();
}

export function issueSession(username: string, now = Date.now()): string {
  const record = credential(username);
  if (!record) throw new Error("Account unavailable");
  const payload = `${username}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  return `${payload}.${signature(payload, record[3]).toString("hex")}`;
}

export function sessionUser(token: string | undefined, now = Date.now()) {
  const match = /^([a-z][a-z0-9-]{0,31})\.(\d{10})\.([a-f0-9]{64})$/.exec(
    token ?? "",
  );
  if (!match || Number(match[2]) <= Math.floor(now / 1000)) return null;
  const record = credential(match[1]);
  if (!record) return null;
  const expected = signature(`${match[1]}.${match[2]}`, record[3]);
  return timingSafeEqual(expected, Buffer.from(match[3], "hex"))
    ? match[1]
    : null;
}

export async function verifyPassword(
  username: string,
  password: string,
  request: Request,
): Promise<"ok" | "invalid" | "limited"> {
  if (!usernamePattern.test(username) || !password || password.length > 256)
    return "invalid";
  const { limits } = await getServices();
  if (!(await limits.allowsR2(`login:${visitorKey(request)}`)))
    return "limited";
  const record = credential(username);
  const salt = record?.[1] ?? "0".repeat(32);
  const expected = Buffer.from(record?.[2] ?? "0".repeat(64), "hex");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: Uint8Array.from(Buffer.from(salt, "hex")),
      iterations: 100_000,
    },
    material,
    256,
  );
  return timingSafeEqual(Buffer.from(bits), expected) && record
    ? "ok"
    : "invalid";
}

function privateResponse(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set("cache-control", "private, no-store");
  result.headers.append("vary", "Cookie, Authorization");
  return result;
}

export function withAccount<Context extends unknown[]>(
  serve: (request: Request, ...context: Context) => Promise<Response>,
  basic = true,
) {
  return async (request: Request, ...context: Context): Promise<Response> => {
    if (publicDemo()) return serve(request, ...context);
    if (requestUser(request))
      return privateResponse(await serve(request, ...context));
    const header = request.headers.get("authorization") ?? "";
    const match =
      basic && header.length <= 2048 && /^Basic ([a-z0-9+/]+=*)$/i.exec(header);
    if (match) {
      const credentials = Buffer.from(match[1], "base64").toString("utf8");
      const separator = credentials.indexOf(":");
      if (separator > 0) {
        const result = await verifyPassword(
          credentials.slice(0, separator),
          credentials.slice(separator + 1),
          request,
        );
        if (result === "ok")
          return privateResponse(await serve(request, ...context));
        if (result === "limited")
          return new Response(null, {
            status: 429,
            headers: { "retry-after": "60", "cache-control": "no-store" },
          });
      }
    }
    const headers = new Headers({ "cache-control": "private, no-store" });
    if (basic)
      headers.set(
        "www-authenticate",
        'Basic realm="Bookshelf", charset="UTF-8"',
      );
    return new Response(null, { status: 401, headers });
  };
}
