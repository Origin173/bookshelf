import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createStorage } from "@bookshelf/provider-fs/node";
import { bookBookmarks } from "../src/services/bookmarks.ts";

test("concurrent bookmarks merge and remain private to each account and book format", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bookshelf-bookmarks-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storage = createStorage({ directory });
  const read = (user: string, format: string) =>
    bookBookmarks(storage, user, `atlas/atlas.${format}`, format);
  const add = (position: number) =>
    bookBookmarks(storage, "reader", "atlas/atlas.pdf", "pdf", {
      intent: "add",
      mark: { position },
    });
  const pages = [28, 4];
  const writes = await Promise.all(pages.map(add));
  for (const [index, result] of writes.entries()) {
    if ("error" in result) {
      assert.equal(result.error, "bookmarkConflict");
      assert.ok("items" in (await add(pages[index])));
    } else {
      assert.ok(result.items.some((mark) => mark.position === pages[index]));
    }
  }
  assert.deepEqual(await add(4), {
    items: [{ position: 4 }, { position: 28 }],
    writable: true,
  });
  const rename = (name: string, previous?: string) =>
    bookBookmarks(storage, "reader", "atlas/atlas.pdf", "pdf", {
      intent: "rename",
      mark: { position: 4, name: previous },
      name,
    });
  assert.deepEqual(await rename("  Harbor map  "), {
    items: [{ position: 4, name: "Harbor map" }, { position: 28 }],
    writable: true,
  });
  assert.deepEqual(await rename("A stale edit"), { error: "bookmarkConflict" });
  assert.deepEqual(await rename("x".repeat(81), "Harbor map"), {
    error: "unavailable",
  });
  const note = (text: string, previous?: string) =>
    bookBookmarks(storage, "reader", "atlas/atlas.pdf", "pdf", {
      intent: "note",
      mark: { position: 4, note: previous },
      note: text,
    });
  const annotated = {
    position: 4,
    name: "Harbor map",
    note: "First line\n第二行",
  };
  assert.deepEqual(await note(annotated.note), {
    items: [annotated, { position: 28 }],
    writable: true,
  });
  assert.deepEqual(await note("stale draft"), { error: "bookmarkConflict" });
  assert.deepEqual(await note("x".repeat(2001), annotated.note), {
    error: "unavailable",
  });
  assert.deepEqual(await note("", annotated.note), {
    items: [{ position: 4, name: "Harbor map" }, { position: 28 }],
    writable: true,
  });
  assert.deepEqual(await rename("", "Harbor map"), {
    items: [{ position: 4 }, { position: 28 }],
    writable: true,
  });
  assert.deepEqual(await read("other", "pdf"), { items: [], writable: true });
  assert.deepEqual(await read("reader", "epub"), { items: [], writable: true });
  assert.deepEqual(
    await bookBookmarks(storage, "reader", "atlas/atlas.pdf", "pdf", {
      intent: "remove",
      mark: { position: 4 },
    }),
    { items: [{ position: 28 }], writable: true },
  );
  assert.deepEqual(await rename("Removed location"), {
    error: "bookmarkConflict",
  });
});
