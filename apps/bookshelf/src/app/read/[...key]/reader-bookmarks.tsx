"use client";

import { Bookmark as BookmarkIcon, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { BUTTON, BUTTON_QUIET, BUTTON_ROUND, INPUT } from "@/app/ui";
import {
  BOOKMARK_NAME_LIMIT,
  type Bookmark,
  type BookmarkAction,
  type BookmarkChange,
  type BookmarkResult,
} from "@/lib/bookmarks";
import type { ReaderText } from "@/lib/reader-text";

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
  const [editing, setEditing] = useState<{
    position: Bookmark["position"];
    value: string;
  } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const editingPosition = editing?.position;
  useEffect(() => {
    if (editingPosition !== undefined) field.current?.focus();
  }, [editingPosition]);

  async function load(change?: BookmarkChange) {
    const version = ++sequence.current;
    setBusy(true);
    try {
      const value = await action(change);
      if (version === sequence.current) {
        setResult(value);
        if (
          change?.intent === "rename" &&
          !("error" in value && value.error === "unavailable")
        )
          setEditing(null);
      }
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
        onCancel={(event) => {
          if (editing) {
            event.preventDefault();
            setEditing(null);
          }
        }}
        onClose={() => {
          sequence.current++;
          setResult(null);
          setEditing(null);
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
                    {result.writable && editing?.position === mark.position ? (
                      <form
                        className="w-full py-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void load({
                            intent: "rename",
                            mark,
                            name: editing.value,
                          });
                        }}
                      >
                        <label className="block text-sm">
                          {t.bookmarkName}
                          <input
                            ref={field}
                            className={`${INPUT} mt-1 w-full`}
                            type="text"
                            placeholder={label(mark)}
                            maxLength={BOOKMARK_NAME_LIMIT}
                            value={editing.value}
                            disabled={busy}
                            onChange={(event) =>
                              setEditing({
                                position: mark.position,
                                value: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="mt-2 flex gap-2">
                          <button
                            className={BUTTON}
                            type="submit"
                            disabled={busy}
                          >
                            {t.saveName}
                          </button>
                          <button
                            className={BUTTON_QUIET}
                            type="button"
                            disabled={busy}
                            onClick={() => setEditing(null)}
                          >
                            {t.cancelName}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`${BUTTON_QUIET} min-w-0 flex-1 break-words text-left`}
                          disabled={busy}
                          onClick={() => void jump(mark)}
                        >
                          {mark.name || label(mark)}
                          {mark.name && (
                            <span className="block text-xs text-secondary">
                              {label(mark)}
                            </span>
                          )}
                        </button>
                        {result.writable && (
                          <>
                            <button
                              type="button"
                              className={BUTTON_ROUND}
                              aria-label={`${t.renameBookmark} · ${mark.name || label(mark)}`}
                              title={t.renameBookmark}
                              disabled={busy}
                              onClick={() =>
                                setEditing({
                                  position: mark.position,
                                  value: mark.name ?? "",
                                })
                              }
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </button>
                            <button
                              type="button"
                              className={`${BUTTON_QUIET} shrink-0`}
                              aria-label={`${t.removeBookmark} · ${mark.name || label(mark)}`}
                              disabled={busy}
                              onClick={() =>
                                void load({ intent: "remove", mark })
                              }
                            >
                              {t.removeBookmark}
                            </button>
                          </>
                        )}
                      </>
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
