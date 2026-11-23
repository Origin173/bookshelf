import { STATE_PREFIX, type Storage } from "@bookshelf/core";
import {
  BOOKMARK_NAME_LIMIT,
  BOOKMARK_NOTE_LIMIT,
  type Bookmark,
  type BookmarkChange,
  type BookmarkResult,
} from "@/lib/bookmarks";
import { reading, writing } from "@/services/errors";

function valid(mark: Bookmark, format: string): boolean {
  if (!mark || typeof mark !== "object") return false;
  if (
    mark.name !== undefined &&
    (typeof mark.name !== "string" || mark.name.length > BOOKMARK_NAME_LIMIT)
  )
    return false;
  if (
    mark.note !== undefined &&
    (typeof mark.note !== "string" || mark.note.length > BOOKMARK_NOTE_LIMIT)
  )
    return false;
  if (format === "pdf")
    return (
      typeof mark.position === "number" &&
      Number.isSafeInteger(mark.position) &&
      mark.position >= 1 &&
      mark.position <= 1_000_000
    );
  return (
    format === "epub" &&
    typeof mark.position === "string" &&
    mark.position.length <= 2048 &&
    mark.position.startsWith("epubcfi(/") &&
    mark.position.endsWith(")") &&
    typeof mark.chapter === "string" &&
    mark.chapter.length <= 240 &&
    (mark.chapterPage === undefined ||
      (Number.isSafeInteger(mark.chapterPage) && mark.chapterPage > 0))
  );
}

export async function bookBookmarks(
  storage: Storage,
  profileId: string,
  bookKey: string,
  format: string,
  change?: BookmarkChange,
): Promise<BookmarkResult> {
  const key = `${STATE_PREFIX}bookmarks/${profileId}/${bookKey}.json`;
  const write = storage.writeIfMatch?.bind(storage);
  if (
    change !== undefined &&
    (!write ||
      !change ||
      !["add", "remove", "rename", "note"].includes(change.intent) ||
      (change.intent === "rename" &&
        (typeof change.name !== "string" ||
          change.name.length > BOOKMARK_NAME_LIMIT)) ||
      (change.intent === "note" &&
        (typeof change.note !== "string" ||
          change.note.length > BOOKMARK_NOTE_LIMIT)) ||
      !valid(change.mark, format))
  )
    return { error: "unavailable" };

  // Each operation touches one location. Reapply it if another tab saved a
  // different bookmark between our read and the conditional write.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { items, etag } = await reading("the bookmarks", async () => {
      const object = await storage.read(key);
      if (!object) return { items: [] as Bookmark[], etag: null };
      const data = (await new Response(object.body).json()) as {
        version?: number;
        items?: Bookmark[];
      } | null;
      if (
        data?.version !== 1 ||
        !Array.isArray(data.items) ||
        !data.items.every((item) => valid(item, format))
      )
        throw new Error("Invalid bookmarks");
      return { items: data.items, etag: object.object.etag };
    });
    if (!change || !write) return { items, writable: !!write };
    const index = items.findIndex(
      (item) => item.position === change.mark.position,
    );
    if (change.intent === "add") {
      if (index !== -1) return { items, writable: true };
      const { position, chapter, chapterPage } = change.mark;
      items.push(
        typeof position === "number"
          ? { position }
          : { position, chapter, chapterPage },
      );
      if (format === "pdf")
        items.sort((a, b) => Number(a.position) - Number(b.position));
    } else if (change.intent === "rename" || change.intent === "note") {
      const stored = items[index];
      if (!stored) return { error: "bookmarkConflict" };
      const field = change.intent === "rename" ? "name" : "note";
      const value =
        (change.intent === "rename" ? change.name : change.note).trim() ||
        undefined;
      if (stored[field] === value) return { items, writable: true };
      if (stored[field] !== change.mark[field])
        return { error: "bookmarkConflict" };
      if (value) stored[field] = value;
      else delete stored[field];
    } else {
      if (index === -1) return { items, writable: true };
      items.splice(index, 1);
    }
    const bytes = new TextEncoder().encode(
      JSON.stringify({ version: 1, items }),
    );
    if (
      await writing("the bookmarks", () =>
        write(key, bytes, "application/json", etag),
      )
    )
      return { items, writable: true };
    // The filesystem writer holds its lock until the atomic rename completes.
    // Give it time to finish before reading the new revision.
    if (attempt < 2)
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
  }
  return { error: "bookmarkConflict" };
}
