"use client";

import type { Book } from "@bookshelf/core";
import { type ReactNode, useEffect, useState } from "react";
import type { Candidate } from "@/app/admin/inspect-book";
import { BUTTON, BUTTON_PRIMARY, SELECT } from "@/app/ui";
import type { messages } from "@/lib/i18n";
import { authorNames } from "@/lib/opds/browse";

type Labels = Pick<
  Awaited<ReturnType<typeof messages>>,
  | "sourceDetails"
  | "readSource"
  | "bookFormat"
  | "analyzing"
  | "sourceUnavailable"
  | "noNewDetails"
  | "reviewSource"
  | "currentValue"
  | "notListed"
  | "title"
  | "authors"
  | "coverImage"
  | "coverPreview"
  | "applyDetails"
>;

export function SourceDetails({
  book,
  children,
  t,
}: {
  book: Pick<Book, "id" | "formats" | "authors" | "title" | "isbn" | "cover">;
  children: ReactNode;
  t: Labels;
}) {
  const formats = book.formats.filter(
    (f) => f.format === "epub" || f.format === "pdf",
  );
  const [file, setFile] = useState(formats[0]?.file);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(false);
  const [image, setImage] = useState("");
  useEffect(() => {
    if (!candidate?.cover) {
      setImage("");
      return;
    }
    const url = URL.createObjectURL(candidate.cover);
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [candidate]);
  const source = formats.find((f) => f.file === file);
  if (!source) return null;
  async function inspect() {
    if (!source) return;
    setCandidate(null);
    setSelected(false);
    setFailed(false);
    setBusy(true);
    try {
      const { inspectStoredBook } = await import("@/app/admin/inspect-book");
      setCandidate(await inspectStoredBook(book.id, source, !book.cover));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  const values = candidate
    ? [
        {
          field: "title",
          label: t.title,
          value: candidate.title.trim(),
          current: book.title,
        },
        {
          field: "authors",
          label: t.authors,
          value: authorNames(candidate).join("\n"),
          current: book.authors.join("\n"),
        },
        {
          field: "isbn",
          label: "ISBN",
          value: book.isbn ? "" : candidate.isbn,
          current: book.isbn,
        },
      ].filter((row) => row.value && row.value !== row.current)
    : [];
  return (
    <section className="mt-6 max-w-lg" aria-label={t.sourceDetails}>
      <h2 className="font-medium">{t.sourceDetails}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {formats.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            {t.bookFormat}
            <select
              value={file}
              disabled={busy}
              className={SELECT}
              onChange={(e) => {
                setFile(e.target.value);
                setCandidate(null);
                setSelected(false);
                setFailed(false);
              }}
            >
              {formats.map((f) => (
                <option key={f.file} value={f.file}>
                  {f.format.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={inspect}
        >
          {t.readSource}
          {formats.length === 1 && ` · ${source.format.toUpperCase()}`}
        </button>
      </div>
      {(busy ||
        failed ||
        (candidate && !values.length && !candidate.cover)) && (
        <p role="status" className="mt-3 text-sm text-secondary">
          {busy ? t.analyzing : failed ? t.sourceUnavailable : t.noNewDetails}
        </p>
      )}
      {candidate && (values.length > 0 || candidate.cover) && (
        <form
          action="/admin/details"
          method="post"
          encType="multipart/form-data"
          className="mt-4 grid gap-3"
          onChange={(e) =>
            setSelected(!!e.currentTarget.querySelector("input:checked"))
          }
          onSubmit={(e) => {
            const cover = candidate.cover;
            if (cover)
              e.currentTarget.addEventListener(
                "formdata",
                (event) => {
                  const data = (event as FormDataEvent).formData;
                  if (data.has("cover")) data.set("cover", cover, "cover.png");
                },
                { once: true },
              );
          }}
        >
          {children}
          <p className="text-sm text-secondary">{t.reviewSource}</p>
          {values.map((row) => (
            <label key={row.field} className="flex min-w-0 items-start gap-2">
              <input
                type="checkbox"
                name={row.field}
                value={row.value}
                className="mt-1"
              />
              <span className="min-w-0 break-words">
                <span className="block text-sm font-medium">{row.label}</span>
                <span className="block whitespace-pre-line">{row.value}</span>
                <span className="block whitespace-pre-line text-sm text-secondary">
                  {t.currentValue} · {row.current || t.notListed}
                </span>
              </span>
            </label>
          ))}
          {candidate.cover && (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="cover" className="mt-1" />
              <span className="text-sm font-medium">
                {t.coverImage}
                {image && (
                  // biome-ignore lint/performance/noImgElement: object URL of a local thumbnail
                  <img
                    src={image}
                    alt={t.coverPreview}
                    className="mt-1 max-h-32 max-w-full rounded object-contain"
                  />
                )}
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={!selected}
            className={`${BUTTON_PRIMARY} w-fit disabled:opacity-50`}
          >
            {t.applyDetails}
          </button>
        </form>
      )}
    </section>
  );
}
