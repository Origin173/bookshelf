"use client";

import type { Contents } from "epubjs";
import { Type, X } from "lucide-react";
import { useId, useRef } from "react";
import { BUTTON_ROUND, SELECT } from "@/app/ui";
import { readStored } from "@/lib/local";
import type { ReaderText } from "@/lib/reader-text";

const SIZES = [85, 100, 125, 150, 175, 200];
const TINTS = ["publisher", "sepia", "night"] as const;

export type Appearance = { size: number; tint: (typeof TINTS)[number] };
export const original: Appearance = { size: 100, tint: "publisher" };

export function readAppearance(key: string): Appearance {
  const [size, tint] = (readStored(key) ?? "").split("/");
  return {
    size: SIZES.includes(Number(size)) ? Number(size) : original.size,
    tint: TINTS.find((option) => option === tint) ?? original.tint,
  };
}

const palettes = {
  sepia: { background: "#f3ead8", color: "#403424", link: "#704819" },
  night: { background: "#191b1f", color: "#e1e3e7", link: "#a9ccff" },
};

export function applyAppearance(
  contents: Contents,
  { size, tint }: Appearance,
) {
  const doc = contents.document;
  const win = doc.defaultView;
  if (win && size !== 100) {
    const elements = [doc.documentElement, doc.body];
    const sizes = elements.map((el) =>
      parseFloat(win.getComputedStyle(el).fontSize),
    );
    elements.forEach((el, i) => {
      el.style.setProperty(
        "font-size",
        `${(sizes[i] * size) / 100}px`,
        "important",
      );
    });
  }
  if (tint === "publisher") return;
  const { background, color, link } = palettes[tint];
  return contents.addStylesheetCss(
    `
    html, body { background-color: ${background} !important; color: ${color} !important; }
    body :where(article, section, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, pre, code, table, td, th) {
      background-color: transparent !important; color: inherit !important;
    }
    body a { color: ${link} !important; }
  `,
    "bookshelf-appearance",
  );
}

export function EpubAppearance({
  value,
  onChange,
  t,
}: {
  value: Appearance;
  onChange: (next: Appearance) => void;
  t: ReaderText;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return (
    <>
      <button
        type="button"
        className={BUTTON_ROUND}
        aria-label={t.appearance}
        title={t.appearance}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Type aria-hidden="true" className="size-4" />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-background p-4 text-foreground shadow-lg backdrop:bg-black/30"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={title} className="font-semibold">
            {t.appearance}
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
        <label className="mt-3 flex items-center justify-between gap-2 text-sm">
          {t.textSize}
          <select
            className={SELECT}
            value={value.size}
            onChange={(event) =>
              onChange({ ...value, size: Number(event.target.value) })
            }
          >
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size}%
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex items-center justify-between gap-2 text-sm">
          {t.tint}
          <select
            className={SELECT}
            value={value.tint}
            onChange={(event) =>
              onChange({
                ...value,
                tint: event.target.value as Appearance["tint"],
              })
            }
          >
            {TINTS.map((tint) => (
              <option key={tint} value={tint}>
                {t[tint]}
              </option>
            ))}
          </select>
        </label>
      </dialog>
    </>
  );
}
