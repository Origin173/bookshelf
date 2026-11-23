import assert from "node:assert/strict";
import { test } from "node:test";
import { loginBook, loginPath } from "@/lib/login-book";

test("login resumes only a book key and keeps it through a password retry", () => {
  const book = "island-atlas/atlas.epub";
  assert.equal(loginBook(book), book);
  for (const other of [
    undefined,
    [book],
    "/",
    "/admin",
    "https://example.org/",
  ])
    assert.equal(loginBook(other), undefined);
  const retry = new URL(loginPath(book, "invalid"), "https://bookshelf.test");
  assert.equal(retry.pathname, "/login");
  assert.equal(retry.searchParams.get("book"), book);
  assert.equal(retry.searchParams.get("error"), "invalid");
  assert.equal(loginPath(), "/login");
});
