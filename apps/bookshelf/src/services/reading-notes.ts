import { createHash } from "node:crypto";
import { type Book, parseBookKey, type Storage } from "@bookshelf/core";
import { bookBookmarks } from "@/services/bookmarks";
import { reading } from "@/services/errors";

/** A bookmark link remains stable when its name or text changes. */
export function noteId(
  profileId: string,
  fileKey: string,
  position: string | number,
) {
  return createHash("sha256")
    .update(JSON.stringify([profileId, fileKey, position]))
    .digest("hex")
    .slice(0, 32);
}

export async function readingNotes(
  storage: Storage,
  profileId: string,
  books: Book[],
  cursor?: string,
) {
  const page = await reading("your bookmark files", () => {
    if (!storage.listBookmarkFiles)
      throw new Error("Bookmark listing unavailable");
    return storage.listBookmarkFiles(profileId, 16, cursor);
  });
  const catalog = new Map(books.map((book) => [book.id, book]));
  const files = await Promise.all(
    page.files.map(async (name) => {
      if (!name.endsWith(".json")) return;
      const fileKey = name.slice(0, -5);
      const target = parseBookKey(fileKey);
      if (!target) return;
      const book = catalog.get(target.id);
      const format = book?.formats.find((f) => f.file === target.file)?.format;
      if (!book || (format !== "pdf" && format !== "epub")) return;
      const result = await bookBookmarks(storage, profileId, fileKey, format);
      if (!("items" in result)) return;
      const notes = result.items
        .filter((mark) => mark.note)
        .map((mark) => ({
          mark,
          format,
          fileKey,
          id: noteId(profileId, fileKey, mark.position),
        }));
      if (notes.length) return { book, notes };
    }),
  );
  const groups = new Map<string, NonNullable<(typeof files)[number]>>();
  for (const file of files) {
    if (!file) continue;
    const group = groups.get(file.book.id);
    if (group) group.notes.push(...file.notes);
    else groups.set(file.book.id, file);
  }
  return { groups: [...groups.values()], cursor: page.cursor };
}
