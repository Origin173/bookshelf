import type { Book } from "@bookshelf/core";

function catalogDay(value?: string): number | undefined {
  const parts =
    /^(\d{1,4})(?:-(\d{2})(?:-(\d{2})(?:T\d{2}:\d{2}\S*)?)?)?$/.exec(
      value?.trim() ?? "",
    );
  if (!parts) return;
  const [, year, month = "01", day = "01"] = parts;
  // Compare partial dates at the start of their period. Keep the original
  // text on the shelf, including the local calendar day of a timestamp.
  const iso = `${year.padStart(4, "0")}-${month}-${day}`;
  const time = Date.parse(iso);
  if (Number.isFinite(time) && new Date(time).toISOString().startsWith(iso))
    return time;
}

export function validCatalogDate(value: string): boolean {
  return /^[\d-]{1,10}$/.test(value) && catalogDay(value) !== undefined;
}

export function sortByCatalogDate<T extends Pick<Book, "published">>(
  books: T[],
  order: "newest" | "oldest",
): T[] {
  return books
    .map((book) => ({ book, day: catalogDay(book.published) }))
    .sort((a, b) => {
      if (a.day === undefined) return b.day === undefined ? 0 : 1;
      if (b.day === undefined) return -1;
      return order === "oldest" ? a.day - b.day : b.day - a.day;
    })
    .map(({ book }) => book);
}
