export const BOOKMARK_NAME_LIMIT = 80;

export type Bookmark = {
  name?: string;
  position: number | string;
  chapter?: string;
  chapterPage?: number;
};
export type BookmarkChange =
  | { intent: "add" | "remove"; mark: Bookmark }
  | { intent: "rename"; mark: Bookmark; name: string };
export type BookmarkResult =
  | { items: Bookmark[]; writable: boolean }
  | { error: "unavailable" | "accountChanged" | "bookmarkConflict" };
export type BookmarkAction = (
  change?: BookmarkChange,
) => Promise<BookmarkResult>;
