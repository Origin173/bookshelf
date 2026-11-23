export type CatalogView = {
  missing?: "cover" | "date";
  q?: string;
};

export function catalogView(
  cover: unknown,
  date: unknown,
  q: unknown,
): CatalogView {
  return {
    missing:
      date === "missing" ? "date" : cover === "missing" ? "cover" : undefined,
    q: typeof q === "string" ? q : undefined,
  };
}

export function adminHref(
  {
    missing,
    q,
    book,
    result,
  }: CatalogView & { book?: string; result?: string },
  path: "/admin" | "/admin/upload" = "/admin",
) {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  if (result) params.set("result", result);
  if (missing) params.set(missing, "missing");
  if (q) params.set("q", q);
  return params.size ? `${path}?${params}` : path;
}
