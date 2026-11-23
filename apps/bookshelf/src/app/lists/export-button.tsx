"use client";

import { exportList } from "@/app/lists/actions";
import { MarkdownDownload } from "@/app/markdown-download";

export function ExportList({
  account,
  listId,
  label,
  working,
  failed,
  changed,
}: {
  account: string;
  listId: string;
  label: string;
  working: string;
  failed: string;
  changed: string;
}) {
  return (
    <MarkdownDownload
      filename="bookshelf-list.md"
      label={label}
      working={working}
      failed={failed}
      prepare={async () => {
        const result = await exportList(account, listId);
        if ("error" in result)
          return { message: result.error === "account" ? changed : failed };
        return { parts: [result.markdown] };
      }}
    />
  );
}
