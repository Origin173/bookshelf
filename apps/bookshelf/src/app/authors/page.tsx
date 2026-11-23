import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { LanguageSwitch } from "@/app/language-switch";
import { SearchInput } from "@/app/search-input";
import { BUTTON_QUIET } from "@/app/ui";
import { messages } from "@/lib/i18n";
import { byAuthor } from "@/lib/opds/browse";
import { requirePageAccount } from "@/services/account-page";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";

export default async function Authors(props: PageProps<"/authors">) {
  await requirePageAccount();
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const needle = query.trim().toLowerCase();
  const { catalog } = await getServices();
  const t = await messages();
  const authors = await ifAvailable(async () =>
    byAuthor((await catalog.browse()).books),
  );
  const matching = authors?.filter(({ name }) =>
    name.toLowerCase().includes(needle),
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
        {t.authors}
      </h1>
      {authors && (authors.length > 0 || query) && (
        <SearchInput
          path="/authors"
          query={query}
          filters=""
          label={t.searchAuthors}
          searching={t.searching}
        />
      )}
      {!matching ? (
        <p className="mt-8 text-secondary">
          {t.unavailable}{" "}
          <a
            href={
              query
                ? `/authors?${new URLSearchParams({ q: query })}`
                : "/authors"
            }
            className={BUTTON_QUIET}
          >
            {t.retry}
          </a>
        </p>
      ) : matching.length === 0 ? (
        <p className="mt-8 text-secondary">
          {needle ? t.noMatchingAuthors : t.noAuthors}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-separator">
          {matching.map(({ name, books }) => (
            <li key={name}>
              <Link
                href={`/?${new URLSearchParams({ author: name })}`}
                prefetch={false}
                className="flex items-center justify-between gap-4 py-3 text-accent hover:underline"
              >
                <span className="min-w-0 break-words">{name}</span>
                <span className="shrink-0 text-sm text-secondary">
                  {t.authorBookCount(books.length)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
