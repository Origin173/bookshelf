import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createStorage } from "@bookshelf/provider-fs/node";
import {
  personalShelf,
  saveShelfEntry,
} from "../src/services/personal-shelf.ts";

test("personal shelves isolate accounts and reject stale edits", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bookshelf-personal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storage = createStorage({ directory });
  const wanted = { status: "wantToRead", favorite: true } as const;
  assert.ok(await saveShelfEntry(storage, "first", "atlas", wanted, null));
  assert.equal((await personalShelf(storage, "second")).books.size, 0);
  const current = await personalShelf(storage, "first");
  assert.deepEqual(current.books.get("atlas"), wanted);
  const clear = { status: "", favorite: false } as const;
  assert.equal(
    await saveShelfEntry(storage, "first", "atlas", clear, null),
    false,
  );
  assert.deepEqual(
    (await personalShelf(storage, "first")).books.get("atlas"),
    wanted,
  );
  assert.ok(
    await saveShelfEntry(storage, "first", "atlas", clear, current.etag),
  );
  assert.equal((await personalShelf(storage, "first")).books.size, 0);
});
