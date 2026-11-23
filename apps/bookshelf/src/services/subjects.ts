import { createHash } from "node:crypto";
import { type Book, STATE_PREFIX, type Storage } from "@bookshelf/core";
import type { Shelf } from "@/services/catalog";
import { reading, writing } from "@/services/errors";

const FILE = `${STATE_PREFIX}subjects.json`;
const MAX_SUBJECTS = 20;
const MAX_LENGTH = 80;

export function parseSubjects(text: string): string[] | null {
  const subjects = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  return subjects.length <= MAX_SUBJECTS &&
    subjects.every((s) => s.length <= MAX_LENGTH)
    ? subjects
    : null;
}

// A later publish can reuse a title slug. Apply an edit only to the book it was made for.
export function bookIdentity(book: Book): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        book.id,
        book.title,
        book.authors,
        book.identifier ?? null,
      ]),
    )
    .digest("hex");
}

type SubjectEdit = { identity: string; subjects: string[] };
type Edits = Record<string, SubjectEdit>;

export type SubjectSnapshot = { edits: Edits; etag: string | null };

export async function subjectEdits(
  storage: Storage,
  previous?: SubjectSnapshot,
): Promise<SubjectSnapshot> {
  return reading("the subject edits", async () => {
    const object = await storage.read(
      FILE,
      previous?.etag ? { ifNoneMatch: previous.etag } : undefined,
    );
    if (!object) return { edits: {} as Edits, etag: null };
    if (!object.body && previous?.etag === object.object.etag) return previous;
    const data = (await new Response(object.body).json()) as {
      version?: number;
      books?: Edits;
    } | null;
    if (
      data?.version !== 1 ||
      !data.books ||
      typeof data.books !== "object" ||
      Array.isArray(data.books)
    )
      throw new Error("Unknown subject index");
    for (const entry of Object.values(data.books)) {
      if (
        !entry ||
        typeof entry.identity !== "string" ||
        !Array.isArray(entry.subjects) ||
        !entry.subjects.every((name) => typeof name === "string")
      )
        throw new Error("Invalid subject index");
    }
    return { edits: data.books, etag: object.object.etag };
  });
}

export function applySubjects(
  shelf: Shelf,
  { edits, etag }: SubjectSnapshot,
): Shelf {
  if (!etag) return shelf;
  return {
    ...shelf,
    revision: etag,
    books: shelf.books.map((book) => {
      const edit = Object.hasOwn(edits, book.id) && edits[book.id];
      return edit && edit.identity === bookIdentity(book)
        ? { ...book, subjects: edit.subjects }
        : book;
    }),
  };
}

export async function saveSubjects(
  storage: Storage,
  snapshot: SubjectSnapshot,
  book: Book,
  subjects: string[] | null,
) {
  if (!storage.writeIfMatch) return false;
  const edits: Edits = Object.assign(Object.create(null), snapshot.edits);
  if (subjects === null) delete edits[book.id];
  else edits[book.id] = { identity: bookIdentity(book), subjects };
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: 1, books: edits }),
  );
  const write = storage.writeIfMatch.bind(storage);
  return writing("the subject edits", () =>
    write(FILE, bytes, "application/json", snapshot.etag),
  );
}
