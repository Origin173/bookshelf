import { parseBookKey } from "@bookshelf/core";

/** Login can resume a reader opened by the shelf. The form carries only its book key. */
export function loginBook(value: unknown): string | undefined {
  return typeof value === "string" && parseBookKey(value) ? value : undefined;
}

export function loginPath(book?: string, error?: string): string {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  if (error) params.set("error", error);
  return params.size ? `/login?${params}` : "/login";
}
