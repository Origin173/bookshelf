import { createHash } from "node:crypto";
import {
  type Book,
  findIsbn,
  isAddedCover,
  STATE_PREFIX,
  type Storage,
} from "@bookshelf/core";
import { parseSubjects, subjectAddition } from "@/lib/catalog-names";
import { bySubject } from "@/lib/opds/browse";
import type { Shelf } from "@/services/catalog";
import { reading, writing } from "@/services/errors";

const FILE = `${STATE_PREFIX}subjects.json`;
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
type Authors = Record<string, { identity: string; authors: string[] }>;
type Covers = Record<string, { identity: string; file: string }>;
type Isbns = Record<string, { identity: string; isbn: string }>;
export type EditSnapshot = {
  isbns: Isbns;
  authors: Authors;
  covers: Covers;
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
    if (!object)
      return {
        edits: {},
        titles: {},
        covers: {},
        authors: {},
        isbns: {},
        etag: null,
      };
    if (!object.body && previous?.etag === object.object.etag) return previous;
    const data = (await new Response(object.body).json()) as {
      version?: number;
      books?: Edits;
      titles?: Titles;
      authors?: Authors;
      isbns?: Isbns;
      covers?: Covers;
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
    const covers = data.covers ?? {};
    if (
      typeof covers !== "object" ||
      Array.isArray(covers) ||
      !Object.values(covers).every(
        (entry) =>
          entry &&
          typeof entry.identity === "string" &&
          typeof entry.file === "string" &&
          isAddedCover(entry.file),
      )
    )
      throw new Error("Invalid cover index");
    const authors = data.authors ?? {};
    if (
      typeof authors !== "object" ||
      Array.isArray(authors) ||
      !Object.values(authors).every(
        (entry) =>
          entry &&
          typeof entry.identity === "string" &&
          Array.isArray(entry.authors) &&
          entry.authors.every((name) => typeof name === "string"),
      )
    )
      throw new Error("Invalid author edits");
    const isbns = data.isbns ?? {};
    if (
      typeof isbns !== "object" ||
      Array.isArray(isbns) ||
      !Object.values(isbns).every(
        (entry) =>
          entry &&
          typeof entry.identity === "string" &&
          typeof entry.isbn === "string" &&
          findIsbn([entry.isbn]) === entry.isbn,
      )
    )
      throw new Error("Invalid ISBN edits");
    return {
      isbns,
      edits: data.books,
      titles,
      covers,
      authors,
      etag: object.object.etag,
    };
  });
}

export function editedBook(
  book: Book,
  { edits, titles, covers, authors, isbns }: EditSnapshot,
): Book {
  const subject = Object.hasOwn(edits, book.id) && edits[book.id];
  const title = Object.hasOwn(titles, book.id) && titles[book.id];
  const cover =
    !book.cover && Object.hasOwn(covers, book.id) && covers[book.id];
  const credit = Object.hasOwn(authors, book.id) && authors[book.id];
  const isbn = !book.isbn && Object.hasOwn(isbns, book.id) && isbns[book.id];
  if (!subject && !title && !cover && !credit && !isbn) return book;
  const identity = bookIdentity(book);
  const legacy = book.legacyTitle && bookIdentity(book, book.legacyTitle);
  const matches = (saved: string) => saved === identity || saved === legacy;
  return {
    ...book,
    ...(isbn && matches(isbn.identity) && { isbn: isbn.isbn }),
    ...(credit && matches(credit.identity) && { authors: credit.authors }),
    ...(cover && matches(cover.identity) && { cover: cover.file }),
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

export type BookEdit = {
  title?: string | null;
  authors?: string[] | null;
  subjects?: string[] | null;
  cover?: string;
  isbn?: string;
};

export async function saveBookEdit(
  storage: Storage,
  snapshot: EditSnapshot,
  book: Book,
  change: BookEdit,
) {
  if (!storage.writeIfMatch) return false;
  const edits: Edits = Object.assign(Object.create(null), snapshot.edits);
  const titles: Titles = Object.assign(Object.create(null), snapshot.titles);
  const authors: Authors = Object.assign(Object.create(null), snapshot.authors);
  const covers: Covers = Object.assign(Object.create(null), snapshot.covers);
  const isbns: Isbns = Object.assign(Object.create(null), snapshot.isbns);
  const identity = bookIdentity(book);
  if (change.isbn) isbns[book.id] = { identity, isbn: change.isbn };
  if (change.cover) covers[book.id] = { identity, file: change.cover };
  if (change.title !== undefined) {
    if (change.title === null || change.title === book.title)
      delete titles[book.id];
    else titles[book.id] = { identity, title: change.title };
  }
  if (change.authors !== undefined) {
    if (change.authors === null) delete authors[book.id];
    else authors[book.id] = { identity, authors: change.authors };
  }
  if (change.subjects === null) delete edits[book.id];
  else if (change.subjects !== undefined)
    edits[book.id] = { identity, subjects: change.subjects };
  return writeEdits(storage, {
    ...snapshot,
    edits,
    titles,
    covers,
    authors,
    isbns,
  });
}

// Older published catalogs may lack a generation timestamp. Include the original
// credits and subjects so a preview cannot be applied to a different edition.
export function subjectRevision(shelf: Shelf, revision: string | null) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        shelf.generatedAt,
        shelf.uploadRevision,
        revision,
        shelf.books.map((b) => [
          b.id,
          b.title,
          b.authors,
          b.identifier,
          b.subjects,
        ]),
      ]),
    )
    .digest("hex");
}

export async function addSubjectToBooks(
  storage: Storage,
  shelf: Shelf,
  snapshot: EditSnapshot,
  revision: string | null,
  subject: string,
  ids: Set<string>,
) {
  if (subjectRevision(shelf, snapshot.etag) !== revision) return "conflict";
  const selected = shelf.books.filter((book) => ids.has(book.id));
  if (
    !selected.length ||
    selected.length !== ids.size ||
    parseSubjects(subject)?.[0] !== subject ||
    !bySubject(applyEdits(shelf, snapshot).books).some(
      (group) => group.name === subject,
    )
  )
    return "invalid";
  const edits: Edits = Object.assign(Object.create(null), snapshot.edits);
  let changed = false;
  for (const book of selected) {
    const subjects = editedBook(book, snapshot).subjects ?? [];
    const addition = subjectAddition(subjects, subject);
    if (addition === "subjectLimit") return "invalid";
    if (addition === "subjectPresent") continue;
    edits[book.id] = {
      identity: bookIdentity(book),
      subjects: [...subjects, subject],
    };
    changed = true;
  }
  if (!changed) return "saved";
  return (await writeEdits(storage, { ...snapshot, edits }))
    ? "saved"
    : "conflict";
}

function writeEdits(storage: Storage, snapshot: EditSnapshot) {
  if (!storage.writeIfMatch) return false;
  const { edits, titles, covers, authors, isbns } = snapshot;
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      books: edits,
      titles,
      covers,
      authors,
      isbns,
    }),
  );
  const write = storage.writeIfMatch.bind(storage);
  return writing("the catalog edits", () =>
    write(FILE, bytes, "application/json", snapshot.etag),
  );
}
