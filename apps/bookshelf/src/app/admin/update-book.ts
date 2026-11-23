import { adminHref, catalogView } from "@/app/admin/catalog-link";
import { validCatalogDate } from "@/lib/catalog-date";
import { parseAuthors, parseSubjects } from "@/lib/catalog-names";
import { isbnToAdd } from "@/lib/isbn";
import { readBody, readBodyBytes } from "@/lib/request-body";
import { MAX_COVER_BYTES } from "@/lib/upload-limits";
import { isAdmin, requestUser } from "@/services/auth";
import {
  type BookEdit,
  bookIdentity,
  catalogEdits,
  editedBook,
  saveBookEdit,
} from "@/services/catalog-edits";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import { storeThumbnail, validThumbnail } from "@/services/thumbnails";

export async function updateBook(
  request: Request,
  field:
    | "subjects"
    | "title"
    | "cover"
    | "authors"
    | "details"
    | "date"
    | "isbn",
) {
  const reject = (status: number) =>
    new Response(null, {
      status,
      headers: { "cache-control": "private, no-store" },
    });
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !isAdmin(requestUser(request))
  )
    return reject(403);
  const { storage, catalog } = await getServices();
  if (!storage.writeIfMatch) return reject(403);
  const type = request.headers.get("content-type") ?? "";
  let form: FormData | URLSearchParams;
  if (field === "cover" || field === "details") {
    if (type.split(";")[0] !== "multipart/form-data") return reject(415);
    const bytes = await readBodyBytes(request, MAX_COVER_BYTES + 16 * 1024);
    if (!bytes) return reject(413);
    try {
      form = await new Response(bytes, {
        headers: { "content-type": type },
      }).formData();
    } catch {
      return reject(400);
    }
  } else {
    if (type.split(";")[0] !== "application/x-www-form-urlencoded")
      return reject(415);
    const text = await readBody(request, 24 * 1024);
    if (text === null) return reject(413);
    form = new URLSearchParams(text);
  }
  const id = form.get("id");
  if (typeof id !== "string") return reject(400);
  const back = (result: string) => {
    const view = catalogView(form.get("from"), form.get("date"), form.get("q"));
    return new Response(null, {
      status: 303,
      headers: {
        location: adminHref({ ...view, book: id, result }),
        "cache-control": "private, no-store",
      },
    });
  };
  try {
    const [shelf, snapshot] = await Promise.all([
      catalog.editable(),
      catalogEdits(storage),
    ]);
    const book = shelf.books.find((b) => b.id === id);
    if (!book) return back("missing");
    if (
      bookIdentity(book) !== form.get("identity") ||
      (snapshot.etag ?? "") !== form.get("revision") ||
      (shelf.generatedAt ?? "") !== form.get("generation")
    )
      return back("conflict");
    const change: BookEdit = {};
    const reset = field !== "details" && form.get("intent") === "reset";
    const selected = (name: keyof BookEdit) =>
      field === name || (field === "details" && form.has(name));
    if (field === "date") {
      if ((book.published ?? "") !== form.get("sourceDate"))
        return back("conflict");
      const value = form.get("published");
      const date = typeof value === "string" ? value.trim() : null;
      if (!reset && (date === null || (date !== "" && !validCatalogDate(date))))
        return back("invalidDate");
      change.published = reset ? null : date;
    }
    if (selected("title")) {
      const raw = form.get("title");
      const title = typeof raw === "string" ? raw.trim() : "";
      if (!reset && (!title || title.length > 200)) return back("invalidTitle");
      change.title = reset ? null : title;
    }
    if (selected("authors")) {
      const raw = form.get("authors");
      const authors = typeof raw === "string" ? parseAuthors(raw) : null;
      if (!reset && (!authors || (field === "details" && !authors.length)))
        return back("invalidAuthors");
      change.authors = reset ? null : authors;
    }
    if (field === "subjects") {
      const raw = form.get("subjects");
      const subjects = typeof raw === "string" ? parseSubjects(raw) : null;
      if (!reset && !subjects) return back("invalid");
      change.subjects = reset ? null : subjects;
    }
    if (selected("isbn")) {
      if (editedBook(book, snapshot).isbn) return back("conflict");
      const raw = form.get("isbn");
      const isbn = typeof raw === "string" ? isbnToAdd(raw) : undefined;
      if (!isbn) return back("invalidBookIsbn");
      change.isbn = isbn;
    }
    if (selected("cover")) {
      if (editedBook(book, snapshot).cover) return back("conflict");
      const raw = form.get("cover");
      if (!raw || typeof raw === "string" || raw.size > MAX_COVER_BYTES)
        return back("invalidLocalCover");
      const png = new Uint8Array(await raw.arrayBuffer());
      if (!validThumbnail(png)) return back("invalidLocalCover");
      const file = await storeThumbnail(storage, id, png, "edit");
      if (!file) return back("conflict");
      change.cover = file;
    }
    if (!Object.keys(change).length) return back("selectDetails");
    const saved = await saveBookEdit(storage, snapshot, book, change);
    const notice = {
      isbn: "isbnSaved",
      date: "dateSaved",
      title: "titleSaved",
      authors: "authorsSaved",
      subjects: "saved",
      cover: "coverSaved",
      details: "detailsSaved",
    };
    return back(saved ? notice[field] : "conflict");
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}
