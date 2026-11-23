import type { Book } from "@bookshelf/core";

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
