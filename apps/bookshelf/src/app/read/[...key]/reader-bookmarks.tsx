"use client";

import { Bookmark as BookmarkIcon, NotebookPen, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { BUTTON, BUTTON_QUIET, BUTTON_ROUND, INPUT } from "@/app/ui";
import {
  BOOKMARK_NAME_LIMIT,
  BOOKMARK_NOTE_LIMIT,
  type Bookmark,
  type BookmarkAction,
  type BookmarkChange,
  type BookmarkResult,
  bookmarkLabel,
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
  const editorId = useId();
  const sequence = useRef(0);
  const [result, setResult] = useState<BookmarkResult | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    mark: Bookmark;
    field: "name" | "note";
    value: string;
  } | null>(null);
  const field = useRef<HTMLLabelElement>(null);
  const editingPosition = editing?.mark.position;
  useEffect(() => {
    if (editingPosition !== undefined) field.current?.control?.focus();
  }, [editingPosition]);

  async function load(change?: BookmarkChange) {
    const version = ++sequence.current;
    setBusy(true);
    try {
      const value = await action(change);
      if (version === sequence.current) {
        setResult(value);
        if (
          (change?.intent === "rename" || change?.intent === "note") &&
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
  async function jump(mark: Bookmark) {
    try {
      await onGo(mark.position);
      dialog.current?.close();
    } catch {
      setResult({ error: "unavailable" });
    }
  }
  const items = result && "items" in result ? result.items : [];
  const marked = items.some((item) => item.position === current?.position);
  const needle = query.trim().toLocaleLowerCase();
  const matching = needle
    ? items.filter((mark) =>
        [mark.name, mark.note, bookmarkLabel(mark, t)].some((text) =>
          text?.toLocaleLowerCase().includes(needle),
        ),
      )
    : items;
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
          setQuery("");
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
            {(items.length > 1 || query) && (
              <input
                type="search"
                aria-label={t.findBookmark}
                placeholder={t.findBookmark}
                className={`${INPUT} mt-3 w-full`}
                value={query}
                disabled={editing !== null}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
            {matching.length ? (
              <ul className="mt-3 divide-y divide-separator">
                {matching.map((mark) => (
                  <li key={mark.position} className="py-1">
                    {result.writable &&
                    editing?.mark.position === mark.position ? (
                      <form
                        className="w-full py-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void load(
                            editing.field === "note"
                              ? {
                                  intent: "note",
                                  mark: editing.mark,
                                  note: editing.value,
                                }
                              : {
                                  intent: "rename",
                                  mark: editing.mark,
                                  name: editing.value,
                                },
                          );
                        }}
                      >
                        <label
                          ref={field}
                          htmlFor={editorId}
                          className="block text-sm"
                        >
                          {editing.field === "note"
                            ? t.bookmarkNote
                            : t.bookmarkName}
                        </label>
                        {editing.field === "note" ? (
                          <textarea
                            id={editorId}
                            className={`${INPUT} mt-1 w-full resize-y`}
                            rows={4}
                            maxLength={BOOKMARK_NOTE_LIMIT}
                            disabled={busy}
                            value={editing.value}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                value: event.target.value,
                              })
                            }
                          />
                        ) : (
                          <input
                            id={editorId}
                            className={`${INPUT} mt-1 w-full`}
                            type="text"
                            placeholder={bookmarkLabel(mark, t)}
                            maxLength={BOOKMARK_NAME_LIMIT}
                            disabled={busy}
                            value={editing.value}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                value: event.target.value,
                              })
                            }
                          />
                        )}

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
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            className={`${BUTTON_QUIET} min-w-0 flex-1 break-words text-left`}
                            disabled={busy}
                            onClick={() => void jump(mark)}
                          >
                            {mark.name || bookmarkLabel(mark, t)}
                            {mark.name && (
                              <span className="block text-xs text-secondary">
                                {bookmarkLabel(mark, t)}
                              </span>
                            )}
                          </button>
                          {result.writable && (
                            <>
                              <button
                                type="button"
                                className={BUTTON_ROUND}
                                aria-label={`${t.renameBookmark} · ${mark.name || bookmarkLabel(mark, t)}`}
                                title={t.renameBookmark}
                                disabled={busy}
                                onClick={() =>
                                  setEditing({
                                    mark,
                                    field: "name",
                                    value: mark.name ?? "",
                                  })
                                }
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                              </button>
                              <button
                                type="button"
                                className={BUTTON_ROUND}
                                aria-label={`${mark.note ? t.editNote : t.addNote} · ${mark.name || bookmarkLabel(mark, t)}`}
                                title={mark.note ? t.editNote : t.addNote}
                                disabled={busy}
                                onClick={() =>
                                  setEditing({
                                    mark,
                                    field: "note",
                                    value: mark.note ?? "",
                                  })
                                }
                              >
                                <NotebookPen
                                  aria-hidden="true"
                                  className="size-4"
                                />
                              </button>
                              <button
                                type="button"
                                className={`${BUTTON_QUIET} shrink-0`}
                                aria-label={`${t.removeBookmark} · ${mark.name || bookmarkLabel(mark, t)}`}
                                disabled={busy}
                                onClick={() =>
                                  void load({ intent: "remove", mark })
                                }
                              >
                                {t.removeBookmark}
                              </button>
                            </>
                          )}
                        </div>
                        {mark.note && (
                          <details className="px-3 pb-1 text-sm">
                            <summary className="cursor-pointer text-secondary">
                              {t.bookmarkNote}
                            </summary>
                            <p className="mt-1 whitespace-pre-wrap break-words">
                              {mark.note}
                            </p>
                          </details>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="mt-3 text-sm text-secondary">
                {items.length ? t.noBookmarkMatches : t.emptyBookmarks}
              </p>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
