import { findIsbn } from "@bookshelf/core";

/** Only a whole, checksummed ISBN switches the shelf to identifier search. */
export function isbnQuery(query: string): string | undefined {
  const normalized = query
    .replace(/[\s\u2010-\u2013\uFF0D-]/g, "")
    .toUpperCase();
  return findIsbn([normalized]) === normalized ? normalized : undefined;
}

/** Older catalogs may contain other checksummed EANs. Only assign book numbers. */
export function isbnToAdd(value: string): string | undefined {
  const isbn = isbnQuery(value);
  return isbn?.length === 13 && !/^97[89]/.test(isbn) ? undefined : isbn;
}

/** A 978 ISBN-13 and its ISBN-10 share the same nine edition digits. */
export function editionKey(value: string): string | undefined {
  const isbn = isbnToAdd(value);
  if (!isbn) return;
  return isbn.length === 10 ? `978${isbn.slice(0, 9)}` : isbn.slice(0, 12);
}
