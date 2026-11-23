import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBookList } from "@/app/admin/book-list";
import { BulkSubjectForm } from "@/app/admin/bulk-subject-form";
import { adminHref, catalogView } from "@/app/admin/catalog-link";
import { CoverForm } from "@/app/admin/cover-form";
import { IsbnInput } from "@/app/admin/isbn-input";
import { SourceDetails } from "@/app/admin/source-details";
import {
  missingUploadFormat,
  uploadEditions,
} from "@/app/admin/upload-editions";
import { UploadForm } from "@/app/admin/upload-form";
import { LanguageSwitch } from "@/app/language-switch";
import { BUTTON, BUTTON_PRIMARY, BUTTON_QUIET, INPUT } from "@/app/ui";
import { parseSubjects } from "@/lib/catalog-names";
import { messages } from "@/lib/i18n";
import { bySubject } from "@/lib/opds/browse";
import { requirePageAccount } from "@/services/account-page";
import { isAdmin } from "@/services/auth";
import {
  applyEdits,
  bookIdentity,
  catalogEdits,
  subjectRevision,
} from "@/services/catalog-edits";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";

export async function generateMetadata() {
  return {
    title: (await messages()).manage,
    robots: { index: false, follow: false },
  };
}

export default async function AdminPage(props: PageProps<"/admin">) {
  if (!isAdmin(await requirePageAccount())) notFound();
  const { storage, catalog } = await getServices();
  if (!storage.writeIfMatch) notFound();
  const params = await props.searchParams;
  const { book: id, result, bulk } = params;
  const bulkSubjects = !id && bulk === "subjects";
  const view = catalogView(params);
  const listHref = adminHref(view);
  const t = await messages();
  const data = await ifAvailable(async () => {
    const [published, snapshot] = await Promise.all([
      catalog.editable(),
      catalogEdits(storage),
    ]);
    return {
      ...applyEdits(published, snapshot),
      batchRevision: bulkSubjects
        ? subjectRevision(published, snapshot.etag)
        : undefined,
      source: published.books.find((b) => b.id === id),
    };
  });
  const book = data?.books.find((b) => b.id === id);
  const missingFormat = book && missingUploadFormat(book);
  const append =
    book && missingFormat
      ? ({ book: book.id, format: missingFormat } as const)
      : undefined;
  const notice =
    result === "bulkSaved" ||
    result === "formatAdded" ||
    result === "formatExists" ||
    result === "missing" ||
    result === "invalidIsbn" ||
    result === "invalidBookIsbn" ||
    result === "isbnSaved" ||
    result === "invalidCover" ||
    result === "invalidLocalCover" ||
    result === "coverSaved" ||
    result === "invalidTitle" ||
    result === "titleSaved" ||
    result === "dateSaved" ||
    result === "invalidDate" ||
    result === "authorsSaved" ||
    result === "invalidAuthors" ||
    result === "selectDetails" ||
    result === "detailsSaved" ||
    result === "uploaded" ||
    result === "duplicate" ||
    result === "invalidFile" ||
    result === "invalidDetails" ||
    result === "tooLarge" ||
    result === "uploadConflict" ||
    result === "saved" ||
    result === "invalid" ||
    result === "conflict" ||
    result === "unavailable"
      ? t[result]
      : undefined;
  const revisionFields = data?.source && (
    <>
      <input type="hidden" name="id" value={data.source.id} />
      <input type="hidden" name="identity" value={bookIdentity(data.source)} />
      <input type="hidden" name="revision" value={data.revision ?? ""} />
      {view.missing && (
        <input
          type="hidden"
          name={
            { cover: "from", date: "date", isbn: "missingIsbn" }[view.missing]
          }
          value="missing"
        />
      )}
      {view.q && <input type="hidden" name="q" value={view.q} />}
      <input type="hidden" name="generation" value={data.generatedAt ?? ""} />
    </>
  );
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={id || bulkSubjects ? listHref : "/"}
          className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {id || bulkSubjects ? t.manage : t.shelf}
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="mt-6 break-words text-3xl font-semibold tracking-tight">
        {bulkSubjects ? t.bulkSubject : book ? book.title : t.manage}
      </h1>
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-fill px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {!bulkSubjects && (!id || append) && (
        <details
          open={
            result === "tooLarge" ||
            result === "invalidIsbn" ||
            result === "invalidCover" ||
            result === "invalid" ||
            result === "invalidFile" ||
            result === "invalidDetails" ||
            result === "uploadConflict"
          }
          className="mt-6"
        >
          <summary className="w-fit cursor-pointer text-sm font-medium text-accent">
            {append
              ? `${t.addFormat} · ${append.format.toUpperCase()}`
              : t.upload}
          </summary>
          <UploadForm
            append={append}
            editions={!id && data ? uploadEditions(data.books) : undefined}
            view={view}
            t={{
              addFormat: t.addFormat,
              addFormatHelp: t.addFormatHelp,
              formatExists: t.formatExists,
              missing: t.missing,
              title: t.title,
              author: t.author,
              file: t.file,
              uploadHelp: t.uploadHelp,
              matchingEditions: t.matchingEditions,
              authors: t.authors,
              publisher: t.publisher,
              bookFormat: t.bookFormat,
              notListed: t.notListed,
              publishLarger: t.publishLarger,
              import: t.import,
              uploading: t.uploading,
              uploadUnconfirmed: t.uploadUnconfirmed,
              uploadDenied: t.uploadDenied,
              editBook: t.editBook,
              subjects: t.subjects,
              subjectHelp: t.subjectHelp,
              invalid: t.invalid,
              invalidIsbn: t.invalidIsbn,
              invalidCover: t.invalidCover,
              invalidFile: t.invalidFile,
              invalidDetails: t.invalidDetails,
              tooLarge: t.tooLarge,
              uploadConflict: t.uploadConflict,
              unavailable: t.unavailable,
              duplicate: t.duplicate,
              isbn: t.isbn,
              analyzing: t.analyzing,
              reviewDetails: t.reviewDetails,
              noDetails: t.noDetails,
              coverOnly: t.coverOnly,
              noPreview: t.noPreview,
              useCover: t.useCover,
              coverPreview: t.coverPreview,
            }}
          />
        </details>
      )}
      {!data ? (
        <p className="mt-8 text-secondary">
          {t.unavailable}{" "}
          <a
            className={BUTTON_QUIET}
            href={
              bulkSubjects
                ? "/admin?bulk=subjects"
                : id
                  ? adminHref({ ...view, book: String(id) })
                  : listHref
            }
          >
            {t.retry}
          </a>
        </p>
      ) : data.batchRevision ? (
        <BulkSubjectForm
          key={data.batchRevision}
          revision={data.batchRevision}
          books={data.books.map(({ id, title, authors, subjects }) => ({
            id,
            title,
            authors,
            subjects: subjects ?? [],
          }))}
          subjects={bySubject(data.books)
            .map((group) => group.name)
            .filter((name) => parseSubjects(name)?.[0] === name)}
          t={{
            searchCatalog: t.searchCatalog,
            clearSearch: t.clearSearch,
            noMatches: t.noMatches,
            matchingBooks: t.matchingBooks,
            selectMatches: t.selectMatches,
            deselectMatches: t.deselectMatches,
            selectedBooks: t.selectedBooks,
            chooseSubject: t.chooseSubject,
            noBulkSubjects: t.noBulkSubjects,
            previewSubject: t.previewSubject,
            subjectToAdd: t.subjectToAdd,
            subjectPresent: t.subjectPresent,
            subjectLimit: t.subjectLimit,
            changeSelection: t.changeSelection,
            applySubject: t.applySubject,
            cancel: t.cancel,
            bulkConflict: t.bulkConflict,
            bulkInvalid: t.bulkInvalid,
            bulkTooLarge: t.bulkTooLarge,
            bulkRetry: t.bulkRetry,
            uploadDenied: t.uploadDenied,
          }}
        />
      ) : book ? (
        <>
          <SourceDetails
            key={JSON.stringify([book.id, data.revision, data.generatedAt])}
            book={{
              id: book.id,
              formats: book.formats,
              title: book.title,
              authors: book.authors,
              isbn: book.isbn,
              cover: book.cover,
            }}
            t={{
              sourceDetails: t.sourceDetails,
              readSource: t.readSource,
              bookFormat: t.bookFormat,
              analyzing: t.analyzing,
              sourceUnavailable: t.sourceUnavailable,
              noNewDetails: t.noNewDetails,
              reviewSource: t.reviewSource,
              currentValue: t.currentValue,
              notListed: t.notListed,
              title: t.title,
              authors: t.authors,
              coverImage: t.coverImage,
              coverPreview: t.coverPreview,
              applyDetails: t.applyDetails,
            }}
          >
            {revisionFields}
          </SourceDetails>
          {!book.cover && (
            <CoverForm
              t={{
                addCover: t.addCover,
                coverImage: t.coverImage,
                coverHelp: t.coverHelp,
                invalidLocalCover: t.invalidLocalCover,
                coverPreview: t.coverPreview,
              }}
            >
              {revisionFields}
            </CoverForm>
          )}
          <form
            action="/admin/title"
            method="post"
            className="mt-6 grid max-w-lg gap-3"
          >
            {revisionFields}
            <label htmlFor="book-title" className="font-medium">
              {t.title}
            </label>
            <input
              key={book.title}
              id="book-title"
              name="title"
              required
              maxLength={200}
              defaultValue={book.title}
              className={INPUT}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BUTTON_PRIMARY}>
                {t.saveTitle}
              </button>
              <button
                type="submit"
                name="intent"
                value="reset"
                formNoValidate
                className={BUTTON}
              >
                {t.resetTitle}
              </button>
            </div>
          </form>
          <form
            action="/admin/authors"
            method="post"
            className="mt-6 grid max-w-lg gap-3"
          >
            {revisionFields}
            <label htmlFor="book-authors" className="font-medium">
              {t.authors}
            </label>
            <textarea
              id="book-authors"
              name="authors"
              aria-describedby="author-help"
              rows={3}
              defaultValue={book.authors.join("\n")}
              className={INPUT}
            />
            <p id="author-help" className="text-sm text-secondary">
              {t.authorHelp}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BUTTON_PRIMARY}>
                {t.saveAuthors}
              </button>
              <button
                type="submit"
                name="intent"
                value="reset"
                className={BUTTON}
              >
                {t.resetAuthors}
              </button>
            </div>
          </form>
          {book.isbn ? (
            <p className="mt-6 text-sm">ISBN · {book.isbn}</p>
          ) : (
            <form
              action="/admin/isbn"
              method="post"
              className="mt-6 grid max-w-lg gap-3"
            >
              {revisionFields}
              <label htmlFor="book-isbn" className="font-medium">
                ISBN
              </label>
              <IsbnInput invalid={t.invalidBookIsbn} />
              <p id="isbn-help" className="text-sm text-secondary">
                {t.isbnHelp}
              </p>
              <button type="submit" className={`${BUTTON_PRIMARY} w-fit`}>
                {t.addIsbn}
              </button>
            </form>
          )}
          <form
            action="/admin/date"
            method="post"
            className="mt-6 grid max-w-lg gap-3"
          >
            {revisionFields}
            <input
              type="hidden"
              name="sourceDate"
              value={data.source?.published ?? ""}
            />
            <label htmlFor="book-date" className="font-medium">
              {t.catalogDate}
            </label>
            <input
              id="book-date"
              name="published"
              aria-describedby="date-help"
              defaultValue={book.published ?? ""}
              className={INPUT}
            />
            <p id="date-help" className="text-sm text-secondary">
              {t.editDateHelp}
            </p>
            <p className="break-words text-sm text-secondary">
              {t.originalDate} · {data.source?.published || t.notListed}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BUTTON_PRIMARY}>
                {t.saveDate}
              </button>
              <button
                type="submit"
                name="intent"
                value="reset"
                formNoValidate
                className={BUTTON}
              >
                {t.resetDate}
              </button>
            </div>
          </form>
          <form
            action="/admin/subjects"
            method="post"
            className="mt-6 grid max-w-lg gap-3"
          >
            {revisionFields}
            <label htmlFor="subjects" className="font-medium">
              {t.subjects}
            </label>
            <textarea
              id="subjects"
              name="subjects"
              aria-describedby="subject-help"
              rows={5}
              defaultValue={book.subjects?.join("\n")}
              className={INPUT}
            />
            <p id="subject-help" className="text-sm text-secondary">
              {t.subjectHelp}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BUTTON_PRIMARY}>
                {t.save}
              </button>
              <button
                type="submit"
                name="intent"
                value="reset"
                className={BUTTON}
              >
                {t.reset}
              </button>
            </div>
          </form>
        </>
      ) : id || !data.books.length ? (
        <p className="mt-8 text-secondary">{id ? t.missing : t.empty}</p>
      ) : (
        <AdminBookList
          key={JSON.stringify([view.missing, view.q])}
          view={view}
          books={data.books
            .filter((book) => {
              if (view.missing === "isbn") return !book.isbn;
              if (view.missing === "date") return !book.published?.trim();
              return view.missing !== "cover" || !book.cover;
            })
            .map(({ id, title, authors }) => ({ id, title, authors }))}
          t={{
            manage: t.manage,
            allBooks: t.allBooks,
            missingCovers: t.missingCovers,
            noMissingCovers: t.noMissingCovers,
            missingDates: t.missingDates,
            noMissingDates: t.noMissingDates,
            missingIsbns: t.missingIsbns,
            noMissingIsbns: t.noMissingIsbns,
            bulkSubject: t.bulkSubject,
            searchCatalog: t.searchCatalog,
            clearSearch: t.clearSearch,
            noMatches: t.noMatches,
            editBook: t.editBook,
          }}
        />
      )}
    </main>
  );
}
