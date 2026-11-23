"use client";

import Link from "next/link";
import { useState } from "react";
import { BookSearchInput } from "@/app/admin/book-search-input";
import { BUTTON } from "@/app/ui";
import { searchBooks } from "@/lib/book-search";

export function AdminBookList({
  books,
  t,
}: {
  books: { id: string; title: string; authors: string[]; href: string }[];
  t: {
    searchCatalog: string;
    clearSearch: string;
    noMatches: string;
    editBook: string;
  };
}) {
  const [query, setQuery] = useState("");
  const rows = searchBooks(books, query);
  return (
    <>
      <BookSearchInput
        value={query}
        onChange={setQuery}
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
                href={book.href}
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
        <p className="mt-8 text-secondary">{t.noMatches}</p>
      )}
    </>
  );
}
