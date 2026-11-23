import { type Book, isUploadId } from "@bookshelf/core";
import { editionKey } from "@/lib/isbn";

export function missingUploadFormat(book: Book): "epub" | "pdf" | undefined {
  if (isUploadId(book.id) && book.formats.length === 1)
    return book.formats[0].format === "pdf" ? "epub" : "pdf";
}

type Edition = Pick<Book, "id" | "title" | "authors" | "publisher"> & {
  formats: string[];
  missingFormat?: "epub" | "pdf";
};

export function uploadEditions(books: Book[]) {
  const editions: Record<string, Edition[]> = {};
  for (const book of books) {
    const key = book.isbn && editionKey(book.isbn);
    if (!key) continue;
    editions[key] ??= [];
    editions[key].push({
      id: book.id,
      title: book.title,
      authors: book.authors,
      publisher: book.publisher,
      formats: book.formats.map((f) => f.format.toUpperCase()),
      missingFormat: missingUploadFormat(book),
    });
  }
  return editions;
}
