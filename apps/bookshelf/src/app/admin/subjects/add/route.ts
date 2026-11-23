import { readBody } from "@/lib/request-body";
import { isAdmin, requestUser } from "@/services/auth";
import { addSubjectToBooks, catalogEdits } from "@/services/catalog-edits";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";

export async function POST(request: Request) {
  const reply = (status: number) =>
    new Response(null, {
      status,
      headers: { "cache-control": "private, no-store" },
    });
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    !isAdmin(requestUser(request))
  )
    return reply(403);
  const { storage, catalog } = await getServices();
  if (!storage.writeIfMatch) return reply(403);
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    return reply(415);
  const text = await readBody(request, 128 * 1024);
  if (text === null) return reply(413);
  const form = new URLSearchParams(text);
  try {
    const [shelf, snapshot] = await Promise.all([
      catalog.editable(),
      catalogEdits(storage),
    ]);
    const result = await addSubjectToBooks(
      storage,
      shelf,
      snapshot,
      form.get("revision"),
      form.get("subject") ?? "",
      new Set(form.getAll("book")),
    );
    return reply(result === "saved" ? 204 : result === "conflict" ? 409 : 422);
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return reply(503);
  }
}
