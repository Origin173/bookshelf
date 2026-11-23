"use client";

import { MarkdownDownload } from "@/app/markdown-download";
import { exportNotePage } from "@/app/notes/export-action";

export function ExportNotes({
  account,
  title,
  label,
  working,
  failed,
  changed,
  empty,
}: {
  account: string;
  title: string;
  label: string;
  working: string;
  failed: string;
  changed: string;
  empty: string;
}) {
  return (
    <MarkdownDownload
      filename="bookshelf-notes.md"
      label={label}
      working={working}
      failed={failed}
      prepare={async (active) => {
        const books = new Map<string, string[]>();
        let cursor: string | undefined;
        do {
          const page = await exportNotePage(account, cursor);
          if (!active()) return;
          if (page.error) {
            return { message: page.error === "account" ? changed : failed };
          }
          for (const group of page.groups) {
            const lines = books.get(group.id);
            if (lines) lines.push(group.entries.join("\n\n"));
            else
              books.set(group.id, [
                `## ${group.title}`,
                group.entries.join("\n\n"),
              ]);
          }
          cursor = page.cursor;
        } while (cursor);
        if (!books.size) return { message: empty };
        const parts = [`# ${title}\n`];
        for (const lines of books.values())
          parts.push(`\n${lines.join("\n\n")}\n`);
        return { parts };
      }}
    />
  );
}
