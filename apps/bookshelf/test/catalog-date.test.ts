import assert from "node:assert/strict";
import test from "node:test";
import {
  sortByCatalogDate,
  validCatalogDate,
} from "../src/lib/catalog-date.ts";

test("editable dates accept partial years and real calendar days", () => {
  for (const date of ["180", "1984", "1984-06", "2000-02-29"])
    assert.equal(validCatalogDate(date), true, date);
  for (const date of [
    "",
    "1900-02-29",
    "2024-13",
    "2024-06-01T01:00:00Z",
    "circa 1890",
  ])
    assert.equal(validCatalogDate(date), false, date);
});

test("catalog dates keep partial dates, ties and undated books in order", () => {
  const books = [
    undefined,
    "2001-04-01",
    "180",
    "2001",
    "2001-04",
    "2001-02-29",
    "2024-02-29T23:00:00-07:00",
    "circa 1920",
  ].map((published) => ({ published }));
  const order = (indices: number[]) => indices.map((i) => books[i]);
  assert.deepEqual(
    sortByCatalogDate(books, "newest"),
    order([6, 1, 4, 3, 2, 0, 5, 7]),
  );
  assert.deepEqual(
    sortByCatalogDate(books, "oldest"),
    order([2, 3, 1, 4, 6, 0, 5, 7]),
  );
});
