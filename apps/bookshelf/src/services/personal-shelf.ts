import { STATE_PREFIX, type Storage } from "@bookshelf/core";
import { reading, writing } from "@/services/errors";

export const readingStatuses = ["wantToRead", "reading", "finished"] as const;
export type ReadingStatus = (typeof readingStatuses)[number];
export type ShelfEntry = { status: ReadingStatus | ""; favorite: boolean };

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return readingStatuses.some((status) => status === value);
}

type PersonalShelf = { books: Map<string, ShelfEntry>; etag: string | null };

function shelfFile(profileId: string) {
  return `${STATE_PREFIX}shelves/${profileId}.json`;
}

export async function personalShelf(
  storage: Storage,
  profileId: string,
): Promise<PersonalShelf> {
  return reading("the personal shelf", async () => {
    const object = await storage.read(shelfFile(profileId));
    if (!object) return { books: new Map(), etag: null };
    const data = (await new Response(object.body).json()) as {
      version?: number;
      books?: Record<string, ShelfEntry>;
    } | null;
    if (
      data?.version !== 1 ||
      !data.books ||
      typeof data.books !== "object" ||
      Array.isArray(data.books)
    )
      throw new Error("Unknown personal shelf");
    const books = new Map<string, ShelfEntry>();
    for (const [id, entry] of Object.entries(data.books)) {
      if (
        !entry ||
        (entry.status !== "" && !isReadingStatus(entry.status)) ||
        typeof entry.favorite !== "boolean"
      )
        throw new Error("Invalid personal shelf entry");
      books.set(id, entry);
    }
    return { books, etag: object.object.etag };
  });
}

export async function saveShelfEntry(
  storage: Storage,
  profileId: string,
  bookId: string,
  entry: ShelfEntry,
  revision: string | null,
) {
  if (!storage.writeIfMatch) return false;
  const { books, etag } = await personalShelf(storage, profileId);
  const current = books.get(bookId);
  if (
    (current?.status ?? "") === entry.status &&
    (current?.favorite ?? false) === entry.favorite
  )
    return true;
  if (revision !== etag) return false;
  if (entry.status || entry.favorite) books.set(bookId, entry);
  else books.delete(bookId);
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: 1, books: Object.fromEntries(books) }),
  );
  const write = storage.writeIfMatch.bind(storage);
  return writing("the personal shelf", () =>
    write(shelfFile(profileId), bytes, "application/json", etag),
  );
}
