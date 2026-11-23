import { DEFAULT_PROFILE_ID, parseBookKey } from "@bookshelf/core";
import { ArrowDownToLine, ChevronLeft, CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readerBookmarks } from "@/app/read/[...key]/bookmark-action";
import { EpubReader } from "@/app/read/[...key]/epub-reader";
import { PdfReader } from "@/app/read/[...key]/pdf-reader";
import { ReadingFormats } from "@/app/reading-formats";
import { State, StatePage } from "@/app/state";
import { BUTTON_PRIMARY } from "@/app/ui";
import { encodeKey } from "@/lib/http";
import { language, messages } from "@/lib/i18n";
import { extension } from "@/lib/media";
import { type ReaderLocale, readerText } from "@/lib/reader-text";
import { OG_BASE } from "@/lib/site";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile, publicDemo } from "@/services/auth";
import { bookKey } from "@/services/catalog";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import { noteId } from "@/services/reading-notes";
import { activeProfile } from "@/services/session";

/**
 * What a shared book link says about itself.
 *
 * The cover stands in for the OG image, so passing a book to someone shows the
 * book rather than the shelf it came from. It is a portrait image and a large
 * summary card would letterbox it, hence the smaller card here.
 *
 * Reading positions live behind this URL and a library is not a publication, so
 * the page asks not to be indexed. It stays crawlable rather than disallowed in
 * robots.txt, which is what lets a preview be built at all.
 */
export async function generateMetadata(
  props: PageProps<"/read/[...key]">,
): Promise<Metadata> {
  const { key } = await props.params;
  const fileKey = key.join("/");
  await requirePageAccount(fileKey);
  const target = parseBookKey(fileKey);

  // The catalog is memoised per request, so the page's own lookup is free.
  const { catalog } = await getServices();
  const book = target ? await catalog.display(target.id) : null;
  if (!book?.formats.some((f) => f.file === target?.file)) {
    return {
      title: (await messages()).notFound,
      robots: { index: false, follow: false },
    };
  }

  const authors = book.authors.join(", ");
  const cover = book.cover
    ? {
        url: `/cover/${encodeKey(bookKey(book.id, book.cover))}`,
        alt: book.title,
      }
    : undefined;

  return {
    title: book.title,
    description: authors ? `${book.title} by ${authors}` : book.title,
    robots: { index: false, follow: false },
    openGraph: {
      ...OG_BASE,
      type: "book",
      authors: book.authors,
      title: book.title,
      description: authors,
      url: `/read/${encodeKey(fileKey)}`,
      ...(cover ? { images: [cover] } : {}),
    },
    twitter: {
      card: "summary",
      title: book.title,
      description: authors,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function ReadPage(props: PageProps<"/read/[...key]">) {
  const { key } = await props.params;
  const fileKey = key.join("/");
  const account = await requirePageAccount(fileKey);
  const target = parseBookKey(fileKey);
  if (!target) notFound();
  const { id, file } = target;

  const { catalog } = await getServices();

  // Undefined is a library that could not be read, which is not the same as a
  // book that is not in it — one is worth coming back for and the other is not.
  const book = await ifAvailable(() => catalog.display(id));
  const locale = await language();
  const t = readerText[locale];
  if (book === undefined) return <Unreachable />;
  const format = book?.formats.find((f) => f.file === file);
  if (!book || !format) notFound();

  const { mark } = await props.searchParams;
  let start: number | string | undefined;
  if (mark !== undefined) {
    if (!account || typeof mark !== "string" || !/^[a-f0-9]{32}$/.test(mark))
      notFound();
    const profileId = accountProfile(account).id;
    const result = await readerBookmarks(profileId, fileKey);
    if ("error" in result) return <Unreachable />;
    start = result.items.find(
      (item) => item.note && noteId(profileId, fileKey, item.position) === mark,
    )?.position;
    if (start === undefined) notFound();
  }

  return (
    // Exactly the viewport, and no taller: a reader scrolls inside itself, and
    // a document that also scrolls would move the chrome off the screen. `dvh`
    // rather than `vh` so that a phone's collapsing address bar is accounted
    // for instead of hiding the bottom of the toolbar behind it.
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-separator px-3 py-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-secondary transition-colors hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t.shelf}
        </Link>
        <h1 className="min-w-0 truncate text-sm font-medium">{book.title}</h1>
        <ReadingFormats book={book} current={format} read={t.readFormat} />
        <a
          href={`/download/${encodeKey(fileKey)}`}
          download
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-secondary transition-colors hover:text-foreground"
        >
          <ArrowDownToLine aria-hidden="true" className="size-4" />
          {t.download}
        </a>
      </header>

      {extension(fileKey) === "epub" ? (
        <EpubBody
          start={typeof start === "string" ? start : undefined}
          fileKey={fileKey}
          bookId={book.id}
          locale={locale}
        />
      ) : extension(fileKey) === "pdf" ? (
        <PdfBody
          start={typeof start === "number" ? start : undefined}
          fileKey={fileKey}
          bookId={book.id}
          locale={locale}
        />
      ) : (
        // Anything else is handed to the browser's own viewer, which for a
        // format this app has no reader for is better than nothing. The inline
        // disposition is what stops it downloading instead of displaying.
        //
        // Sandboxed, so a type `/download` was wrong to inline still runs
        // nothing here. A PDF would not survive that, since Chrome will not
        // draw one in a sandboxed frame, but a `.pdf` never comes this way:
        // it has a reader of its own. What the browser cannot display arrives
        // as an attachment, which is what `allow-downloads` keeps working.
        <iframe
          src={`/download/${encodeKey(fileKey)}?inline=1`}
          title={book.title}
          sandbox="allow-downloads"
          className="flex-1 border-0"
        />
      )}
    </div>
  );
}

async function EpubBody({
  start,
  fileKey,
  bookId,
  locale,
}: {
  start?: string;
  locale: ReaderLocale;
  fileKey: string;
  bookId: string;
}) {
  const { content, progress } = await getServices();

  // A position nobody could read is no position, and the reader starts where its
  // own copy says. Who is reading matters more: without it there is no position
  // to write back to, so the reader is told not to try.
  const profile = await ifAvailable(() => activeProfile());

  const opened = await ifAvailable(async () => {
    const [opfPath, saved] = await Promise.all([
      // Resolving the package document also proves the archive is readable
      // before the reader is handed anything.
      content.packageDocument(fileKey),
      profile ? progress.get(profile.id, bookId) : null,
    ]);
    return { opfPath, saved };
  });
  if (!opened) return <Unreachable />;

  const { opfPath, saved } = opened;
  if (!opfPath) notFound();

  return (
    <EpubReader
      key={JSON.stringify([profile?.id, bookId, start])}
      start={start}
      opfUrl={`/book/${encodeKey(fileKey)}/${encodeKey(opfPath)}`}
      bookKey={fileKey}
      locale={locale}
      bookId={bookId}
      profileId={profile?.id ?? DEFAULT_PROFILE_ID}
      bookmarks={
        profile && !publicDemo()
          ? readerBookmarks.bind(null, profile.id, fileKey)
          : undefined
      }
      saved={saved}
      canSync={progress.writable && profile !== undefined}
    />
  );
}

/**
 * The PDF reader, and what the server can tell it before it starts.
 *
 * Less than the EPUB reader needs: a PDF is one file that the reader fetches
 * itself, in ranges, rather than an archive the app reads chapters out of. So
 * there is nothing to resolve here and nothing to prove reachable — a library
 * that has gone away is reported by `/download`, and the reader says so in the
 * place the page would have been.
 */
async function PdfBody({
  start,
  fileKey,
  bookId,
  locale,
}: {
  start?: number;
  locale: ReaderLocale;
  fileKey: string;
  bookId: string;
}) {
  const { progress } = await getServices();

  // Without a profile there is nobody to write a position for, so the reader is
  // told not to try. Reading one is the only thing here that can fail.
  const profile = await ifAvailable(() => activeProfile());
  const saved = profile ? await progress.get(profile.id, bookId) : null;

  return (
    <PdfReader
      key={JSON.stringify([profile?.id, bookId, start])}
      start={start}
      url={`/download/${encodeKey(fileKey)}`}
      locale={locale}
      bookId={bookId}
      profileId={profile?.id ?? DEFAULT_PROFILE_ID}
      bookmarks={
        profile && !publicDemo()
          ? readerBookmarks.bind(null, profile.id, fileKey)
          : undefined
      }
      saved={saved}
      canSync={progress.writable && profile !== undefined}
    />
  );
}

/** Shown in place of the reader when the book cannot be reached. */
async function Unreachable() {
  const t = readerText[await language()];
  return (
    <StatePage>
      <State
        icon={CloudOff}
        title={t.unavailable}
        actions={
          <Link href="/" className={BUTTON_PRIMARY}>
            {t.back}
          </Link>
        }
      >
        <p>{t.tryLater}</p>
      </State>
    </StatePage>
  );
}
