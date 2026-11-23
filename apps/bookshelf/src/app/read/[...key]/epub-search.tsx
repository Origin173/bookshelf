import type { Book } from "epubjs";
import type Section from "epubjs/types/section";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FilterInput } from "@/app/filter-input";
import {
  findPassages,
  type Passage,
  searchableText,
} from "@/app/read/[...key]/epub-search-text";
import type { TocEntry } from "@/app/read/[...key]/epub-toc";
import { BUTTON_ROUND } from "@/app/ui";
import { encodeKey } from "@/lib/http";
import type { ReaderText } from "@/lib/reader-text";
import { SIGN_OUT_CHANNEL } from "@/lib/session-events";

const MAX_RESULTS = 100;

type Scan = {
  hits: Passage[];
  next: number;
  complete: boolean;
  truncated?: boolean;
  incomplete?: boolean;
};

async function readPassages(
  section: Section,
  base: URL,
  signal: AbortSignal,
  needle: string,
  limit: number,
) {
  const url = new URL(section.url, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    return null;
  url.search = "";
  url.hash = "";
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { "cache-control": "no-store" },
    mode: "same-origin",
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Chapter unavailable");
  const source = await response.text();
  signal.throwIfAborted();
  return findPassages(source, section, needle, limit);
}

export function EpubSearch({
  book,
  bookKey,
  entries,
  t,
  selected,
  jump,
  onGo,
  onReset,
}: {
  book: Book | null;
  bookKey: string;
  entries: TocEntry[];
  t: ReaderText;
  selected?: string;
  jump: "idle" | "moving" | "failed";
  onGo: (passage: Passage, keepReturn: boolean) => void;
  onReset: (leaving: boolean) => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const scrollTop = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Scan>();
  // The cursor can move without producing any new rows.
  const checkpoint = useRef<Scan>(undefined);
  const active = useRef<AbortController>(null);

  const pause = useCallback(() => {
    if (dialog.current?.open && list.current)
      scrollTop.current = list.current.scrollTop;
    active.current?.abort();
    setOpen(false);
  }, []);

  const changeQuery = useCallback(
    (value: string, leaving = false) => {
      active.current?.abort();
      checkpoint.current = undefined;
      scrollTop.current = 0;
      setResult(undefined);
      setQuery(value);
      onReset(leaving);
    },
    [onReset],
  );

  const close = useCallback(() => {
    pause();
    dialog.current?.close();
  }, [pause]);

  useEffect(() => {
    function reset() {
      close();
      changeQuery("", true);
    }
    function onRestore(event: PageTransitionEvent) {
      if (event.persisted) reset();
    }
    const channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel(SIGN_OUT_CHANNEL)
        : null;
    channel?.addEventListener("message", reset);
    window.addEventListener("pagehide", reset);
    window.addEventListener("pageshow", onRestore);
    return () => {
      channel?.close();
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("pageshow", onRestore);
    };
  }, [changeQuery, close]);

  useLayoutEffect(() => {
    if (open && list.current) list.current.scrollTop = scrollTop.current;
  }, [open]);

  useEffect(() => {
    if (!open || !book || checkpoint.current?.complete) return;
    const needle = searchableText(query.trim()).value;
    if (!needle) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    const base = new URL(`/book/${encodeKey(bookKey)}/`, window.location.href);
    const sections: Section[] = [];
    book.spine.each((section: Section) => sections.push(section));

    async function search() {
      let hits = checkpoint.current?.hits ?? [];
      let next = checkpoint.current?.next ?? 0;
      let incomplete = checkpoint.current?.incomplete ?? false;
      let truncated = false;
      for (; next < sections.length; next++) {
        if (signal.aborted) return;
        try {
          const found = await readPassages(
            sections[next],
            base,
            signal,
            needle,
            MAX_RESULTS + 1 - hits.length,
          );
          if (signal.aborted) return;
          if (!found) incomplete = true;
          else if (found.length) {
            hits = [...hits, ...found];
            truncated = hits.length > MAX_RESULTS;
            if (truncated) {
              hits = hits.slice(0, MAX_RESULTS);
              break;
            }
          }
          const progress = {
            hits,
            next: next + 1,
            complete: false,
            incomplete,
          };
          checkpoint.current = progress;
          if (found?.length) setResult(progress);
        } catch {
          if (signal.aborted) return;
          incomplete = true;
          break;
        }
      }
      const complete = { hits, next, complete: true, incomplete, truncated };
      checkpoint.current = complete;
      setResult(complete);
    }

    const timer = window.setTimeout(() => void search(), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [book, bookKey, open, query]);

  const chapters = new Map<number, string>();
  for (const entry of entries) {
    if (!chapters.has(entry.section) || !entry.fragment)
      chapters.set(entry.section, entry.label);
  }
  const status = !query.trim()
    ? t.searchPassageHint
    : !result?.complete
      ? t.searchingPassages
      : result.truncated
        ? t.moreResults(t.results(result.hits.length))
        : result.incomplete
          ? t.searchIncomplete
          : result.hits.length
            ? t.results(result.hits.length)
            : t.noMatches(query.trim());

  const hits = result?.hits ?? [];
  const index = hits.findIndex((hit) => hit.cfi === selected);
  const previous = index > 0 ? hits[index - 1] : undefined;
  const next = hits[index + 1];
  const moving = jump === "moving";
  const partial =
    !result?.complete || !!result.truncated || !!result.incomplete;
  const matchStatus =
    index < 0
      ? t.results(hits.length)
      : t.matchPosition(index + 1, hits.length, partial);
  const matchNotice = moving
    ? t.openingMatch
    : jump === "failed"
      ? t.matchUnavailable
      : !result?.complete
        ? t.searchPaused
        : result.truncated
          ? t.moreResults(t.results(hits.length))
          : result.incomplete
            ? t.searchIncomplete
            : undefined;

  return (
    <>
      <button
        type="button"
        aria-label={t.search}
        title={t.search}
        aria-haspopup="dialog"
        disabled={!book || moving}
        className={BUTTON_ROUND}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onClose={() => {
          if (!dialog.current?.open) pause();
        }}
        onCancel={pause}
        className="fixed inset-0 m-auto max-h-[75dvh] w-[calc(100%-2rem)] max-w-sm flex-col rounded-xl bg-background p-4 text-foreground shadow-lg open:flex backdrop:bg-black/30"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={title} className="font-semibold">
            {t.search}
          </h2>
          <button
            type="button"
            className={BUTTON_ROUND}
            aria-label={t.hide}
            onClick={close}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <FilterInput
          label={t.search}
          clear={t.clearSearch}
          value={query}
          onChange={changeQuery}
        />
        <p role="status" className="mt-2 text-sm text-secondary">
          {status}
        </p>
        {!!result?.hits.length && (
          <ul
            ref={list}
            onScroll={(event) => {
              if (dialog.current?.open)
                scrollTop.current = event.currentTarget.scrollTop;
            }}
            className="mt-3 min-h-0 divide-y divide-separator overflow-y-auto overscroll-contain"
          >
            {result.hits.map((hit) => (
              <li key={hit.cfi}>
                <button
                  type="button"
                  aria-current={hit.cfi === selected ? "location" : undefined}
                  onClick={() => {
                    close();
                    onGo(hit, false);
                  }}
                  className="w-full break-words rounded-lg px-2 py-2 text-left text-sm hover:bg-fill aria-[current=location]:bg-accent/10"
                >
                  <span className="mb-0.5 block font-medium">
                    {chapters.get(hit.section) ||
                      t.sectionNumber(hit.section + 1)}
                  </span>
                  <span className="text-secondary">
                    {hit.before}
                    <mark className="rounded-[3px] bg-accent/20 text-foreground">
                      {hit.match}
                    </mark>
                    {hit.after}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </dialog>
      {query.trim() && (
        <nav
          aria-label={t.searchMatches}
          className="order-last flex h-14 basis-full items-center gap-2 border-t border-separator pt-1.5"
        >
          <button
            type="button"
            className={`${BUTTON_ROUND} shrink-0`}
            aria-label={t.previousMatch}
            title={t.previousMatch}
            disabled={!book || !previous || moving}
            onClick={() => previous && onGo(previous, true)}
          >
            <ChevronUp aria-hidden="true" className="size-4" />
          </button>
          <p
            role="status"
            className="min-w-0 flex-1 text-center text-xs text-secondary"
          >
            <span className="tabular-nums">{matchStatus}</span>
            {matchNotice && <span className="block">{matchNotice}</span>}
          </p>
          <button
            type="button"
            className={`${BUTTON_ROUND} shrink-0`}
            aria-label={t.nextMatch}
            title={t.nextMatch}
            disabled={!book || !next || moving}
            onClick={() => next && onGo(next, true)}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </button>
        </nav>
      )}
    </>
  );
}
