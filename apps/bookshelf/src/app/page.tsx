import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HomeScreenHelp } from "@/app/home-screen-help";
import { LanguageSwitch } from "@/app/language-switch";
import { PersonalEntry } from "@/app/personal-shelf/entry";
import { ProfileMenu } from "@/app/profile-menu";
import { SearchInput } from "@/app/search-input";
import { State } from "@/app/state";
import { BUTTON, BUTTON_PRIMARY, BUTTON_QUIET, SELECT } from "@/app/ui";
import { encodeKey } from "@/lib/http";
import { messages } from "@/lib/i18n";
import { placeholder, tint } from "@/lib/media";
import { bySubject, named } from "@/lib/opds/browse";
import { OPDS_ALTERNATE } from "@/lib/opds/feed";
import { requirePageAccount } from "@/services/account-page";
import { accountProfile, isAdmin } from "@/services/auth";
import {
  type Book,
  bookKey,
  readableFormat,
  searchBooks,
} from "@/services/catalog";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import {
  isReadingStatus,
  personalShelf,
  readingStatuses,
} from "@/services/personal-shelf";
import { activeProfile } from "@/services/session";

const COVER_CLASS = "h-15 w-10 shrink-0 rounded ring-1 ring-separator";

/**
 * Searching filters through `?q=`, and every one of those is the same shelf
 * seen through a slot. The canonical points at the whole thing so a search
 * someone happened to share is not indexed as a page of its own.
 *
 * The catalog link is repeated from the layout because this replaces its
 * `alternates` rather than adding to them — see {@link OPDS_ALTERNATE}.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/", types: OPDS_ALTERNATE },
};

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

function Cover({ book }: { book: Book }) {
  if (book.cover) {
    return (
      // biome-ignore lint/performance/noImgElement: bucket object served by the Worker, not a static asset
      <img
        src={`/cover/${encodeKey(bookKey(book.id, book.cover))}`}
        alt=""
        width={40}
        height={60}
        loading="lazy"
        decoding="async"
        className={`${COVER_CLASS} object-cover`}
      />
    );
  }

  const { initials, hue } = placeholder(book.title);

  return (
    <div
      aria-hidden="true"
      className={`${COVER_CLASS} flex items-center justify-center text-sm font-semibold text-white/90`}
      style={{
        backgroundImage: tint(hue),
      }}
    >
      {initials}
    </div>
  );
}

export default async function Home(props: PageProps<"/">) {
  const account = await requirePageAccount();
  const { q, subject, status, favorite, shelfNotice } =
    await props.searchParams;
  const selectedStatus = account && isReadingStatus(status) ? status : "";
  const favoritesOnly = !!account && favorite === "1";
  const selected = typeof subject === "string" ? subject : "";
  const t = await messages();
  const query = typeof q === "string" ? q : "";

  const params = new URLSearchParams();
  if (selected) params.set("subject", selected);
  if (selectedStatus) params.set("status", selectedStatus);
  if (favoritesOnly) params.set("favorite", "1");
  const filters = params.toString();
  if (query) params.set("q", query);
  const here = params.size ? `/?${params}` : "/";
  const { catalog, profiles, progress, storage } = await getServices();

  /*
   * Who is reading, and how far they got, are not worth a shelf for. Both come
   * out of the library, so both can be unreachable while the catalog is not —
   * and a shelf of books with no profile chip and no Continue buttons is a far
   * better answer than no shelf.
   */
  const profile = await ifAvailable(() => activeProfile());
  const [everyone, positions, personal] = await Promise.all([
    account ? undefined : ifAvailable(() => profiles.list()),
    profile ? ifAvailable(() => progress.all(profile.id)) : undefined,
    account
      ? ifAvailable(() => personalShelf(storage, accountProfile(account).id))
      : undefined,
  ]);

  // The catalog is the shelf, so this is the one read the page cannot do
  // without — but it still degrades to a state that can say what happened
  // rather than to the error boundary.
  const shelf = await ifAvailable(async () => {
    const { books } = await catalog.browse();
    const groups = bySubject(books);
    const filtered = selected ? (named(groups, selected)?.books ?? []) : books;
    return {
      matching: searchBooks(filtered, query).filter((book) => {
        const entry = personal?.books.get(book.id);
        return (
          (!selectedStatus || entry?.status === selectedStatus) &&
          (!favoritesOnly || entry?.favorite)
        );
      }),
      total: books.length,
      groups,
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Bookshelf</h1>
        <div className="flex flex-wrap items-center gap-1">
          <LanguageSwitch />
          {account && (
            <Link href="/lists" className={BUTTON}>
              {t.readingLists}
            </Link>
          )}
          {isAdmin(account) && storage.writeIfMatch && (
            <Link href="/admin" className={BUTTON}>
              {t.manage}
            </Link>
          )}
          {account && (
            <form
              action="/login/session"
              method="post"
              className="flex items-center gap-2"
            >
              <input type="hidden" name="intent" value="logout" />
              <span className="text-sm text-secondary">{account}</span>
              <button className={BUTTON_QUIET} type="submit">
                {t.signOut}
              </button>
            </form>
          )}

          {profile && everyone && (
            <ProfileMenu
              profiles={everyone}
              activeId={profile.id}
              writable={profiles.writable}
              from={here}
            />
          )}
        </div>
      </div>

      {!shelf ? (
        <div className="mt-20">
          <State
            icon={CloudOff}
            title={t.unavailable}
            actions={
              // A plain anchor rather than a Link: the point is a fresh request
              // rather than whatever the router already has.
              <a href={here} className={BUTTON_PRIMARY}>
                {t.retry}
              </a>
            }
          >
            <p>{t.shelfError}</p>
          </State>
        </div>
      ) : (
        <>
          <SearchInput
            key={filters}
            query={query}
            filters={filters}
            label={t.search}
            searching={t.searching}
          />
          {(personal || shelf.groups.length > 0 || selected) && (
            <form action="/" className="mt-3 flex flex-wrap items-center gap-2">
              {query && <input type="hidden" name="q" value={query} />}
              {(shelf.groups.length > 0 || selected) && (
                <>
                  <label htmlFor="subject" className="text-sm text-secondary">
                    {t.subjects}
                  </label>
                  <select
                    key={selected}
                    id="subject"
                    name="subject"
                    defaultValue={selected}
                    className={`${SELECT} min-w-0 max-w-full`}
                  >
                    <option value="">{t.allSubjects}</option>
                    {selected && !named(shelf.groups, selected) && (
                      <option>{selected}</option>
                    )}
                    {shelf.groups.map((g) => (
                      <option key={g.name} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {personal && (
                <>
                  <label htmlFor="status" className="text-sm text-secondary">
                    {t.readingStatus}
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={selectedStatus}
                    className={SELECT}
                  >
                    <option value="">{t.allStatuses}</option>
                    {readingStatuses.map((s) => (
                      <option key={s} value={s}>
                        {t[s]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-secondary">
                    <input
                      type="checkbox"
                      name="favorite"
                      value="1"
                      defaultChecked={favoritesOnly}
                    />
                    {t.favoritesOnly}
                  </label>
                </>
              )}
              <button className={BUTTON} type="submit">
                {t.filter}
              </button>
            </form>
          )}

          {account &&
            (!personal ||
              shelfNotice === "unavailable" ||
              shelfNotice === "changed" ||
              shelfNotice === "saved") && (
              <p role="status" className="mt-4 text-sm text-secondary">
                {!personal || shelfNotice === "unavailable"
                  ? t.personalUnavailable
                  : shelfNotice === "changed"
                    ? t.personalChanged
                    : t.personalSaved}
              </p>
            )}
          {!profile && (
            <p className="mt-6 rounded-xl bg-fill px-4 py-3 text-sm text-secondary">
              {t.noProfile}
            </p>
          )}

          {shelf.matching.length === 0 ? (
            <p className="mt-10 text-secondary">
              {shelf.total === 0 ? t.empty : t.noMatches}
            </p>
          ) : (
            <ul className="mt-10 divide-y divide-separator">
              {shelf.matching.map((book) => {
                const readable = readableFormat(book);

                return (
                  <li
                    key={book.id}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <Cover book={book} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{book.title}</p>
                        <p className="mt-1 truncate text-sm text-secondary">
                          {book.authors.join(", ")}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-tertiary">
                          {[
                            book.published?.slice(0, 4),
                            book.publisher,
                            book.formats
                              .map(
                                (f) =>
                                  `${f.format.toUpperCase()} ${formatSize(f.size)}`,
                              )
                              .join(" · "),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>

                    <div className="flex max-w-full flex-wrap items-start gap-2">
                      {account && personal && (
                        <PersonalEntry
                          account={account}
                          bookId={book.id}
                          entry={personal.books.get(book.id)}
                          revision={personal.etag}
                          filters={params.toString()}
                          writable={!!storage.writeIfMatch}
                          t={t}
                        />
                      )}
                      {readable && (
                        <Link
                          href={`/read/${encodeKey(bookKey(book.id, readable.file))}`}
                          className={BUTTON_PRIMARY}
                        >
                          {positions?.[book.id] ? t.resume : t.read}
                        </Link>
                      )}
                      {book.formats.map((format) => (
                        <a
                          key={format.file}
                          href={`/download/${encodeKey(bookKey(book.id, format.file))}`}
                          download
                          className={BUTTON_QUIET}
                        >
                          {format.format.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <footer className="mt-8 border-t border-separator pt-4">
        <HomeScreenHelp />
      </footer>
    </main>
  );
}
