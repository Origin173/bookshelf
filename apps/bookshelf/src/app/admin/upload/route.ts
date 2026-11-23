import { findIsbn, isUploadId, type Storage } from "@bookshelf/core";
import { parseSubjects } from "@/lib/catalog-names";
import { readBodyBytes } from "@/lib/request-body";
import { MAX_COVER_BYTES, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { isAdmin, requestUser } from "@/services/auth";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import { appendFormat, importBook } from "@/services/uploads";

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
  const target = new URL(request.url).searchParams.get("book");
  const back = (result: string, id = target ?? undefined) => {
    if (request.headers.get("accept") === "application/json")
      return Response.json({ result, book: id }, { headers });
    const query = new URLSearchParams({ result });
    if (id) query.set("book", id);
    return new Response(null, {
      status: 303,
      headers: { ...headers, location: `/admin?${query}` },
    });
  };
  if (target !== null && !isUploadId(target)) return back("missing");
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
  try {
    const outcome = await saveForm(storage, form, target);
    return back(
      outcome.result === "conflict" ? "uploadConflict" : outcome.result,
      "id" in outcome ? outcome.id : undefined,
    );
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}

async function saveForm(
  storage: Storage,
  form: FormData,
  target: string | null,
) {
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size)
    return { result: "invalidFile" } as const;
  if (target !== null) return appendFormat(storage, file, target);
  const name = form.get("title"),
    author = form.get("author");
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200 ||
    typeof author !== "string" ||
    author.length > 200
  )
    return { result: "invalidDetails" } as const;
  const rawIsbn = form.get("isbn") ?? "";
  if (typeof rawIsbn !== "string" || rawIsbn.length > 24)
    return { result: "invalidIsbn" } as const;
  const candidate = rawIsbn.trim().replace(/[ -]/g, "").toUpperCase();
  const isbn = candidate ? findIsbn([candidate]) : undefined;
  if (candidate && candidate !== isbn)
    return { result: "invalidIsbn" } as const;
  const rawSubjects = form.get("subjects") ?? "";
  const subjects =
    typeof rawSubjects === "string" ? parseSubjects(rawSubjects) : null;
  if (!subjects) return { result: "invalid" } as const;
  const image = form.get("cover");
  if (image && (typeof image === "string" || image.size > MAX_COVER_BYTES))
    return { result: "invalidCover" } as const;
  const cover =
    image && typeof image !== "string" && image.size
      ? new Uint8Array(await image.arrayBuffer())
      : undefined;
  return importBook(storage, file, name.trim(), author.trim(), {
    isbn,
    cover,
    subjects,
  });
}
