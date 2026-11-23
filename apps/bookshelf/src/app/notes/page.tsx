import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/app/language-switch";
import { BUTTON, BUTTON_QUIET } from "@/app/ui";
import { bookmarkLabel } from "@/lib/bookmarks";
import { encodeKey } from "@/lib/http";
import { language, messages } from "@/lib/i18n";
import { readerText } from "@/lib/reader-text";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile } from "@/services/auth";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import { readingNotes } from "@/services/reading-notes";

export default async function Notes(props: PageProps<"/notes">) {
  const account = await requirePageAccount();
  if (!account) notFound();
  const { cursor } = await props.searchParams;
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.length > 4096)
  )
    notFound();
  const { storage, catalog } = await getServices();
  const t = await messages();
  const labels = readerText[await language()];
  const page = await ifAvailable(async () =>
    readingNotes(
      storage,
      accountProfile(account).id,
      (await catalog.browse()).books,
      cursor,
    ),
  );
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className={BUTTON_QUIET}>
          <ChevronLeft aria-hidden="true" className="inline size-4" />{" "}
          {t.backToShelf}
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t.myNotes}
      </h1>
      {!page?.groups.length ? (
        <p role="status" className="mt-6 text-secondary">
          {!page
            ? t.unavailable
            : cursor || page.cursor
              ? t.noNotesHere
              : t.noNotes}
        </p>
      ) : (
        page.groups.map(({ book, notes }) => (
          <section key={book.id} className="mt-8">
            <h2 className="break-words text-xl font-semibold">{book.title}</h2>
            <ul className="mt-2 divide-y divide-separator">
              {notes.map(({ mark, format, fileKey, id }) => (
                <li key={id} className="py-3">
                  <Link
                    prefetch={false}
                    className="break-words font-medium text-accent hover:underline"
                    href={`/read/${encodeKey(fileKey)}?mark=${id}`}
                  >
                    {[
                      mark.name,
                      bookmarkLabel(mark, labels),
                      format.toUpperCase(),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Link>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                    {mark.note}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {(cursor || page?.cursor) && (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label={t.myNotes}>
          {cursor && (
            <Link className={BUTTON_QUIET} prefetch={false} href="/notes">
              {t.firstNotes}
            </Link>
          )}
          {page?.cursor && (
            <Link
              className={BUTTON}
              prefetch={false}
              href={`/notes?${new URLSearchParams({ cursor: page.cursor })}`}
            >
              {t.nextNotes}
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
