import type { Book } from "epubjs";
import type Section from "epubjs/types/section";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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

const MAX_RESULTS = 100;

export function EpubSearch({
  book,
  bookKey,
  entries,
  t,
  onGo,
}: {
  book: Book | null;
  bookKey: string;
  entries: TocEntry[];
  t: ReaderText;
  onGo: (cfi: string) => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    dialog.current?.close();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label={t.search}
        title={t.search}
        aria-haspopup="dialog"
        disabled={!book}
        className={BUTTON_ROUND}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
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
        {book && open && (
          <SearchPassages
            book={book}
            bookKey={bookKey}
            entries={entries}
            t={t}
            onGo={(cfi) => {
              close();
              onGo(cfi);
            }}
          />
        )}
      </dialog>
    </>
  );
}

type Scan = {
  query: string;
  hits: Passage[];
  running: boolean;
  truncated?: boolean;
  incomplete?: boolean;
};

function SearchPassages({
  book,
  bookKey,
  entries,
  t,
  onGo,
}: {
  book: Book;
  bookKey: string;
  entries: TocEntry[];
  t: ReaderText;
  onGo: (cfi: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState<Scan>();
  const active = useRef<AbortController>(null);
  const result = scan?.query === query ? scan : undefined;

  useEffect(() => {
    const needle = searchableText(query.trim()).value;
    if (!needle) return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    const base = new URL(`/book/${encodeKey(bookKey)}/`, window.location.href);
    const sections: Section[] = [];
    book.spine.each((section: Section) => sections.push(section));

    async function search() {
      let hits: Passage[] = [];
      let incomplete = false;
      let truncated = false;
      setScan({ query, hits, running: true });
      for (const section of sections) {
        if (signal.aborted) return;
        try {
          const url = new URL(section.url, base);
          if (
            url.origin !== base.origin ||
            !url.pathname.startsWith(base.pathname)
          ) {
            incomplete = true;
            continue;
          }
          url.search = "";
          url.hash = "";
          const response = await fetch(url, {
            signal,
            cache: "no-store",
            headers: { "cache-control": "no-store" },
            mode: "same-origin",
            redirect: "error",
          });
          if (!response.ok) {
            incomplete = true;
            if (response.status === 404) continue;
            break;
          }
          const source = await response.text();
          if (signal.aborted) return;
          const found = findPassages(
            source,
            section,
            needle,
            MAX_RESULTS + 1 - hits.length,
          );
          if (!found) {
            incomplete = true;
            continue;
          }
          if (found.length) {
            hits = [...hits, ...found];
            truncated = hits.length > MAX_RESULTS;
            if (truncated) {
              hits = hits.slice(0, MAX_RESULTS);
              break;
            }
            setScan({ query, hits, running: true });
          }
        } catch {
          if (signal.aborted) return;
          incomplete = true;
          break;
        }
      }
      setScan({ query, hits, running: false, truncated, incomplete });
    }

    const timer = window.setTimeout(() => void search(), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [book, bookKey, query]);

  const chapters = new Map<number, string>();
  for (const entry of entries) {
    if (!chapters.has(entry.section) || !entry.fragment)
      chapters.set(entry.section, entry.label);
  }
  const status = !query.trim()
    ? t.searchPassageHint
    : !result || result.running
      ? t.searchingPassages
      : result.truncated
        ? t.moreResults(t.results(result.hits.length))
        : result.incomplete
          ? t.searchIncomplete
          : result.hits.length
            ? t.results(result.hits.length)
            : t.noMatches(query.trim());

  return (
    <>
      <FilterInput
        label={t.search}
        clear={t.clearSearch}
        value={query}
        onChange={(value) => {
          active.current?.abort();
          setScan(undefined);
          setQuery(value);
        }}
      />
      <p role="status" className="mt-2 text-sm text-secondary">
        {status}
      </p>
      {result && result.hits.length > 0 && (
        <ul className="mt-3 min-h-0 divide-y divide-separator overflow-y-auto overscroll-contain">
          {result.hits.map((hit) => (
            <li key={hit.cfi}>
              <button
                type="button"
                onClick={() => onGo(hit.cfi)}
                className="w-full break-words rounded-lg px-2 py-2 text-left text-sm hover:bg-fill"
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
    </>
  );
}
