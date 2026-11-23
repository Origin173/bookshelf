import { readBody } from "@/lib/request-body";
import {
  issueSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  verifyPassword,
} from "@/services/auth";

function redirectTo(location: string, session?: string) {
  const headers = new Headers({
    location,
    "cache-control": "private, no-store",
  });
  if (session !== undefined) {
    headers.set(
      "set-cookie",
      `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session ? SESSION_SECONDS : 0}`,
    );
  }
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  ) {
    return new Response(null, { status: 415 });
  }
  const body = await readBody(request, 4096);
  if (body === null) return new Response(null, { status: 413 });
  const form = new URLSearchParams(body);
  if (form.get("intent") === "logout") return redirectTo("/login", "");
  const username = (form.get("username") ?? "").trim().toLowerCase();
  const result = await verifyPassword(
    username,
    form.get("password") ?? "",
    request,
  );
  if (result !== "ok") return redirectTo(`/login?error=${result}`);
  return redirectTo("/", issueSession(username));
}
