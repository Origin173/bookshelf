"use server";

import { bookmarkLabel } from "@/lib/bookmarks";
import { language } from "@/lib/i18n";
import { readerText } from "@/lib/reader-text";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import { readingNotes } from "@/services/reading-notes";

function heading(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_[\]#<>|~])/g, "\\$1");
}

export async function exportNotePage(renderedFor: string, cursor?: string) {
  const account = await requirePageAccount();
  if (!account || account !== renderedFor) return { error: "account" } as const;
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.length > 4096)
  )
    return { error: "unavailable" } as const;
  const { catalog, storage } = await getServices();
  const page = await ifAvailable(async () =>
    readingNotes(
      storage,
      accountProfile(account).id,
      (await catalog.browse()).books,
      cursor,
    ),
  );
  if (!page) return { error: "unavailable" } as const;
  const t = readerText[await language()];
  const groups = page.groups.map(({ book, notes }) => ({
    id: book.id,
    title: heading(book.title),
    entries: notes.map(({ mark, format }) => {
      const location = [mark.name, bookmarkLabel(mark, t), format.toUpperCase()]
        .filter(Boolean)
        .join(" · ");
      const text = (mark.note ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      return `### ${heading(location)}\n\n${text}`;
    }),
  }));
  return { groups, cursor: page.cursor } as const;
}
