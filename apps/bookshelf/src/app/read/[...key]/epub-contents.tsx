import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FilterInput } from "@/app/filter-input";
import type { TocEntry } from "@/app/read/[...key]/epub-toc";
import { BUTTON, BUTTON_ROUND, SELECT } from "@/app/ui";
import type { ReaderText } from "@/lib/reader-text";

export function EpubContents({
  entries,
  active,
  t,
  onGo,
}: {
  entries: TocEntry[];
  active?: TocEntry;
  t: ReaderText;
  onGo: (entry: TocEntry) => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const rows = needle
    ? entries.filter((entry) => entry.label.toLowerCase().includes(needle))
    : entries;

  const sections = useMemo(() => {
    const seen = new Set<string>();
    return entries.filter(({ href }) => {
      if (seen.has(href)) return false;
      seen.add(href);
      return true;
    });
  }, [entries]);
  const index = sections.findIndex((entry) => entry.href === active?.href);
  const previous = sections[index - 1];
  const next = index >= 0 ? sections[index + 1] : undefined;

  function go(entry: TocEntry) {
    dialog.current?.close();
    onGo(entry);
  }

  useEffect(() => {
    if (!needle && dialog.current?.open) {
      current.current?.scrollIntoView({ block: "nearest" });
    }
  }, [needle]);

  return (
    <>
      <button
        type="button"
        aria-label={t.jump}
        aria-haspopup="dialog"
        className={`${SELECT} flex min-w-0 flex-1 items-center justify-between gap-1 max-sm:px-2 max-[360px]:order-first max-[360px]:basis-full`}
        onClick={() => {
          dialog.current?.showModal();
          current.current?.scrollIntoView({ block: "nearest" });
        }}
      >
        <span className="truncate">{t.contents}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onClose={() => setQuery("")}
        className="fixed inset-0 m-auto max-h-[75dvh] w-[calc(100%-2rem)] max-w-sm flex-col rounded-xl bg-background p-4 text-foreground shadow-lg open:flex backdrop:bg-black/30"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={title} className="font-semibold">
            {t.contents}
          </h2>
          <button
            type="button"
            className={BUTTON_ROUND}
            aria-label={t.hide}
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <FilterInput
          value={query}
          onChange={setQuery}
          label={t.findChapter}
          clear={t.clearSearch}
        />
        {rows.length ? (
          <ul className="mt-3 min-h-0 overflow-y-auto overscroll-contain">
            {rows.map((entry) => (
              <li key={entry.id}>
                <button
                  ref={entry === active ? current : undefined}
                  aria-current={entry === active ? "location" : undefined}
                  type="button"
                  className="flex w-full items-start gap-1.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-fill aria-[current=location]:font-medium aria-[current=location]:text-accent"
                  style={
                    needle
                      ? undefined
                      : {
                          paddingLeft: `${0.5 + 0.75 * Math.min(entry.parents.length, 4)}rem`,
                        }
                  }
                  onClick={() => go(entry)}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {entry.label}
                    {needle && entry.parents.length > 0 && (
                      <span className="block text-xs font-normal text-secondary">
                        {entry.parents.join(" › ")}
                      </span>
                    )}
                  </span>
                  {entry === active && (
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="mt-3 text-sm text-secondary">
            {t.noChapterMatches}
          </p>
        )}
        <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-separator pt-3">
          {[
            { label: t.previousSection, entry: previous },
            { label: t.nextSection, entry: next },
          ].map(({ label, entry }) => (
            <button
              key={label}
              type="button"
              disabled={!entry}
              title={entry?.label}
              className={`${BUTTON} disabled:opacity-40`}
              onClick={() => entry && go(entry)}
            >
              {label}
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
