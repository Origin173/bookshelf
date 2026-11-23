import { headers } from "next/headers";

/**
 * Where this request arrived, which is a different question from what the
 * shelf calls itself — and the reason the two are separate modules. This one
 * reads `next/headers` and so can only run inside a request; `site.ts` is
 * constants, and anything may import it.
 */

/** A loopback host, where local development commonly uses HTTP or HTTPS. */
function isLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

/** A header a proxy may have written as a list; the first entry is ours. */
function first(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

/**
 * The origin this instance is reached at, for the absolute URLs that link
 * previews and canonical tags require.
 *
 * Read from the request rather than configured, so a self-hosted shelf
 * describes itself correctly wherever it is served from — the same reasoning
 * that keeps the provider out of the app. A hardcoded domain would have every
 * instance advertising someone else's.
 *
 * BOOKSHELF_SITE_URL wins where the public address is not the one the app is
 * reached at: behind a proxy that does not say so, or where previews should
 * name a canonical host rather than whichever alias was used.
 */
export async function siteOrigin(request?: Request): Promise<URL> {
  const configured = process.env.BOOKSHELF_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // A malformed override is worth ignoring rather than failing a render;
      // the request itself still knows where it arrived.
    }
  }

  const url = request && new URL(request.url);
  const list = request?.headers ?? (await headers());
  const host =
    first(list.get("x-forwarded-host")) ??
    first(list.get("host")) ??
    url?.host ??
    "localhost:3000";

  // A TLS Wrangler preview hands Next an HTTP forwarding header for its
  // internal hop. Its route request still carries the external HTTPS URL.
  const local = isLocal(host);
  if (local && url?.protocol === "https:") return new URL(`https://${host}`);
  const protocol =
    first(list.get("x-forwarded-proto")) ?? (local ? "http" : "https");
  return new URL(`${protocol}://${host}`);
}
