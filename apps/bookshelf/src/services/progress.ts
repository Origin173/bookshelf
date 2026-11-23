import {
  type BookProgress,
  type Progress,
  progressFile,
  STATE_VERSION,
  type Storage,
  type WritableStorage,
  writableStorage,
} from "@bookshelf/core";
import { reading } from "@/services/errors";

export type { BookProgress } from "@bookshelf/core";

/**
 * A position as a reader reports it: everything {@link BookProgress} holds
 * except the timestamp, which is the library's to set. Derived rather than
 * restated so that a new kind of position reaches this service by adding one
 * field to one type.
 */
export type ReadingPosition = Omit<BookProgress, "updatedAt">;

export type SaveResult =
  | { saved: true; current: BookProgress }
  | { saved: false; current: BookProgress | null }
  | { saved: false };

function entry(
  position: ReadingPosition,
  previous?: BookProgress,
): BookProgress {
  // Even two turns in a millisecond need distinct revisions.
  const time = Math.max(
    Date.now(),
    (Date.parse(previous?.updatedAt ?? "") || 0) + 1,
  );
  return {
    ...(position.cfi && { cfi: position.cfi }),
    ...(position.href && { href: position.href }),
    ...(position.page && { page: position.page }),
    updatedAt: new Date(time).toISOString(),
  };
}

/**
 * How far each profile got in each book.
 *
 * One object per profile rather than one per book: a page turn costs a read
 * and a write either way, and this way the shelf can show every position it
 * knows about in a single request.
 *
 * The reader sends the last server revision it saw. Both supported storage
 * providers condition the replacement on the whole profile file's ETag.
 */
export class ProgressService {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  get writable(): boolean {
    return writableStorage(this.storage) !== null;
  }

  /** The file as it stands, which a caller about to rewrite it must have. */
  private async stored(
    profileId: string,
  ): Promise<Record<string, BookProgress>> {
    const bytes = await reading("a reading position", () =>
      this.storage.readBytes(progressFile(profileId)),
    );
    if (!bytes) return {};

    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Progress;
      return parsed.books ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Every position this profile has, keyed by book id.
   *
   * Positions that cannot be read come back as none, because that costs
   * nothing: the shelf shows "Read" instead of "Continue", and the reader
   * reconciles whatever it is given against the copy the browser kept — newest
   * wins — so a position missing from this answer is not a position lost.
   */
  async all(profileId: string): Promise<Record<string, BookProgress>> {
    try {
      return await this.stored(profileId);
    } catch {
      return {};
    }
  }

  async get(profileId: string, bookId: string): Promise<BookProgress | null> {
    return (await this.all(profileId))[bookId] ?? null;
  }

  /**
   * Records a position. False where the library cannot be written to, and false
   * where it could not be read either — which is not the same thing as
   * {@link all} answering with none.
   *
   * The file holds every book this profile has open and is rewritten whole, so
   * writing it after a failed read would replace all of those positions with
   * this one. A reader told `false` keeps its place in the browser and tries
   * again later, which is exactly the right outcome; a reader told `true` over a
   * file that lost nine books is not.
   */
  async save(
    profileId: string,
    bookId: string,
    position: ReadingPosition,
  ): Promise<boolean> {
    if (this.storage.writeIfMatch)
      return (await this.saveIfCurrent(profileId, bookId, position)).saved;
    const target = writableStorage(this.storage);
    if (!target) return false;

    let books: Record<string, BookProgress>;
    try {
      books = await this.stored(profileId);
    } catch {
      return false;
    }

    books[bookId] = entry(position, books[bookId]);
    return this.write(target, profileId, books);
  }

  async saveIfCurrent(
    profileId: string,
    bookId: string,
    position: ReadingPosition,
    basedOn?: string | null,
  ): Promise<SaveResult> {
    const key = progressFile(profileId);
    if (!this.storage.writeIfMatch) return { saved: false };
    try {
      // A different book may have changed the same profile file. Read its new
      // version and check this book again before retrying the conditional put.
      for (let attempt = 0; attempt < 3; attempt++) {
        const found = await this.storage.read(key);
        const books: Record<string, BookProgress> = found
          ? ((await new Response(found.body).json()) as Progress).books
          : {};
        const current = books[bookId] ?? null;
        if (
          current &&
          current.page === position.page &&
          current.cfi === position.cfi &&
          current.href === position.href
        )
          return { saved: true, current };
        if (basedOn !== undefined && basedOn !== (current?.updatedAt ?? null))
          return { saved: false, current };
        const next = entry(position, current ?? undefined);
        books[bookId] = next;
        const bytes = new TextEncoder().encode(
          JSON.stringify({ version: STATE_VERSION, books } satisfies Progress),
        );
        if (
          await this.storage.writeIfMatch(
            key,
            bytes,
            "application/json",
            found?.object.etag ?? null,
          )
        )
          return { saved: true, current: next };
      }
    } catch {
      // Leave the browser's pending position available for another attempt.
    }
    return { saved: false };
  }

  /** Forgets one book, or every book when no id is given. */
  async clear(profileId: string, bookId?: string): Promise<boolean> {
    const target = writableStorage(this.storage);
    if (!target) return false;

    if (!bookId) {
      // Nothing is read first, so there is nothing a failed read could lose.
      try {
        await target.remove(progressFile(profileId));
        return true;
      } catch {
        return false;
      }
    }

    let books: Record<string, BookProgress>;
    try {
      books = await this.stored(profileId);
    } catch {
      // Same hazard as saving: rewriting what was not read would drop the rest.
      return false;
    }
    if (!(bookId in books)) return true;

    delete books[bookId];
    return this.write(target, profileId, books);
  }

  /** Rewrites the file. False where the write did not land. */
  private async write(
    target: WritableStorage,
    profileId: string,
    books: Record<string, BookProgress>,
  ): Promise<boolean> {
    try {
      await target.write(
        progressFile(profileId),
        new TextEncoder().encode(
          JSON.stringify({ version: STATE_VERSION, books } satisfies Progress),
        ),
        "application/json",
      );
      return true;
    } catch {
      return false;
    }
  }
}
