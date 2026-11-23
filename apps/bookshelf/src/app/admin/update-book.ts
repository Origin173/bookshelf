import { readBody, readBodyBytes } from "@/lib/request-body";
import { MAX_COVER_BYTES } from "@/lib/upload-limits";
import { isAdmin, requestUser } from "@/services/auth";
import {
  bookIdentity,
  catalogEdits,
  editedBook,
  parseAuthors,
  parseSubjects,
  saveBookEdit,
} from "@/services/catalog-edits";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import { storeThumbnail, validThumbnail } from "@/services/thumbnails";

export async function updateBook(
  request: Request,
  field: "subjects" | "title" | "cover" | "authors",
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
  if (field === "cover") {
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
    const params = new URLSearchParams({ book: id, result });
    if (form.get("from") === "missing") params.set("cover", "missing");
    return new Response(null, {
      status: 303,
      headers: {
        location: `/admin?${params}`,
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
    const raw = form.get(field);
    const reset = form.get("intent") === "reset";
    if (field === "cover") {
      if (editedBook(book, snapshot).cover) return back("conflict");
      if (!raw || typeof raw === "string" || raw.size > MAX_COVER_BYTES)
        return back("invalidLocalCover");
      const png = new Uint8Array(await raw.arrayBuffer());
      if (!validThumbnail(png)) return back("invalidLocalCover");
      const file = await storeThumbnail(storage, id, png, "edit");
      if (!file) return back("conflict");
      return back(
        (await saveBookEdit(storage, snapshot, book, { cover: file }))
          ? "coverSaved"
          : "conflict",
      );
    }
    const value = typeof raw === "string" ? raw : "";
    if (field === "title") {
      const title = value.trim();
      if (!reset && (!title || title.length > 200)) return back("invalidTitle");
      return back(
        (await saveBookEdit(storage, snapshot, book, {
          title: reset ? null : title,
        }))
          ? "titleSaved"
          : "conflict",
      );
    }
    if (field === "authors") {
      const authors = typeof raw === "string" ? parseAuthors(value) : null;
      if (!reset && !authors) return back("invalidAuthors");
      return back(
        (await saveBookEdit(storage, snapshot, book, {
          authors: reset ? null : authors,
        }))
          ? "authorsSaved"
          : "conflict",
      );
    }
    const subjects = typeof raw === "string" ? parseSubjects(value) : null;
    if (!reset && !subjects) return back("invalid");
    return back(
      (await saveBookEdit(storage, snapshot, book, {
        subjects: reset ? null : subjects,
      }))
        ? "saved"
        : "conflict",
    );
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}
