import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { progressFile } from "@bookshelf/core";
import { POST as edit } from "../src/app/admin/subjects/route.ts";
import { POST as upload } from "../src/app/admin/upload/route.ts";
import { GET as book } from "../src/app/book/[...path]/route.ts";
import { GET as cover } from "../src/app/cover/[...key]/route.ts";
import { GET as download } from "../src/app/download/[...key]/route.ts";
import { POST as login } from "../src/app/login/session/route.ts";
import {
  accountProfile,
  issueSession,
  SESSION_SECONDS,
  sessionUser,
} from "../src/services/auth.ts";
import { createServices, setServices } from "../src/services/container.ts";
import { handle } from "./lib/next-headers.ts";
import { memoryStorage, nullCache } from "./lib/storage.ts";

const { POST: progress } = await import("../src/app/api/progress/route.ts");
const { GET: opds } = await import("../src/app/opds/[[...path]]/route.ts");
const origin = "https://shelf.test";
const password = randomBytes(24).toString("hex");
const forKey = { params: Promise.resolve({ key: ["sample", "sample.pdf"] }) };
const forPath = { params: Promise.resolve({ path: ["sample"] }) };
const files = {
  "sample/sample.pdf": "example content",
  "catalog.json": JSON.stringify({
    version: 1,
    books: [{ id: "sample", title: "Sample", authors: [], formats: [] }],
  }),
};
let library = memoryStorage(files);

function secret() {
  const salt = randomBytes(16);
  return `v1.${salt.toString("hex")}.${pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex")}.${randomBytes(32).toString("hex")}`;
}
beforeEach(() => {
  delete process.env.BOOKSHELF_PUBLIC_DEMO;
  process.env.BOOKSHELF_USER_READER = secret();
  process.env.BOOKSHELF_USER_ALICE = secret();
  library = memoryStorage(files);
  setServices(createServices(library.storage, nullCache()));
});
afterEach(() => {
  delete process.env.BOOKSHELF_USER_READER;
  delete process.env.BOOKSHELF_USER_ALICE;
  setServices(null);
});

function form(data: Record<string, string>, from = origin) {
  return login(
    new Request(`${origin}/login/session`, {
      method: "POST",
      headers: { origin: from },
      body: new URLSearchParams(data),
    }),
  );
}

test("private routes challenge anonymous readers before accessing storage", async () => {
  const request = new Request(origin, {
    headers: { cookie: "bookshelf_profile=default" },
  });
  for (const response of await Promise.all([
    cover(request, forKey),
    download(request, forKey),
    book(request, forPath),
    opds(request, forPath),
  ])) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /^Basic /);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  assert.equal((await progress(request)).status, 401);
});

test("OPDS links retain the HTTPS address of a local Worker preview", async () => {
  const request = new Request("https://localhost:8787/opds?format=json", {
    headers: {
      host: "localhost:8787",
      "x-forwarded-proto": "http",
      cookie: `bookshelf_session=${issueSession("reader")}`,
    },
  });
  const response = await opds(request, {
    params: Promise.resolve({ path: [] }),
  });
  assert.equal(response.status, 200);
  const feed = await response.json();
  assert.equal(new URL(feed.links[0].href).origin, "https://localhost:8787");
});

test("OPDS acquisitions accept HTTP Basic on the file itself and forbid public caching", async () => {
  const request = (value: string) =>
    new Request(origin, {
      headers: {
        authorization: `Basic ${Buffer.from(value).toString("base64")}`,
      },
    });
  assert.equal((await download(request("reader:wrong"), forKey)).status, 401);
  const response = await download(request(`reader:${password}`), forKey);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), files["sample/sample.pdf"]);
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private, no-store/,
  );
});

test("browser login authenticates a scoped cookie and logout clears it", async () => {
  assert.equal(
    (await form({ username: "reader", password }, "https://other.test")).status,
    403,
  );
  assert.equal(
    (await form({ username: "reader", password: "wrong" })).headers.get(
      "set-cookie",
    ),
    null,
  );
  const response = await form({ username: "reader", password });
  assert.equal(response.headers.get("location"), "/");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.equal(
    (
      await download(
        new Request(origin, { headers: { cookie: cookie.split(";")[0] } }),
        forKey,
      )
    ).status,
    200,
  );
  assert.match(
    (await form({ intent: "logout" })).headers.get("set-cookie") ?? "",
    /Max-Age=0/,
  );
});

test("expired sessions and sessions issued before password rotation are rejected", () => {
  const now = Date.now();
  const token = issueSession("reader", now);
  assert.equal(sessionUser(token, now), "reader");
  assert.equal(sessionUser(token.replace("reader.", "alice."), now), null);
  assert.equal(sessionUser(token, now + SESSION_SECONDS * 1000), null);
  process.env.BOOKSHELF_USER_READER = secret();
  assert.equal(sessionUser(token, now), null);
});

test("web progress belongs to the account across devices and ignores the legacy profile cookie", async () => {
  const alice = accountProfile("alice").id;
  const post = (username: string, profileId: string, page: number) =>
    handle(
      progress,
      new Request(`${origin}/api/progress`, {
        method: "POST",
        headers: {
          cookie: `bookshelf_session=${issueSession(username)}; bookshelf_profile=default`,
        },
        body: JSON.stringify({ bookId: "sample", profileId, page }),
      }),
    );
  assert.equal((await post("reader", "default", 2)).status, 200);
  assert.equal((await post("alice", "default", 5)).status, 409);
  assert.equal((await post("alice", alice, 8)).status, 200);
  assert.equal((await post("alice", alice, 9)).status, 200);
  const saved = (id: string) =>
    library.json<{ books: { sample: { page: number } } }>(progressFile(id))
      .books.sample.page;
  assert.deepEqual([saved("default"), saved(alice)], [2, 9]);
});

test("catalog writes require a private admin account and writable storage", async () => {
  process.env.BOOKSHELF_ADMINS = "alice";
  const submit = async (username?: string) =>
    Promise.all(
      [edit, upload].map(
        async (handler) =>
          (
            await handler(
              new Request(
                `${origin}/admin/${handler === edit ? "subjects" : "upload"}`,
                {
                  method: "POST",
                  headers: {
                    origin,
                    ...(username && {
                      cookie: `bookshelf_session=${issueSession(username)}`,
                    }),
                  },
                  body: new URLSearchParams({
                    id: "sample",
                    subjects: "Fiction",
                  }),
                },
              ),
            )
          ).status,
      ),
    );
  try {
    library.storage.writeIfMatch = async () => {
      throw new Error("unexpected write");
    };
    assert.deepEqual(await submit(), [403, 403]);
    assert.deepEqual(await submit("reader"), [403, 403]);
    process.env.BOOKSHELF_PUBLIC_DEMO = "1";
    assert.deepEqual(await submit("alice"), [403, 403]);
    delete process.env.BOOKSHELF_PUBLIC_DEMO;
    setServices(
      createServices(
        memoryStorage(files, { writable: false }).storage,
        nullCache(),
      ),
    );
    assert.deepEqual(await submit("alice"), [403, 403]);
    assert.equal(library.reads.length, 0);
  } finally {
    delete process.env.BOOKSHELF_ADMINS;
    delete process.env.BOOKSHELF_PUBLIC_DEMO;
  }
});
