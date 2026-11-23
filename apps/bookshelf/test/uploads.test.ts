import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOKS, bookPdf } from "@bookshelf/fixtures";
import { LibraryUnavailableError } from "../src/services/errors.ts";
import { importBook, uploadIndex } from "../src/services/uploads.ts";
import { memoryStorage, must } from "./lib/storage.ts";

test("retrying after an index write failure publishes the existing upload once", async () => {
  const memory = memoryStorage();
  const { storage } = memory;
  const write = must(storage.write);
  const file = new File([new Uint8Array(bookPdf(BOOKS[0]))], "example.pdf");
  let interrupt = true;
  storage.writeIfMatch = async (key, bytes, type, expected) => {
    if (interrupt && key.endsWith("/catalog.json"))
      throw new Error("temporarily unavailable");
    if (((await storage.head(key))?.etag ?? null) !== expected) return false;
    await write(key, bytes, type);
    return true;
  };
  await assert.rejects(
    importBook(storage, file, "One", ""),
    LibraryUnavailableError,
  );
  assert.deepEqual((await uploadIndex(storage)).books, []);
  interrupt = false;
  const result = await importBook(storage, file, "One", "");
  assert.equal(result.result, "uploaded");
  assert.equal(
    (await importBook(storage, file, "Other title", "")).result,
    "duplicate",
  );
  assert.deepEqual(
    (await uploadIndex(storage)).books.map((b) => b.title),
    ["One"],
  );
  assert.equal(memory.writes.filter((w) => w.key.endsWith(".pdf")).length, 1);
});
