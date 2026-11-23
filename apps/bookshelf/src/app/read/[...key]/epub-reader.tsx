"use client";

import type { BookProgress } from "@bookshelf/core";
import type { Book, Contents, Location, Rendition } from "epubjs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Appearance,
  applyAppearance,
  EpubAppearance,
  original,
  readAppearance,
} from "@/app/read/[...key]/epub-appearance";
import { EpubContents } from "@/app/read/[...key]/epub-contents";
import {
  bookContents,
  sectionTargets,
  type TocEntry,
} from "@/app/read/[...key]/epub-toc";
import { useReadingPosition } from "@/app/read/[...key]/position";
import { ReaderBookmarks } from "@/app/read/[...key]/reader-bookmarks";
import { BUTTON, BUTTON_ROUND, SELECT } from "@/app/ui";
import type { Bookmark, BookmarkAction } from "@/lib/bookmarks";
import { readStored, writeStored } from "@/lib/local";
import { type ReaderLocale, readerText } from "@/lib/reader-text";

type Mode = "single" | "double" | "scroll";

const MODES = [
  { value: "double", label: "twoPages" },
  { value: "single", label: "onePage" },
  { value: "scroll", label: "scroll" },
] as const;

const MODE_STORAGE_KEY = "bookshelf:mode";

/** How many spine items ahead to pull into the browser cache. */
const PREFETCH_AHEAD = 2;

/** What the reader stored before positions were shared between devices. */
function legacyProgressKey(bookKey: string): string {
  return `bookshelf:progress:${bookKey}`;
}

type SpineItem = { href: string; index: number; linear?: string };

function spineItems(book: Book): SpineItem[] {
  return (
    (book.spine as unknown as { spineItems?: SpineItem[] }).spineItems ?? []
  );
}

/**
 * Where to open a book that has never been read.
 *
 * The first spine item is usually a full-bleed cover image — around a megabyte
 * in this library — and the shelf has already shown that cover. Starting at the
 * first real section avoids downloading it again just to look at it.
 */
function firstReadableHref(book: Book): string | undefined {
  return spineItems(book).find(
    (item) => item.linear !== "no" && !/cover/i.test(item.href),
  )?.href;
}

/** Chapters live in their own documents. A swipe there never reaches the toolbar. */
function enableSwipe(view: Rendition, { document: doc }: Contents) {
  let start: PointerEvent | null = null;
  doc.documentElement.style.touchAction = "pan-y pinch-zoom";
  doc.addEventListener("pointerdown", (event) => {
    const target = event.target as Element | null;
    start =
      event.pointerType === "touch" &&
      event.isPrimary &&
      !target?.closest?.(
        "a, button, input, select, textarea, [contenteditable=true]",
      )
        ? event
        : null;
  });
  doc.addEventListener("pointercancel", () => {
    start = null;
  });
  doc.addEventListener("pointerup", (event) => {
    const from = start;
    start = null;
    if (
      !from ||
      event.pointerId !== from.pointerId ||
      doc.getSelection()?.isCollapsed === false
    )
      return;
    const dx = event.clientX - from.clientX;
    const dy = event.clientY - from.clientY;
    if (Math.abs(dx) < 60 || Math.abs(dy) >= Math.abs(dx)) return;
    const rtl =
      "direction" in view.settings && view.settings.direction === "rtl";
    if (rtl ? dx > 0 : dx < 0) void view.next();
    else void view.prev();
  });
}

export function EpubReader({
  opfUrl,
  bookKey,
  bookId,
  profileId,
  start,
  saved,
  canSync,
  bookmarks,
  locale,
}: {
  locale: ReaderLocale;
  opfUrl: string;
  bookKey: string;
  bookId: string;
  profileId: string;
  /** This profile's position as the library has it, from any device. */
  saved: BookProgress | null;
  start?: string;
  /** False against a library the app cannot write to. */
  canSync: boolean;
  bookmarks?: BookmarkAction;
}) {
  const t = readerText[locale];
  const container = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const openingCfi = useRef(start);
  // Keep the opening passage in memory while the saved position is in the PDF.
  const previewCfi = useRef<string | undefined>(undefined);
  const targetCfi = useRef<string | undefined>(undefined);
  const restoringCfi = useRef<string | undefined>(undefined);
  const requestedEntry = useRef<{ entry: TocEntry; from?: string }>(undefined);
  const [returnCfi, setReturnCfi] = useState<string>();
  const [place, setPlace] = useState<{
    chapter: string;
    active?: TocEntry;
    pages: string;
    mark: Bookmark & { position: string };
  } | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [mode, setMode] = useState<Mode>("double");

  const appearanceKey = `bookshelf:epub:appearance:${profileId}`;
  const [appearance, setAppearance] = useState(original);
  const [fixedLayout, setFixedLayout] = useState<boolean | null>(null);

  function changeAppearance(next: Appearance) {
    writeStored(appearanceKey, `${next.size}/${next.tint}`);
    setAppearance(next);
  }

  const legacy = useCallback(() => {
    const raw = readStored(legacyProgressKey(bookKey));
    if (!raw) return null;
    return {
      cfi: raw,
      // Dated to the epoch so the library's copy wins the moment there is one,
      // rather than a device's history outranking it forever.
      updatedAt: new Date(0).toISOString(),
    };
  }, [bookKey]);

  const { ready, current, record } = useReadingPosition({
    bookId,
    profileId,
    saved,
    canSync,
    legacy,
  });

  // Read before the book is rendered, so it is only ever built once, for the
  // layout the reader actually wants.
  const [modeRestored, setModeRestored] = useState(false);
  useEffect(() => {
    const savedMode = readStored(MODE_STORAGE_KEY);
    if (
      savedMode === "single" ||
      savedMode === "double" ||
      savedMode === "scroll"
    ) {
      setMode(savedMode);
    }
    setAppearance(readAppearance(appearanceKey));
    setModeRestored(true);
  }, [appearanceKey]);

  const restored = modeRestored && ready;

  useEffect(() => {
    const element = container.current;
    if (!element || !restored) return;

    let book: Book | null = null;
    let cancelled = false;

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as Element | null;
      if (
        target?.closest?.(
          "dialog, select, input, textarea, [contenteditable=true]",
        )
      )
        return;
      if (event.key === "ArrowLeft") rendition.current?.prev();
      if (event.key === "ArrowRight") rendition.current?.next();
    }

    function onResize() {
      targetCfi.current = previewCfi.current ?? current()?.cfi;
      restoringCfi.current = targetCfi.current;
      // epub.js accepts an optional CFI after its width and height.
      const view = rendition.current as
        | (Rendition & {
            resize(width: undefined, height: undefined, cfi?: string): void;
          })
        | null;
      view?.resize(undefined, undefined, targetCfi.current);
    }

    /**
     * Warms the browser cache with the sections just ahead, so turning the page
     * doesn't wait on a round trip out to R2 and back.
     */
    function prefetchAhead(opened: Book, index?: number) {
      if (typeof index !== "number") return;
      const items = spineItems(opened);
      for (let i = index + 1; i <= index + PREFETCH_AHEAD; i++) {
        const next = items[i];
        if (!next) break;
        // A prefetch that fails costs nothing; the real load will retry.
        void fetch(opened.resolve(next.href)).catch(() => {});
      }
    }

    setStatus("loading");
    setPlace(null);

    // epub.js touches window at import time, so it is loaded here rather than
    // at module scope, where it would break the server render.
    import("epubjs")
      .then(({ default: ePub }) => {
        if (cancelled) return;

        // Pointed at the .opf so epub.js fetches chapters one at a time instead
        // of pulling down the entire archive.
        const opened = ePub(opfUrl);
        book = opened;

        const view = opened.renderTo(element, {
          width: "100%",
          height: "100%",
          flow: mode === "scroll" ? "scrolled" : "paginated",
          // The continuous manager appends the next section as you reach the
          // end of one, so scrolling runs through the book rather than
          // stopping dead at each chapter boundary.
          manager: mode === "scroll" ? "continuous" : "default",
          spread: mode === "double" ? "auto" : "none",
          // Book markup is untrusted: no scripts inside the iframe.
          allowScriptedContent: false,
        });
        rendition.current = view;
        let entries: TocEntry[] = [];
        const targetsBySection = new Map<
          number,
          ReturnType<typeof sectionTargets>
        >();
        view.hooks.unloaded.register(
          (removed: { section: { index: number } }) =>
            targetsBySection.delete(removed.section.index),
        );
        view.hooks.content.register((contents: Contents) => {
          targetsBySection.set(
            contents.sectionIndex,
            sectionTargets(contents, entries),
          );
          if (view.settings.layout !== "pre-paginated") {
            applyAppearance(contents, appearance);
          }
        });
        if (mode !== "scroll") {
          view.hooks.content.register((contents: Contents) =>
            enableSwipe(view, contents),
          );
        }

        // Fires for every move — buttons, keyboard and contents jumps alike —
        // so position and label stay in step however the reader got there.
        view.on("relocated", ({ start, end }: Location) => {
          if (cancelled || !start?.cfi) return;

          const { page, total } = start.displayed;
          const paginated =
            mode !== "scroll" &&
            view.settings.layout !== "pre-paginated" &&
            !opened.spine
              .get(start.index)
              ?.properties.includes("rendition:layout-pre-paginated");
          const counted =
            paginated &&
            Number.isSafeInteger(page) &&
            Number.isSafeInteger(total) &&
            page > 0 &&
            page <= total;
          // After reflow the first visible character can move while the saved
          // passage is still on screen. Keep that exact CFI until we leave it.
          const targets = targetsBySection.get(start.index) ?? [];
          const requested = requestedEntry.current;
          const onScreen = (cfi: string) =>
            end?.cfi &&
            view.epubcfi.compare(start.cfi, cfi) <= 0 &&
            view.epubcfi.compare(cfi, end.cfi) <= 0;
          if (requested?.entry.section === start.index) {
            targetCfi.current = targets.find(
              ({ entry }) => entry === requested.entry,
            )?.cfi;
            restoringCfi.current = targetCfi.current;
            const destination = targetCfi.current ?? start.cfi;
            if (
              requested.from &&
              view.epubcfi.compare(requested.from, destination) !== 0
            ) {
              setReturnCfi(requested.from);
            }
            requestedEntry.current = undefined;
          }
          const target = targetCfi.current;
          if (target && restoringCfi.current === target) {
            restoringCfi.current = undefined;
            if (!onScreen(target)) {
              // A new font or viewport can finish paginating after the first
              // display. Reposition once against the actual rendered section.
              const heading = targets.find(({ cfi }) => cfi === target);
              void view.display(heading?.entry.href ?? target).catch(() => {
                if (!cancelled) setStatus("error");
              });
              return;
            }
          }
          const position = target && onScreen(target) ? target : start.cfi;
          if (position !== target) targetCfi.current = undefined;
          const active =
            targets.findLast(
              ({ cfi }) => view.epubcfi.compare(cfi, position) <= 0,
            )?.entry ??
            entries.find(
              (entry) => entry.section === start.index && !entry.fragment,
            );
          const chapter = active?.label || t.sectionNumber(start.index + 1);
          setPlace({
            chapter,
            active,
            pages: counted ? t.sectionPage(page, total) : "",
            mark: {
              position,
              chapter: chapter.slice(0, 240),
              chapterPage: counted ? page : undefined,
            },
          });
          const saved = current();
          if (!previewCfi.current && !target && saved?.page && !saved.cfi) {
            previewCfi.current = position;
            targetCfi.current = position;
          } else if (
            position !== previewCfi.current &&
            position !== saved?.cfi
          ) {
            previewCfi.current = undefined;
            record({ cfi: position, href: start.href });
          }
          prefetchAhead(opened, start.index);
        });

        // Arrow keys while the book itself has focus: epub.js re-emits DOM
        // events from inside its iframe, which a window listener never sees.
        view.on("keydown", onKeyDown);

        // `ready` resolves once the spine is parsed, which is what tells us
        // where the cover ends and the book begins.
        return opened.ready.then(async () => {
          if (cancelled) return;
          entries = bookContents(opened, opened.navigation?.toc ?? [], opfUrl);
          setToc(entries);
          requestedEntry.current = undefined;
          targetCfi.current =
            openingCfi.current ?? previewCfi.current ?? current()?.cfi;
          openingCfi.current = undefined;
          restoringCfi.current = targetCfi.current;
          await view.display(targetCfi.current ?? firstReadableHref(opened));
          if (!cancelled)
            setFixedLayout(view.settings.layout === "pre-paginated");
        });
      })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      rendition.current = null;
      book?.destroy();
    };
    // A fresh rendition lays out the saved passage with the selected settings.
  }, [opfUrl, mode, appearance, restored, current, record, t]);

  function goToPassage(position: number | string) {
    if (typeof position !== "string") return;
    requestedEntry.current = undefined;
    restoringCfi.current = position;
    targetCfi.current = position;
    return rendition.current?.display(position);
  }

  const turn = useCallback((direction: "prev" | "next") => {
    const view = rendition.current;
    if (direction === "prev") view?.prev();
    else view?.next();
  }, []);

  const changeMode = useCallback((next: Mode) => {
    writeStored(MODE_STORAGE_KEY, next);
    setMode(next);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex-1">
        {/* Full width when paginated; a readable column when scrolling, since
            book CSS assumes a page rather than a 1440px browser window. */}
        <div
          ref={container}
          className={`absolute inset-0 ${mode === "scroll" ? "mx-auto max-w-3xl" : ""}`}
        />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center">
            {status === "error" ? (
              <p className="text-sm text-secondary">{t.openError}</p>
            ) : (
              <div className="w-full max-w-md animate-pulse space-y-3 px-6">
                <div className="h-3 w-2/3 rounded bg-fill" />
                <div className="h-3 rounded bg-fill" />
                <div className="h-3 rounded bg-fill" />
                <div className="h-3 w-5/6 rounded bg-fill" />
              </div>
            )}
          </div>
        )}
      </div>

      <section
        aria-label={t.chapterPosition}
        className="flex h-9 shrink-0 items-center gap-2 border-t border-separator px-3 text-xs text-secondary sm:px-6"
      >
        <span className="min-w-0 flex-1 truncate" title={place?.chapter}>
          {place?.chapter}
        </span>
        <span className="shrink-0 tabular-nums">{place?.pages}</span>
        {returnCfi && (
          <button
            type="button"
            className={`${BUTTON} shrink-0`}
            disabled={status !== "ready"}
            onClick={() => {
              goToPassage(returnCfi)?.then(
                () =>
                  setReturnCfi((cfi) => (cfi === returnCfi ? undefined : cfi)),
                () => setStatus("error"),
              );
            }}
          >
            {t.backToPassage}
          </button>
        )}
      </section>
      <div className="flex items-center justify-between gap-1.5 px-3 pb-3 pt-1 max-[360px]:flex-wrap sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={() => turn("prev")}
          aria-label={t.previous}
          className={BUTTON_ROUND}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>

        {bookmarks && (
          <ReaderBookmarks
            action={bookmarks}
            current={status === "ready" ? (place?.mark ?? null) : null}
            onGo={goToPassage}
            t={t}
          />
        )}
        {fixedLayout === false && (
          <EpubAppearance
            value={appearance}
            onChange={changeAppearance}
            t={t}
          />
        )}
        {toc.length > 0 ? (
          <EpubContents
            entries={toc}
            active={place?.active}
            t={t}
            onGo={(entry) => {
              requestedEntry.current = { entry, from: place?.mark.position };
              restoringCfi.current = undefined;
              targetCfi.current = undefined;
              rendition.current?.display(entry.href);
            }}
          />
        ) : null}

        <select
          aria-label={t.layout}
          value={mode}
          onChange={(event) => changeMode(event.target.value as Mode)}
          className={`${SELECT} shrink-0`}
        >
          {MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {t[option.label]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => turn("next")}
          aria-label={t.next}
          className={BUTTON_ROUND}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
