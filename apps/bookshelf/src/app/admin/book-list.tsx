"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { adminHref, type CatalogView } from "@/app/admin/catalog-link";
import { FilterInput } from "@/app/filter-input";
import { BUTTON, BUTTON_PRIMARY } from "@/app/ui";
import { searchBookText } from "@/lib/book-search";
import { type CatalogCsvBook, catalogCsv } from "@/lib/catalog-csv";
import { downloadBlob } from "@/lib/download";

export function AdminBookList({
  books,
  view,
  emptyMessage,
  t,
}: {
  books: (CatalogCsvBook & { id: string })[];
  view: CatalogView;
  emptyMessage?: string;
  t: {
    manage: string;
    allBooks: string;
    missingCovers: string;
    noMissingCovers: string;
    missingDates: string;
    noMissingDates: string;
    missingIsbns: string;
    noMissingIsbns: string;
    bulkSubject: string;
    searchCatalog: string;
    clearSearch: string;
    exportCatalogCsv: string;
    noMatches: string;
    editBook: string;
  };
}) {
  const savedQuery = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(savedQuery);
  function rememberSearch() {
    if (query !== savedQuery)
      window.history.replaceState(
        null,
        "",
        adminHref({ missing: view.missing, q: query }),
      );
  }
  const rows = searchBookText(books, query);
  function exportCsv() {
    downloadBlob(
      new Blob([catalogCsv(rows)], { type: "text/csv;charset=utf-8" }),
      "bookshelf-catalog.csv",
    );
  }
  const filters = [
    [undefined, t.allBooks],
    ["cover", t.missingCovers],
    ["date", t.missingDates],
    ["isbn", t.missingIsbns],
  ] as const;
  const empty = {
    cover: t.noMissingCovers,
    date: t.noMissingDates,
    isbn: t.noMissingIsbns,
  };
  return (
    <>
      <nav aria-label={t.manage} className="mt-6 flex flex-wrap gap-2">
        {filters.map(([missing, label]) => (
          <Link
            key={missing ?? "all"}
            href={adminHref({ missing, q: query })}
            onNavigate={rememberSearch}
            prefetch={false}
            aria-current={missing === view.missing ? "page" : undefined}
            className={missing === view.missing ? BUTTON_PRIMARY : BUTTON}
          >
            {label}
          </Link>
        ))}
        <Link href="/admin?bulk=subjects" prefetch={false} className={BUTTON}>
          {t.bulkSubject}
        </Link>
      </nav>
      <FilterInput
        value={query}
        onChange={setQuery}
        label={t.searchCatalog}
        clear={t.clearSearch}
      />
      <button type="button" className={`${BUTTON} mt-3`} onClick={exportCsv}>
        {t.exportCatalogCsv}
      </button>
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
                onNavigate={rememberSearch}
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
          {emptyMessage ??
            (!books.length && view.missing ? empty[view.missing] : t.noMatches)}
        </p>
      )}
    </>
  );
}
