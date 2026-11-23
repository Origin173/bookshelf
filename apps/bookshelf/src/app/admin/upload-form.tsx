"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Candidate } from "@/app/admin/inspect-book";
import { BUTTON_PRIMARY, INPUT } from "@/app/ui";
import type { messages } from "@/lib/i18n";
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
  | "duplicate";

type Labels = Pick<
  Awaited<ReturnType<typeof messages>>,
  | UploadError
  | "subjects"
  | "subjectHelp"
  | "uploading"
  | "uploadUnconfirmed"
  | "uploadDenied"
  | "editBook"
  | "title"
  | "author"
  | "file"
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
type Fields = Pick<Candidate, "title" | "author" | "isbn">;
const empty = { title: "", author: "", isbn: "" };

export function UploadForm({ t }: { t: Labels }) {
  const [submitting, setSubmitting] = useState(false);
  const [issue, setIssue] = useState<{ message: string; book?: string } | null>(
    null,
  );
  const sequence = useRef(0);
  const manual = useRef(new Set<keyof Fields>());
  const [fields, setFields] = useState<Fields>(empty);
  const [cover, setCover] = useState<Blob | null>(null);
  const [image, setImage] = useState("");
  const [useCover, setUseCover] = useState(true);
  const [notice, setNotice] = useState<
    | "analyzing"
    | "reviewDetails"
    | "noDetails"
    | "coverOnly"
    | "noPreview"
    | null
  >(null);

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
    if (submitting || notice === "analyzing") return;
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
          | { result: "uploaded"; book: string }
          | { result: UploadError; book?: string };
        if (outcome.result === "uploaded") {
          window.location.assign(`/admin?${new URLSearchParams(outcome)}`);
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
    setCover(null);
    setUseCover(true);
    setNotice(null);
    if (
      !file ||
      file.size > MAX_UPLOAD_BYTES ||
      !/\.(epub|pdf)$/i.test(file.name)
    )
      return;
    setNotice("analyzing");
    try {
      const { inspectBook } = await import("@/app/admin/inspect-book");
      const candidate = await inspectBook(file);
      if (sequence.current !== version) return;
      apply(candidate);
      setCover(candidate.cover);
      setNotice(
        candidate.title || candidate.author || candidate.isbn
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
      onSubmit={submit}
      aria-busy={submitting}
      action="/admin/upload"
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
            accept=".epub,.pdf"
            required
            aria-describedby="upload-help"
            className={`${INPUT} min-w-0 max-w-full`}
            onChange={(event) => void select(event.target.files?.[0])}
          />
        </label>
        <p id="upload-help" className="text-sm text-secondary">
          {t.uploadHelp}
        </p>
        {notice && (
          <p role="status" className="text-sm text-secondary">
            {t[notice]}
          </p>
        )}
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
        <button
          className={`${BUTTON_PRIMARY} w-fit`}
          type="submit"
          disabled={notice === "analyzing"}
        >
          {submitting ? t.uploading : t.import}
        </button>
      </fieldset>
      {issue && (
        <p role="alert" className="mt-3 rounded-xl bg-fill px-4 py-3 text-sm">
          {issue.message}{" "}
          {issue.book && (
            <a
              href={`/admin?book=${encodeURIComponent(issue.book)}`}
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
