import type { Book } from "@bookshelf/core";
import { isbnQuery } from "@/lib/isbn";

export function searchBooks(books: Book[], query: string): Book[] {
  const isbn = isbnQuery(query);
  return isbn
    ? books.filter((book) => book.isbn === isbn)
    : searchBookText(books, query);
}

export function searchBookText<
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
