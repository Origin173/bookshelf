import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOKS, bookPdf, coverArt, epub } from "@bookshelf/fixtures";
import { LibraryUnavailableError } from "../src/services/errors.ts";
import {
  appendFormat,
  importBook,
  uploadIndex,
} from "../src/services/uploads.ts";
import { memoryStorage, must } from "./lib/storage.ts";

test("retrying after an index write failure publishes the existing upload once", async () => {
  const memory = memoryStorage();
  const { storage } = memory;
  const write = must(storage.write);
  const file = new File([new Uint8Array(bookPdf(BOOKS[0]))], "example.pdf");
  const details = {
    subjects: ["Coasts", "Maps"],
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
  assert.deepEqual(books[0]?.subjects, details.subjects);
  assert.match(books[0]?.cover ?? "", /^cover-[0-9a-f]{64}\.png$/);
  assert.equal(memory.writes.filter((w) => w.key.endsWith(".png")).length, 1);
  assert.equal(memory.writes.filter((w) => w.key.endsWith(".pdf")).length, 1);
});

test("two additions cannot replace each other's file or lose an unrelated index change", async () => {
  const { storage } = memoryStorage();
  const write = must(storage.write);
  let pause: (() => Promise<void>) | undefined;
  storage.writeIfMatch = async (key, bytes, type, expected) => {
    if (key.endsWith("/catalog.json") && pause) {
      const run = pause;
      pause = undefined;
      await run();
    }
    if (((await storage.head(key))?.etag ?? null) !== expected) return false;
    await write(key, bytes, type);
    return true;
  };
  const pdf = new File([new Uint8Array(bookPdf(BOOKS[0]))], "one.pdf");
  const first = await importBook(storage, pdf, "First", "Author");
  assert.ok("id" in first && first.id);
  const id = first.id;
  const a = new File([new Uint8Array(epub(BOOKS[0]))], "a.epub");
  const b = new File([new Uint8Array(epub(BOOKS[1]))], "b.epub");
  const other = new File([new Uint8Array(bookPdf(BOOKS[1]))], "two.pdf");
  pause = async () => {
    assert.equal(
      (await importBook(storage, other, "Second", "")).result,
      "uploaded",
    );
    assert.equal((await appendFormat(storage, b, id)).result, "formatAdded");
  };
  assert.equal((await appendFormat(storage, a, id)).result, "conflict");
  assert.equal((await appendFormat(storage, a, id)).result, "formatExists");
  assert.equal((await appendFormat(storage, b, id)).result, "formatAdded");
  assert.equal(
    (await importBook(storage, b, "Another name", "")).result,
    "duplicate",
  );
  const { books } = await uploadIndex(storage);
  assert.deepEqual(
    books.map((book) => book.title),
    ["First", "Second"],
  );
  const files = books[0]?.formats;
  assert.ok(files && files.length === 2);
  assert.equal(files[0].file, "book.pdf");
  assert.deepEqual(
    await storage.readBytes(`.bookshelf/uploads/${id}/${files[1].file}`),
    new Uint8Array(await b.arrayBuffer()),
  );
});
