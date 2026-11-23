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
export function bookIdentity(book: Book, title = book.title): string {
  return createHash("sha256")
    .update(
      JSON.stringify([book.id, title, book.authors, book.identifier ?? null]),
    )
    .digest("hex");
}

type SubjectEdit = { identity: string; subjects: string[] };
type Edits = Record<string, SubjectEdit>;

type TitleEdit = { identity: string; title: string };
type Titles = Record<string, TitleEdit>;
export type EditSnapshot = {
  edits: Edits;
  titles: Titles;
  etag: string | null;
};

export async function catalogEdits(
  storage: Storage,
  previous?: EditSnapshot,
): Promise<EditSnapshot> {
  return reading("the catalog edits", async () => {
    const object = await storage.read(
      FILE,
      previous?.etag ? { ifNoneMatch: previous.etag } : undefined,
    );
    if (!object) return { edits: {}, titles: {}, etag: null };
    if (!object.body && previous?.etag === object.object.etag) return previous;
    const data = (await new Response(object.body).json()) as {
      version?: number;
      books?: Edits;
      titles?: Titles;
    } | null;
    if (
      data?.version !== 1 ||
      !data.books ||
      typeof data.books !== "object" ||
      Array.isArray(data.books)
    )
      throw new Error("Unknown catalog edit index");
    for (const entry of Object.values(data.books)) {
      if (
        !entry ||
        typeof entry.identity !== "string" ||
        !Array.isArray(entry.subjects) ||
        !entry.subjects.every((name) => typeof name === "string")
      )
        throw new Error("Invalid subject index");
    }
    const titles = data.titles ?? {};
    if (
      typeof titles !== "object" ||
      Array.isArray(titles) ||
      !Object.values(titles).every(
        (entry) =>
          entry &&
          typeof entry.identity === "string" &&
          typeof entry.title === "string",
      )
    )
      throw new Error("Invalid title index");
    return { edits: data.books, titles, etag: object.object.etag };
  });
}

export function editedBook(book: Book, { edits, titles }: EditSnapshot): Book {
  const subject = Object.hasOwn(edits, book.id) && edits[book.id];
  const title = Object.hasOwn(titles, book.id) && titles[book.id];
  if (!subject && !title) return book;
  const identity = bookIdentity(book);
  const legacy = book.legacyTitle && bookIdentity(book, book.legacyTitle);
  const matches = (saved: string) => saved === identity || saved === legacy;
  return {
    ...book,
    ...(subject && matches(subject.identity) && { subjects: subject.subjects }),
    ...(title && matches(title.identity) && { title: title.title }),
  };
}

export function applyEdits(shelf: Shelf, snapshot: EditSnapshot): Shelf {
  if (!snapshot.etag) return shelf;
  const books = shelf.books.map((book) => editedBook(book, snapshot));
  if (Object.keys(snapshot.titles).length)
    books.sort((a, b) => a.title.localeCompare(b.title));
  return { ...shelf, revision: snapshot.etag, books };
}

export async function saveBookEdit(
  storage: Storage,
  snapshot: EditSnapshot,
  book: Book,
  change: { title: string | null } | { subjects: string[] | null },
) {
  if (!storage.writeIfMatch) return false;
  const edits: Edits = Object.assign(Object.create(null), snapshot.edits);
  const titles: Titles = Object.assign(Object.create(null), snapshot.titles);
  const identity = bookIdentity(book);
  if ("title" in change) {
    if (change.title === null || change.title === book.title)
      delete titles[book.id];
    else titles[book.id] = { identity, title: change.title };
  } else if (change.subjects === null) delete edits[book.id];
  else edits[book.id] = { identity, subjects: change.subjects };
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: 1, books: edits, titles }),
  );
  const write = storage.writeIfMatch.bind(storage);
  return writing("the catalog edits", () =>
    write(FILE, bytes, "application/json", snapshot.etag),
  );
}
