import { findIsbn } from "@bookshelf/core";
import { readBodyBytes } from "@/lib/request-body";
import { MAX_COVER_BYTES, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { isAdmin, requestUser } from "@/services/auth";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import { importBook } from "@/services/uploads";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !isAdmin(requestUser(request))
  )
    return new Response(null, { status: 403, headers });
  const { storage } = await getServices();
  if (!storage.writeIfMatch)
    return new Response(null, { status: 403, headers });
  const type = request.headers.get("content-type") ?? "";
  if (type.split(";")[0] !== "multipart/form-data")
    return new Response(null, { status: 415, headers });
  const back = (result: string, id?: string) => {
    const query = new URLSearchParams({ result });
    if (id) query.set("book", id);
    return new Response(null, {
      status: 303,
      headers: { ...headers, location: `/admin?${query}` },
    });
  };
  const bytes = await readBodyBytes(
    request,
    MAX_UPLOAD_BYTES + MAX_COVER_BYTES + 16 * 1024,
  );
  if (bytes === null) return back("tooLarge");
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { "content-type": type },
    }).formData();
  } catch {
    return back("invalidFile");
  }
  const file = form.get("file"),
    name = form.get("title"),
    author = form.get("author");
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200 ||
    typeof author !== "string" ||
    author.length > 200
  )
    return back("invalidDetails");
  if (!file || typeof file === "string" || !file.size)
    return back("invalidFile");
  const rawIsbn = form.get("isbn") ?? "";
  if (typeof rawIsbn !== "string" || rawIsbn.length > 24)
    return back("invalidIsbn");
  const candidate = rawIsbn.trim().replace(/[ -]/g, "").toUpperCase();
  const isbn = candidate ? findIsbn([candidate]) : undefined;
  if (candidate && candidate !== isbn) return back("invalidIsbn");
  const image = form.get("cover");
  if (image && (typeof image === "string" || image.size > MAX_COVER_BYTES))
    return back("invalidCover");
  const cover =
    image && typeof image !== "string" && image.size
      ? new Uint8Array(await image.arrayBuffer())
      : undefined;
  try {
    const outcome = await importBook(
      storage,
      file,
      name.trim(),
      author.trim(),
      { isbn, cover },
    );
    return back(
      outcome.result === "conflict" ? "uploadConflict" : outcome.result,
      "id" in outcome ? outcome.id : undefined,
    );
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}
