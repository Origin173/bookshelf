import { type Book, findIsbn } from "@bookshelf/core";

/** Only a whole, checksummed ISBN switches the shelf to identifier search. */
export function isbnQuery(query: string): string | undefined {
  const normalized = query
    .replace(/[\s\u2010-\u2013\uFF0D-]/g, "")
    .toUpperCase();
  return findIsbn([normalized]) === normalized ? normalized : undefined;
}

export function searchBooks<
  T extends Pick<Book, "title" | "authors" | "publisher">,
>(books: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return books;

  return books.filter((book) =>
    [book.title, book.authors.join(" "), book.publisher ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}
