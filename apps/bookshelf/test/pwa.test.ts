import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("offline fallback handles reader navigation and leaves private requests alone", async () => {
  const origin = "https://shelf.test";
  type Event = {
    request: { method: string; mode: string; url: URL };
    respondWith(response: Promise<Response>): void;
  };
  let handle: (event: Event) => void;
  const script = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  runInNewContext(script, {
    URL,
    Response,
    fetch: () => Promise.reject(new Error("offline")),
    self: {
      location: { origin },
      navigator: { language: "en" },
      addEventListener(name: string, callback: typeof handle) {
        if (name === "fetch") handle = callback;
      },
    },
  });
  async function request(path: string, method = "GET", mode = "navigate") {
    let response: Promise<Response> | undefined;
    handle({
      request: { method, mode, url: new URL(path, origin) },
      respondWith(value) {
        response = value;
      },
    });
    return response;
  }
  for (const path of [
    "/api/progress",
    "/opds",
    "/book/sample.epub/chapter.xhtml",
    "/download/sample.pdf",
    "/cover/sample.png",
  ]) {
    assert.equal(await request(path), undefined);
  }
  assert.equal(await request("/login/session", "POST"), undefined);
  assert.equal(
    await request("/read/synthetic/book.pdf", "GET", "cors"),
    undefined,
  );
  const fallback = await request("/read/synthetic/book.pdf");
  assert.equal(fallback?.status, 503);
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  const html = await fallback.text();
  assert.match(html, /Open shelf again/);
  assert.doesNotMatch(html, /synthetic/);
});
