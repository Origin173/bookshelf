import Link from "next/link";
import { BUTTON, BUTTON_PRIMARY } from "@/app/ui";
import { encodeKey } from "@/lib/http";
import { type Book, type BookFormat, bookKey } from "@/services/catalog";

export function ReadingFormats({
  book,
  current,
  action,
  read,
}: {
  book: Book;
  current: BookFormat;
  action?: string;
  read: string;
}) {
  const alternate =
    current.format === "pdf"
      ? "epub"
      : current.format === "epub"
        ? "pdf"
        : undefined;
  const other = alternate && book.formats.find((f) => f.format === alternate);
  return (
    <>
      {action && (
        <Link
          href={`/read/${encodeKey(bookKey(book.id, current.file))}`}
          prefetch={false}
          className={BUTTON_PRIMARY}
        >
          {action}
          {other && ` ${current.format.toUpperCase()}`}
        </Link>
      )}
      {other && (
        <Link
          href={`/read/${encodeKey(bookKey(book.id, other.file))}`}
          prefetch={false}
          className={`${BUTTON} shrink-0 whitespace-nowrap`}
        >
          {read} {other.format.toUpperCase()}
        </Link>
      )}
    </>
  );
}
