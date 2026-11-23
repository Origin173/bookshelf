import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/app/language-switch";
import { BUTTON, BUTTON_PRIMARY, BUTTON_QUIET, INPUT } from "@/app/ui";
import { messages } from "@/lib/i18n";
import { requirePageAccount } from "@/services/account-page";
import { isAdmin } from "@/services/auth";
import { getServices } from "@/services/container";
import { ifAvailable } from "@/services/errors";
import { applySubjects, bookIdentity, subjectEdits } from "@/services/subjects";

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
  const { book: id, result } = await props.searchParams;
  const t = await messages();
  const data = await ifAvailable(async () => {
    const [published, snapshot] = await Promise.all([
      catalog.published(),
      subjectEdits(storage),
    ]);
    return applySubjects(published, snapshot);
  });
  const book = data?.books.find((b) => b.id === id);
  const notice =
    result === "saved" ||
    result === "invalid" ||
    result === "conflict" ||
    result === "unavailable"
      ? t[result]
      : undefined;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={id ? "/admin" : "/"}
          className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {id ? t.manage : t.shelf}
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="mt-6 break-words text-3xl font-semibold tracking-tight">
        {book ? book.title : t.manage}
      </h1>
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-fill px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      {!data ? (
        <p className="mt-8 text-secondary">
          {t.unavailable}{" "}
          <a
            className={BUTTON_QUIET}
            href={
              id ? `/admin?book=${encodeURIComponent(String(id))}` : "/admin"
            }
          >
            {t.retry}
          </a>
        </p>
      ) : book ? (
        <form
          action="/admin/subjects"
          method="post"
          className="mt-6 grid max-w-lg gap-3"
        >
          <input type="hidden" name="id" value={book.id} />
          <input type="hidden" name="identity" value={bookIdentity(book)} />
          <input type="hidden" name="revision" value={data.revision ?? ""} />
          <input
            type="hidden"
            name="generation"
            value={data.generatedAt ?? ""}
          />
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
      ) : id || data.books.length === 0 ? (
        <p className="mt-8 text-secondary">{id ? t.missing : t.empty}</p>
      ) : (
        <ul className="mt-8 divide-y divide-separator">
          {data.books.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{b.title}</p>
                <p className="text-sm text-secondary">{b.authors.join(", ")}</p>
              </div>
              <Link
                href={`/admin?book=${encodeURIComponent(b.id)}`}
                className={`${BUTTON} shrink-0`}
              >
                {t.edit}
                <span className="sr-only"> · {b.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
