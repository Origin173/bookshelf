"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { adminHref, type CatalogView } from "@/app/admin/catalog-link";
import type { uploadEditions } from "@/app/admin/upload-editions";
import { BUTTON_PRIMARY, INPUT } from "@/app/ui";
import type { messages } from "@/lib/i18n";
import { editionKey } from "@/lib/isbn";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

type UploadError =
  | "invalid"
  | "invalidIsbn"
  | "invalidCover"
  | "invalidFile"
  | "invalidDetails"
  | "tooLarge"
  | "uploadConflict"
  | "unavailable"
  | "formatExists"
  | "missing"
  | "duplicate";

type Labels = Pick<
  Awaited<ReturnType<typeof messages>>,
  | UploadError
  | "addFormat"
  | "addFormatHelp"
  | "subjects"
  | "subjectHelp"
  | "uploading"
  | "uploadUnconfirmed"
  | "uploadDenied"
  | "editBook"
  | "title"
  | "author"
  | "file"
  | "publishLarger"
  | "matchingEditions"
  | "publisher"
  | "authors"
  | "bookFormat"
  | "notListed"
  | "uploadHelp"
  | "import"
  | "isbn"
  | "analyzing"
  | "reviewDetails"
  | "noDetails"
  | "coverOnly"
  | "noPreview"
  | "useCover"
  | "coverPreview"
>;
type Fields = { title: string; author: string; isbn: string };
const empty = { title: "", author: "", isbn: "" };

export function UploadForm({
  t,
  append,
  editions,
  view,
}: {
  t: Labels;
  editions?: ReturnType<typeof uploadEditions>;
  view: CatalogView;
  append?: { book: string; format: "epub" | "pdf" };
}) {
  const [submitting, setSubmitting] = useState(false);
  const [issue, setIssue] = useState<{ message: string; book?: string } | null>(
    null,
  );
  const sequence = useRef(0);
  const manual = useRef(new Set<keyof Fields>());
  const [fields, setFields] = useState<Fields>(empty);
  const [format, setFormat] = useState<"pdf" | "epub">();
  const key = format && editions && editionKey(fields.isbn);
  const matches = key ? editions?.[key] : undefined;
  const [cover, setCover] = useState<Blob | null>(null);
  const [image, setImage] = useState("");
  const [useCover, setUseCover] = useState(true);
  const [notice, setNotice] = useState<
    | "analyzing"
    | "formatExists"
    | "tooLarge"
    | "invalidFile"
    | "reviewDetails"
    | "noDetails"
    | "coverOnly"
    | "noPreview"
    | null
  >(null);

  const fileBlocked =
    notice === "analyzing" ||
    notice === "formatExists" ||
    notice === "tooLarge" ||
    notice === "invalidFile";

  useEffect(() => {
    if (!cover) {
      setImage("");
      return;
    }
    const url = URL.createObjectURL(cover);
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || fileBlocked) return;
    const data = new FormData(event.currentTarget);
    if (cover && useCover) data.set("cover", cover, "cover.png");
    setSubmitting(true);
    setIssue(null);
    try {
      const response = await fetch(event.currentTarget.action, {
        method: "POST",
        headers: { accept: "application/json" },
        body: data,
      });
      if (!response.ok) {
        setIssue({
          message:
            response.status === 403 ? t.uploadDenied : t.uploadUnconfirmed,
        });
      } else {
        const outcome = (await response.json()) as
          | { result: "uploaded" | "formatAdded"; book: string }
          | { result: UploadError; book?: string };
        if (outcome.result === "uploaded" || outcome.result === "formatAdded") {
          window.location.assign(adminHref({ ...view, ...outcome }));
          return;
        }
        setIssue({ message: t[outcome.result], book: outcome.book });
      }
    } catch {
      setIssue({ message: t.uploadUnconfirmed });
    }
    setSubmitting(false);
  }

  function apply(candidate: Fields) {
    setFields((current) => ({
      title: manual.current.has("title") ? current.title : candidate.title,
      author: manual.current.has("author") ? current.author : candidate.author,
      isbn: manual.current.has("isbn") ? current.isbn : candidate.isbn,
    }));
  }

  async function select(file?: File) {
    const version = ++sequence.current;
    setIssue(null);
    apply(empty);
    setFormat(undefined);
    setCover(null);
    setUseCover(true);
    setNotice(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice("tooLarge");
      return;
    }
    if (!file.size || !/\.(epub|pdf)$/i.test(file.name)) {
      setNotice("invalidFile");
      return;
    }
    if (append) {
      if (!file.name.toLowerCase().endsWith(`.${append.format}`))
        setNotice("formatExists");
      return;
    }
    setFormat(file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "epub");
    setNotice("analyzing");
    try {
      const { inspectBook } = await import("@/app/admin/inspect-book");
      const candidate = await inspectBook(file);
      if (sequence.current !== version) return;
      apply({
        title: candidate.title,
        author: candidate.authors.join("; "),
        isbn: candidate.isbn,
      });
      setCover(candidate.cover);
      setNotice(
        candidate.title || candidate.authors.length || candidate.isbn
          ? "reviewDetails"
          : candidate.cover
            ? "coverOnly"
            : "noDetails",
      );
    } catch {
      if (sequence.current === version) setNotice("noPreview");
    }
  }

  return (
    <form
      id={append ? "add-format" : undefined}
      onSubmit={submit}
      aria-busy={submitting}
      action={adminHref({ ...view, book: append?.book }, "/admin/upload")}
      encType="multipart/form-data"
      method="post"
      className="mt-4 max-w-lg"
    >
      <fieldset disabled={submitting} className="grid min-w-0 gap-3">
        <label className="grid gap-1 text-sm">
          {t.file}
          <input
            type="file"
            name="file"
            accept={append ? `.${append.format}` : ".epub,.pdf"}
            required
            aria-describedby="upload-help"
            className={`${INPUT} min-w-0 max-w-full`}
            onChange={(event) => void select(event.target.files?.[0])}
          />
        </label>
        <p id="upload-help" className="text-sm text-secondary">
          {append ? (
            t.addFormatHelp
          ) : (
            <>
              {t.uploadHelp}{" "}
              <a
                href="https://github.com/Origin173/bookshelf/blob/main/docs/publishing.md#publish-your-books"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent hover:underline"
              >
                {t.publishLarger}
              </a>
            </>
          )}
        </p>
        {notice && (
          <p role="status" className="text-sm text-secondary">
            {t[notice]}
          </p>
        )}
        {!append && (
          <>
            {(["title", "author", "isbn"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-sm">
                {t[key]}
                <input
                  name={key}
                  required={key === "title"}
                  maxLength={key === "isbn" ? 24 : 200}
                  value={fields[key]}
                  className={INPUT}
                  onChange={(event) => {
                    manual.current.add(key);
                    const value = event.target.value;
                    setFields((current) => ({ ...current, [key]: value }));
                  }}
                />
              </label>
            ))}
            {matches && (
              <section
                aria-label={t.matchingEditions}
                className="min-w-0 rounded-xl bg-fill px-4 py-3 text-sm"
              >
                <h2 className="font-medium">{t.matchingEditions}</h2>
                <ul className="mt-2 divide-y divide-separator">
                  {matches.map((book) => (
                    <li key={book.id} className="break-words py-2">
                      <p className="font-medium">{book.title}</p>
                      <p>
                        {t.authors} · {book.authors.join(", ") || t.notListed}
                      </p>
                      <p>
                        {t.publisher} · {book.publisher || t.notListed}
                      </p>
                      <p>
                        {t.bookFormat} · {book.formats.join(", ")}
                      </p>
                      {format && book.missingFormat === format && (
                        <a
                          href={`${adminHref({ ...view, book: book.id })}#add-format`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-accent hover:underline"
                        >
                          {t.addFormat} · {format.toUpperCase()}
                          <span className="sr-only"> · {book.title}</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <label className="grid gap-1 text-sm">
              {t.subjects}
              <textarea
                name="subjects"
                rows={2}
                aria-describedby="upload-subject-help"
                className={INPUT}
              />
            </label>
            <p id="upload-subject-help" className="text-sm text-secondary">
              {t.subjectHelp}
            </p>
            {cover && image && (
              <div className="flex items-center gap-3">
                {/* biome-ignore lint/performance/noImgElement: this is a local blob preview */}
                <img
                  src={image}
                  alt={t.coverPreview}
                  className="h-20 w-14 rounded object-contain ring-1 ring-separator"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCover}
                    onChange={(event) => setUseCover(event.target.checked)}
                  />
                  {t.useCover}
                </label>
              </div>
            )}
          </>
        )}
        <button
          className={`${BUTTON_PRIMARY} w-fit`}
          type="submit"
          disabled={fileBlocked}
        >
          {submitting
            ? t.uploading
            : append
              ? `${t.addFormat} · ${append.format.toUpperCase()}`
              : t.import}
        </button>
      </fieldset>
      {issue && (
        <p role="alert" className="mt-3 rounded-xl bg-fill px-4 py-3 text-sm">
          {issue.message}{" "}
          {issue.book && issue.book !== append?.book && (
            <a
              href={adminHref({ ...view, book: issue.book })}
              className="font-medium text-accent"
            >
              {t.editBook}
            </a>
          )}
        </p>
      )}
    </form>
  );
}
