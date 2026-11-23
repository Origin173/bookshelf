"use client";

import Link from "next/link";
import { useState } from "react";
import { BookSearchInput } from "@/app/admin/book-search-input";
import { adminHref, type CatalogView } from "@/app/admin/catalog-link";
import { BUTTON, BUTTON_PRIMARY } from "@/app/ui";
import { searchBooks } from "@/lib/book-search";

export function AdminBookList({
  books,
  view,
  t,
}: {
  books: { id: string; title: string; authors: string[] }[];
  view: CatalogView;
  t: {
    manage: string;
    allBooks: string;
    missingCovers: string;
    noMissingCovers: string;
    missingDates: string;
    noMissingDates: string;
    bulkSubject: string;
    searchCatalog: string;
    clearSearch: string;
    noMatches: string;
    editBook: string;
  };
}) {
  const [query, setQuery] = useState(view.q ?? "");
  function search(q: string) {
    setQuery(q);
    window.history.replaceState(
      null,
      "",
      adminHref({ missing: view.missing, q }),
    );
  }
  const rows = searchBooks(books, query);
  return (
    <>
      <nav aria-label={t.manage} className="mt-6 flex flex-wrap gap-2">
        {([undefined, "cover", "date"] as const).map((missing) => (
          <Link
            key={missing ?? "all"}
            href={adminHref({ missing, q: query })}
            prefetch={false}
            aria-current={missing === view.missing ? "page" : undefined}
            className={missing === view.missing ? BUTTON_PRIMARY : BUTTON}
          >
            {missing === "date"
              ? t.missingDates
              : missing === "cover"
                ? t.missingCovers
                : t.allBooks}
          </Link>
        ))}
        <Link href="/admin?bulk=subjects" prefetch={false} className={BUTTON}>
          {t.bulkSubject}
        </Link>
      </nav>
      <BookSearchInput
        value={query}
        onChange={search}
        label={t.searchCatalog}
        clear={t.clearSearch}
      />
      {rows.length ? (
        <ul className="mt-8 divide-y divide-separator">
          {rows.map((book) => (
            <li
              key={book.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{book.title}</p>
                <p className="text-sm text-secondary">
                  {book.authors.join(", ")}
                </p>
              </div>
              <Link
                href={adminHref({
                  missing: view.missing,
                  q: query,
                  book: book.id,
                })}
                prefetch={false}
                className={`${BUTTON} shrink-0`}
              >
                {t.editBook}
                <span className="sr-only"> · {book.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-secondary">
          {books.length
            ? t.noMatches
            : view.missing === "date"
              ? t.noMissingDates
              : t.noMissingCovers}
        </p>
      )}
    </>
  );
}
