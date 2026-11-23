import { readBodyBytes } from "@/lib/request-body";
import { isAdmin, requestUser } from "@/services/auth";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import { importBook, MAX_UPLOAD_BYTES } from "@/services/uploads";

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
  const bytes = await readBodyBytes(request, MAX_UPLOAD_BYTES + 16 * 1024);
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
  try {
    const outcome = await importBook(storage, file, name.trim(), author.trim());
    return back(
      outcome.result === "conflict" ? "uploadConflict" : outcome.result,
      "id" in outcome ? outcome.id : undefined,
    );
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}
