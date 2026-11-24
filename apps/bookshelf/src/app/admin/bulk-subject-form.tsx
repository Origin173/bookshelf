"use client";

import { useEffect, useRef, useState } from "react";
import { adminHref, type CatalogView } from "@/app/admin/catalog-link";
import { FilterInput } from "@/app/filter-input";
import { BUTTON, BUTTON_PRIMARY, BUTTON_QUIET, SELECT } from "@/app/ui";
import { searchBookText } from "@/lib/book-search";
import { subjectAddition } from "@/lib/catalog-names";
import type { messages } from "@/lib/i18n";

type Labels = Pick<
  Awaited<ReturnType<typeof messages>>,
  | "searchCatalog"
  | "clearSearch"
  | "noMatches"
  | "matchingBooks"
  | "selectMatches"
  | "deselectMatches"
  | "selectedBooks"
  | "chooseSubject"
  | "noBulkSubjects"
  | "previewSubject"
  | "subjectToAdd"
  | "subjectPresent"
  | "subjectLimit"
  | "changeSelection"
  | "applySubject"
  | "cancel"
  | "bulkConflict"
  | "bulkInvalid"
  | "bulkTooLarge"
  | "bulkRetry"
  | "uploadDenied"
>;
type Row = { id: string; title: string; authors: string[]; subjects: string[] };

export function BulkSubjectForm({
  books,
  subjects,
  revision,
  view,
  t,
}: {
  books: Row[];
  subjects: string[];
  revision: string;
  view: CatalogView;
  t: Labels;
}) {
  const [subject, setSubject] = useState("");
  const [query, setQuery] = useState("");
  const [ids, setIds] = useState(new Set<string>());
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) heading.current?.focus();
  }, [preview]);
  const [issue, setIssue] = useState<keyof Labels | null>(null);
  if (!subjects.length)
    return <p className="mt-8 text-secondary">{t.noBulkSubjects}</p>;
  const rows = preview
    ? books.filter((book) => ids.has(book.id))
    : searchBookText(books, query);
  const additions = preview
    ? rows.map((book) => subjectAddition(book.subjects, subject))
    : [];
  function setBooksChecked(books: Row[], checked: boolean) {
    setIds((current) => {
      const next = new Set(current);
      for (const { id } of books) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  async function save() {
    setSaving(true);
    setIssue(null);
    try {
      const body = new URLSearchParams({ subject, revision });
      for (const id of ids) body.append("book", id);
      const r = await fetch("/admin/subjects/add", {
        method: "POST",
        body,
        redirect: "error",
      });
      if (r.status === 204) {
        window.location.assign(adminHref({ ...view, result: "bulkSaved" }));
        return;
      }
      const errors: Record<number, keyof Labels> = {
        403: "uploadDenied",
        409: "bulkConflict",
        413: "bulkTooLarge",
        422: "bulkInvalid",
      };
      setIssue(errors[r.status] ?? "bulkRetry");
    } catch {
      setIssue("bulkRetry");
    }
    setSaving(false);
  }
  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        if (preview) void save();
        else setPreview(true);
      }}
    >
      {preview ? (
        <h2
          ref={heading}
          tabIndex={-1}
          className="break-words text-lg font-medium"
        >
          {subject}
        </h2>
      ) : (
        <label className="grid max-w-lg gap-2 text-sm font-medium">
          {t.chooseSubject}
          <select
            className={SELECT}
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="" disabled>
              —
            </option>
            {subjects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!preview && (
        <FilterInput
          value={query}
          onChange={setQuery}
          label={t.searchCatalog}
          clear={t.clearSearch}
        />
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
        {!preview && (
          <span aria-live="polite">
            {t.matchingBooks} · {rows.length}
          </span>
        )}
        <p aria-live="polite">
          {t.selectedBooks} · {ids.size}
        </p>
      </div>
      {!preview && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${BUTTON} disabled:opacity-50`}
            disabled={rows.every((book) => ids.has(book.id))}
            onClick={() => setBooksChecked(rows, true)}
          >
            {t.selectMatches}
          </button>
          <button
            type="button"
            className={`${BUTTON} disabled:opacity-50`}
            disabled={!rows.some((book) => ids.has(book.id))}
            onClick={() => setBooksChecked(rows, false)}
          >
            {t.deselectMatches}
          </button>
        </div>
      )}
      {!rows.length && <p className="my-4 text-secondary">{t.noMatches}</p>}
      <ul className="my-4 divide-y divide-separator">
        {rows.map((book, i) => {
          const info = (
            <span className="block min-w-0 break-words">
              <span className="block font-medium">{book.title}</span>
              {book.authors.length > 0 && (
                <span className="block text-sm text-secondary">
                  {book.authors.join(", ")}
                </span>
              )}
              {book.subjects.length > 0 && (
                <span className="block text-sm text-secondary">
                  {book.subjects.join(" · ")}
                </span>
              )}
            </span>
          );
          return (
            <li key={book.id} className="py-3">
              {preview ? (
                <>
                  {info}
                  <span className="text-sm font-medium">{t[additions[i]]}</span>
                </>
              ) : (
                <label className="flex items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    value={book.id}
                    checked={ids.has(book.id)}
                    onChange={(event) =>
                      setBooksChecked([book], event.target.checked)
                    }
                  />
                  {info}
                </label>
              )}
            </li>
          );
        })}
      </ul>
      {issue && (
        <p role="alert" className="mb-3 rounded-xl bg-fill px-4 py-3 text-sm">
          {t[issue]}{" "}
          {issue === "bulkConflict" && (
            <a
              className="font-medium text-accent"
              href={adminHref({ ...view, bulk: "subjects" })}
            >
              {t.changeSelection}
            </a>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className={`${BUTTON_PRIMARY} disabled:opacity-50`}
          disabled={
            !subject ||
            !ids.size ||
            saving ||
            (preview &&
              (!additions.includes("subjectToAdd") ||
                additions.includes("subjectLimit") ||
                issue === "bulkConflict"))
          }
        >
          {preview ? t.applySubject : t.previewSubject}
        </button>
        {preview && issue !== "bulkConflict" && (
          <button
            type="button"
            disabled={saving}
            className={BUTTON}
            onClick={() => {
              setPreview(false);
              setIssue(null);
            }}
          >
            {t.changeSelection}
          </button>
        )}
        {!saving && (
          <a href={adminHref(view)} className={BUTTON_QUIET}>
            {t.cancel}
          </a>
        )}
      </div>
    </form>
  );
}
