import assert from "node:assert/strict";
import test from "node:test";
import { swapListNeighbors } from "../src/services/book-lists.ts";

test("moving visible neighbors preserves unpublished members and rejects stale pairs", () => {
  const books = ["one", "unpublished", "two", "three"];
  const visible = new Set(["one", "two", "three"]);
  assert.equal(swapListNeighbors(books, "two", "one", visible), true);
  assert.deepEqual(books, ["two", "unpublished", "one", "three"]);
  visible.add("unpublished");
  assert.equal(swapListNeighbors(books, "one", "two", visible), false);
  assert.deepEqual(books, ["two", "unpublished", "one", "three"]);
});
