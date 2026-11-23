"use client";

import { Bookmark as BookmarkIcon, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { BUTTON, BUTTON_QUIET, BUTTON_ROUND } from "@/app/ui";
import type { ReaderText } from "@/lib/reader-text";
import type {
  Bookmark,
  BookmarkAction,
  BookmarkChange,
  BookmarkResult,
} from "@/services/bookmarks";

export function ReaderBookmarks({
  action,
  current,
  onGo,
  t,
}: {
  action: BookmarkAction;
  current: Bookmark | null;
  onGo: (position: number | string) => unknown;
  t: ReaderText;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const sequence = useRef(0);
  const [result, setResult] = useState<BookmarkResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function load(change?: BookmarkChange) {
    const version = ++sequence.current;
    setBusy(true);
    try {
      const value = await action(change);
      if (version === sequence.current) setResult(value);
    } catch {
      if (version === sequence.current) setResult({ error: "unavailable" });
    } finally {
      if (version === sequence.current) setBusy(false);
    }
  }
  function label(mark: Bookmark) {
    if (typeof mark.position === "number") return t.pageNumber(mark.position);
    return [mark.chapter, mark.chapterPage && t.pageNumber(mark.chapterPage)]
      .filter(Boolean)
      .join(" · ");
  }
  async function jump(mark: Bookmark) {
    try {
      await onGo(mark.position);
      dialog.current?.close();
    } catch {
      setResult({ error: "unavailable" });
    }
  }
  const marked =
    result &&
    "items" in result &&
    result.items.some((item) => item.position === current?.position);
  return (
    <>
      <button
        type="button"
        className={BUTTON_ROUND}
        aria-label={t.bookmarks}
        title={t.bookmarks}
        aria-haspopup="dialog"
        disabled={!current}
        onClick={() => {
          dialog.current?.showModal();
          void load();
        }}
      >
        <BookmarkIcon aria-hidden="true" className="size-4" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onClose={() => {
          sequence.current++;
          setResult(null);
          setBusy(false);
        }}
        className="fixed inset-0 m-auto max-h-[75dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-background p-4 text-foreground shadow-lg backdrop:bg-black/30"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={title} className="font-semibold">
            {t.bookmarks}
          </h2>
          <button
            className={BUTTON_ROUND}
            type="button"
            aria-label={t.hide}
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {!result ? (
          <p role="status" className="mt-3 text-sm text-secondary">
            {t.loadingBookmarks}
          </p>
        ) : "error" in result ? (
          <div role="status" className="mt-3 text-sm text-secondary">
            {result.error === "unavailable"
              ? t.bookmarksUnavailable
              : t[result.error]}{" "}
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void load()}
            >
              {t.retryBookmarks}
            </button>
          </div>
        ) : (
          <>
            {result.writable && (
              <button
                type="button"
                className={`mt-3 ${BUTTON}`}
                disabled={busy || !current || !!marked}
                onClick={() =>
                  current && void load({ intent: "add", mark: current })
                }
              >
                {marked ? t.bookmarked : t.addBookmark}
              </button>
            )}
            {result.items.length ? (
              <ul className="mt-3 divide-y divide-separator">
                {result.items.map((mark) => (
                  <li
                    key={mark.position}
                    className="flex items-center justify-between gap-2 py-1"
                  >
                    <button
                      type="button"
                      className={`${BUTTON_QUIET} min-w-0 break-words text-left`}
                      disabled={busy}
                      onClick={() => void jump(mark)}
                    >
                      {label(mark)}
                    </button>
                    {result.writable && (
                      <button
                        type="button"
                        className={`${BUTTON_QUIET} shrink-0`}
                        aria-label={`${t.removeBookmark} · ${label(mark)}`}
                        disabled={busy}
                        onClick={() => void load({ intent: "remove", mark })}
                      >
                        {t.removeBookmark}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-secondary">{t.emptyBookmarks}</p>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
