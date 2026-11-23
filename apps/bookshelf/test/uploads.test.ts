import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOKS, bookPdf, coverArt } from "@bookshelf/fixtures";
import { LibraryUnavailableError } from "../src/services/errors.ts";
import { importBook, uploadIndex } from "../src/services/uploads.ts";
import { memoryStorage, must } from "./lib/storage.ts";

test("retrying after an index write failure publishes the existing upload once", async () => {
  const memory = memoryStorage();
  const { storage } = memory;
  const write = must(storage.write);
  const file = new File([new Uint8Array(bookPdf(BOOKS[0]))], "example.pdf");
  const details = {
    isbn: "9780000000002",
    cover: new Uint8Array(coverArt(12, 18, [1, 2, 3])),
  };
  let interrupt = true;
  storage.writeIfMatch = async (key, bytes, type, expected) => {
    if (interrupt && key.endsWith("/catalog.json"))
      throw new Error("temporarily unavailable");
    if (((await storage.head(key))?.etag ?? null) !== expected) return false;
    await write(key, bytes, type);
    return true;
  };
  await assert.rejects(
    importBook(storage, file, "One", "First；Second", details),
    LibraryUnavailableError,
  );
  assert.deepEqual((await uploadIndex(storage)).books, []);
  interrupt = false;
  const result = await importBook(
    storage,
    file,
    "One",
    "First；Second",
    details,
  );
  assert.equal(result.result, "uploaded");
  assert.equal(
    (await importBook(storage, file, "Other title", "")).result,
    "duplicate",
  );
  const { books } = await uploadIndex(storage);
  assert.equal(books.length, 1);
  assert.equal(books[0]?.title, "One");
  assert.deepEqual(books[0]?.authors, ["First", "Second"]);
  assert.equal(books[0]?.isbn, details.isbn);
  assert.match(books[0]?.cover ?? "", /^cover-[0-9a-f]{64}\.png$/);
  assert.equal(memory.writes.filter((w) => w.key.endsWith(".png")).length, 1);
  assert.equal(memory.writes.filter((w) => w.key.endsWith(".pdf")).length, 1);
});
