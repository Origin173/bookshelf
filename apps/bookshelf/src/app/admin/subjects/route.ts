import { readBody } from "@/lib/request-body";
import { isAdmin, requestUser } from "@/services/auth";
import { getServices } from "@/services/container";
import { isUnavailable } from "@/services/errors";
import {
  bookIdentity,
  parseSubjects,
  saveSubjects,
  subjectEdits,
} from "@/services/subjects";

export async function POST(request: Request) {
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
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    return reject(415);
  const text = await readBody(request, 24 * 1024);
  if (text === null) return reject(413);
  const form = new URLSearchParams(text);
  const id = form.get("id") ?? "";
  const back = (result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        location: `/admin?${new URLSearchParams({ book: id, result })}`,
        "cache-control": "private, no-store",
      },
    });
  const reset = form.get("intent") === "reset";
  const raw = form.get("subjects");
  const subjects = raw === null ? null : parseSubjects(raw);
  if (!reset && !subjects) return back("invalid");
  try {
    const [shelf, snapshot] = await Promise.all([
      catalog.editable(),
      subjectEdits(storage),
    ]);
    const book = shelf.books.find((b) => b.id === id);
    if (!book) return back("missing");
    if (
      bookIdentity(book) !== form.get("identity") ||
      (snapshot.etag ?? "") !== form.get("revision") ||
      (shelf.generatedAt ?? "") !== form.get("generation")
    )
      return back("conflict");
    const saved = await saveSubjects(
      storage,
      snapshot,
      book,
      reset ? null : subjects,
    );
    if (!saved) return back("conflict");
    return back("saved");
  } catch (error) {
    if (!isUnavailable(error)) throw error;
    return back("unavailable");
  }
}
