export type CatalogView = {
  missing?: "cover" | "date" | "isbn" | "subject";
  q?: string;
};

export function catalogView(params: {
  cover?: unknown;
  date?: unknown;
  isbn?: unknown;
  subject?: unknown;
  q?: unknown;
}): CatalogView {
  return {
    missing: (["date", "cover", "isbn", "subject"] as const).find(
      (field) => params[field] === "missing",
    ),
    q: typeof params.q === "string" ? params.q : undefined,
  };
}

export function adminHref(
  {
    missing,
    q,
    book,
    result,
    bulk,
  }: CatalogView & { book?: string; result?: string; bulk?: "subjects" },
  path: "/admin" | "/admin/upload" = "/admin",
) {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  if (bulk) params.set("bulk", bulk);
  if (result) params.set("result", result);
  if (missing) params.set(missing, "missing");
  if (q) params.set("q", q);
  return params.size ? `${path}?${params}` : path;
}
