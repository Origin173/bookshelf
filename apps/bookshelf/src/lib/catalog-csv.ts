import type { Book } from "@bookshelf/core";

export type CatalogCsvBook = Pick<Book, "title" | "authors" | "isbn"> & {
  formats: string[];
};

function csvCell(value: string): string {
  // Check compatibility characters and ignored prefixes without changing the text.
  const formulaLike = /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+@\t\r\n-]/u.test(
    value.normalize("NFKC"),
  );
  const text = formulaLike ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function catalogCsv(books: readonly CatalogCsvBook[]): string {
  const rows = [
    ["Title", "Authors", "ISBN", "Formats"],
    ...books.map(({ title, authors, isbn, formats }) => [
      title,
      authors.join(", "),
      isbn ?? "",
      formats.join(", "),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
