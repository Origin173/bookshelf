export const BOOKMARK_NAME_LIMIT = 80;

export const BOOKMARK_NOTE_LIMIT = 2000;

export type Bookmark = {
  note?: string;
  name?: string;
  position: number | string;
  chapter?: string;
  chapterPage?: number;
};
export type BookmarkChange =
  | { intent: "add" | "remove"; mark: Bookmark }
  | { intent: "rename"; mark: Bookmark; name: string }
  | { intent: "note"; mark: Bookmark; note: string };
export type BookmarkResult =
  | { items: Bookmark[]; writable: boolean }
  | { error: "unavailable" | "accountChanged" | "bookmarkConflict" };
export type BookmarkAction = (
  change?: BookmarkChange,
) => Promise<BookmarkResult>;
