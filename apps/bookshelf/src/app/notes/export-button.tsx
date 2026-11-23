"use client";

import { useEffect, useRef, useState } from "react";
import { exportNotePage } from "@/app/notes/export-action";
import { BUTTON } from "@/app/ui";

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
  const mounted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const books = new Map<string, string[]>();
      let cursor: string | undefined;
      do {
        const page = await exportNotePage(account, cursor);
        if (!mounted.current) return;
        if (page.error) {
          setMessage(page.error === "account" ? changed : failed);
          return;
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
      if (!books.size) {
        setMessage(empty);
        return;
      }
      const parts = [`# ${title}\n`];
      for (const lines of books.values())
        parts.push(`\n${lines.join("\n\n")}\n`);
      const url = URL.createObjectURL(
        new Blob(parts, { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "bookshelf-notes.md";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (mounted.current) setMessage(failed);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <button
        type="button"
        className={BUTTON}
        disabled={busy}
        onClick={download}
      >
        {busy ? working : label}
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
