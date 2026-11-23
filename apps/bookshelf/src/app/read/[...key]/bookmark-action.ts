"use server";

import { parseBookKey } from "@bookshelf/core";
import type { BookmarkChange, BookmarkResult } from "@/lib/bookmarks";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { bookBookmarks } from "@/services/bookmarks";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";

export async function readerBookmarks(
  profileId: string,
  fileKey: string,
  change?: BookmarkChange,
): Promise<BookmarkResult> {
  const account = await requirePageAccount(fileKey);
  if (!account || accountProfile(account).id !== profileId)
    return { error: "accountChanged" };
  const target = typeof fileKey === "string" && parseBookKey(fileKey);
  if (!target) return { error: "unavailable" };
  const { catalog, storage } = await getServices();
  const result = await ifAvailable(async () => {
    const book = await catalog.find(target.id);
    const format = book?.formats.find((f) => f.file === target.file)?.format;
    if (format !== "pdf" && format !== "epub") return undefined;
    return bookBookmarks(storage, profileId, fileKey, format, change);
  });
  return result ?? { error: "unavailable" };
}
